import * as fs from "node:fs";
import { collectConfigConsistencyIssues, ConfigConsistencyIssue, ParsedConfigDocument } from "../domain/config";
import { getStorageRoles, inspectLiveStateDrift } from "../domain/runtime-state";
import { readStructuredConfig } from "../storage/config-repo";
import { readProvidersFile } from "../storage/providers-repo";
import { normalizeError } from "../domain/errors";
import { CommandResult } from "./types";
import { probeCodexRuntime } from "../runtime/codex-probe";
import { readAuthFileState } from "../storage/auth-repo";
import { findProvidersByProfile, isCopilotBridgeProvider } from "../domain/providers";
import { probeCopilotSdkInstall } from "../runtime/copilot-installer";
import { probeCopilotBridgeRuntime } from "../runtime/copilot-bridge";
import { readCopilotAuthState } from "../runtime/copilot-adapter";
import { inspectCopilotBridgeState } from "../storage/runtime-state-repo";
import { MIN_SUPPORTED_CODEX_VERSION } from "../runtime/codex-version";

/**
 * Performs consistency checks across config.toml, providers.json, and the local Codex CLI.
 */
export async function runDoctor(args: {
  codexDir: string;
  configPath: string;
  providersPath: string;
  authPath: string;
  runtimeDir?: string;
  runtimesDir?: string;
}): Promise<CommandResult> {
  const issues: Array<Record<string, unknown>> = [];
  let currentModelProvider: string | null = null;
  let providers = null;
  let document: ParsedConfigDocument | null = null;

  if (!fs.existsSync(args.configPath)) {
    issues.push({
      code: "CONFIG_NOT_FOUND",
      message: "config.toml does not exist.",
      file: args.configPath,
    });
  } else {
    document = readStructuredConfig(args.configPath);
    currentModelProvider = document.currentModelProvider;
    if (!currentModelProvider) {
      issues.push({
        code: "MODEL_PROVIDER_MISSING",
        message: "config.toml has no top-level model_provider.",
        file: args.configPath,
      });
    }
  }

  if (!fs.existsSync(args.providersPath)) {
    issues.push({
      code: "PROVIDERS_NOT_FOUND",
      message: "providers.json does not exist.",
      file: args.providersPath,
    });
  } else {
    try {
      providers = readProvidersFile(args.providersPath);
      if (document) {
        // Preserve domain issue codes while translating them into user-facing diagnostic messages.
        for (const issue of collectConfigConsistencyIssues(document, providers)) {
          issues.push({
            ...issue,
            message: renderConfigIssueMessage(issue),
          });
        }
      }
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      issues.push({
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details ?? {}),
      });
    }
  }

  const authState = readAuthFileState(args.authPath);
  const runtimeStateInspection = inspectCopilotBridgeState(args.runtimeDir);
  const runtimeState = runtimeStateInspection.state;
  if (authState.exists && !authState.valid) {
    issues.push({
      code: "AUTH_JSON_INVALID",
      message: authState.parseError ?? "auth.json is invalid.",
      file: args.authPath,
    });
  }
  if (runtimeStateInspection.exists && !runtimeStateInspection.valid) {
    issues.push({
      code: "BRIDGE_STATE_STALE",
      message: `Copilot bridge runtime state is unreadable: ${runtimeStateInspection.parseError ?? "unknown parse failure"}`,
      logPath: runtimeState?.logPath ?? null,
    });
  }

  if (document?.currentModelProvider && providers) {
    const matches = findProvidersByProfile(providers, document.currentModelProvider);
    if (matches.length === 1) {
      const activeProvider = providers.providers[matches[0]];
      if (isCopilotBridgeProvider(activeProvider)) {
        const installStatus = probeCopilotSdkInstall(args.runtimesDir);
        if (!installStatus.installed) {
          issues.push({
            code: "COPILOT_SDK_MISSING",
            message: "The optional Copilot SDK runtime is not installed.",
            installDir: installStatus.installDir,
            packageName: installStatus.packageName,
          });
        }
        try {
          await readCopilotAuthState(args.runtimesDir);
        } catch (error: unknown) {
          const normalized = normalizeError(error);
          issues.push({
            code: normalized.code,
            message: normalized.message,
            ...(normalized.details ?? {}),
          });
        }
        const bridge = await probeCopilotBridgeRuntime(activeProvider, runtimeState, args.runtimeDir);
        if (!bridge.ok) {
          issues.push({
            code: mapBridgeDiagnosticCode(bridge.cause),
            message: bridge.cause,
            ...(bridge.details ?? {}),
          });
        }
      }
    }
  }

  if (runtimeState && providers) {
    const runtimeProvider = providers.providers[runtimeState.provider] ?? null;
    if (!runtimeProvider || !isCopilotBridgeProvider(runtimeProvider)) {
      issues.push({
        code: "BRIDGE_STATE_STALE",
        message: "Copilot bridge runtime state exists but no matching managed Copilot provider is available.",
        ...runtimeState,
      });
    } else if (!document?.currentModelProvider || runtimeProvider.profile !== document.currentModelProvider) {
      issues.push({
        code: "BRIDGE_STATE_STALE",
        message: "Copilot bridge runtime state exists for a provider that is not the current active model_provider.",
        activeModelProvider: document?.currentModelProvider ?? null,
        runtimeProvider: runtimeState.provider,
        runtimeProfile: runtimeProvider.profile,
        ...runtimeState,
      });
    }
  }

  // Drift inspection still runs when files are missing so status output can explain partial state.
  const drift = inspectLiveStateDrift(currentModelProvider, providers);

  const codexCheck = probeCodexRuntime(MIN_SUPPORTED_CODEX_VERSION);
  if (!codexCheck.ok) {
    const message =
      codexCheck.reason === "missing"
        ? "codex CLI is not available on PATH."
        : codexCheck.reason === "unsupported"
          ? "codex CLI version is below the supported minimum."
          : "codex CLI probe failed.";
    issues.push({
      code:
        codexCheck.reason === "unsupported"
          ? "CODEX_VERSION_UNSUPPORTED"
          : codexCheck.reason === "missing"
            ? "CODEX_NOT_INSTALLED"
            : "CODEX_LOGIN_FAILED",
      message,
      cause: codexCheck.cause,
    });
  }

  return {
    data: {
      healthy: issues.length === 0,
      issues,
      codexDir: args.codexDir,
      storage: getStorageRoles({
        codexDir: args.codexDir,
        providersPath: args.providersPath,
        configPath: args.configPath,
        authPath: args.authPath,
        runtimeDir: args.runtimeDir,
        runtimesDir: args.runtimesDir,
      }),
      liveState: drift,
      auth: authState,
      copilotRuntimeState: runtimeState,
    },
    warnings: issues.length === 0 ? [] : [`doctor found ${issues.length} issue(s)`],
  };
}

function mapBridgeDiagnosticCode(cause: string): string {
  if (cause === "Copilot bridge state manifest is missing.") {
    return "BRIDGE_STATE_MISSING";
  }
  if (cause === "Copilot bridge runtime state exists but no active Copilot bridge provider is selected.") {
    return "BRIDGE_STATE_STALE";
  }
  if (cause === "Copilot bridge state base URL does not match the provider runtime configuration.") {
    return "PROVIDER_BASE_URL_MISMATCH";
  }
  return "BRIDGE_HEALTHCHECK_FAILED";
}

/**
 * Maps structured config consistency issues onto stable human-readable diagnostic text.
 */
function renderConfigIssueMessage(issue: ConfigConsistencyIssue | Record<string, unknown>): string {
  switch (issue.code) {
    case "MODEL_MISSING":
      return "Top-level model is missing from config.toml.";
    case "MODEL_PROVIDER_MISSING":
      return "Top-level model_provider is missing from config.toml.";
    case "MODEL_PROVIDER_SECTION_MISSING":
      return `Model provider section "${issue.modelProvider}" is missing from config.toml.`;
    case "MODEL_PROVIDER_BASE_URL_MISSING":
      return `Model provider section "${issue.modelProvider}" is missing base_url.`;
    case "LEGACY_PROFILE_SELECTOR":
      return `Legacy top-level profile selector "${issue.profile}" is still present.`;
    case "LEGACY_PROFILE_SECTION":
      return `Legacy profile section "${issue.profile}" is still present.`;
    case "LEGACY_MODEL_PROVIDER_ENV_KEY":
      return `Model provider "${issue.modelProvider}" still contains legacy env_key wiring.`;
    case "PROVIDER_BASE_URL_MISMATCH":
      return issue.providerType === "direct"
        ? `Direct provider "${issue.provider}" baseUrl does not match config.toml model provider "${issue.modelProvider}" base_url.`
        : String((issue as { code?: string }).code ?? "UNKNOWN_ISSUE");
    case "AUTH_JSON_INVALID":
      return String((issue as { reason?: string; message?: string }).message ?? (issue as { reason?: string }).reason ?? "auth.json is invalid.");
    case "DESTRUCTIVE_REMOVE_BLOCKED":
      return `Provider "${issue.provider}" cannot be removed while "${issue.activeModelProvider}" remains active.`;
    default:
      return String((issue as { code?: string }).code ?? "UNKNOWN_ISSUE");
  }
}
