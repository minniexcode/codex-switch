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

/**
 * Performs consistency checks across config.toml, providers.json, and the local Codex CLI.
 */
export async function runDoctor(args: {
  codexDir: string;
  configPath: string;
  providersPath: string;
  authPath: string;
}): Promise<CommandResult> {
  const issues: Array<Record<string, unknown>> = [];
  let currentProfile: string | null = null;
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
    currentProfile = document.activeProfile;
    if (!currentProfile) {
      issues.push({
        code: "PROFILE_NOT_FOUND",
        message: "config.toml has no top-level profile.",
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
  const runtimeStateInspection = inspectCopilotBridgeState();
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
    });
  }

  if (document?.activeProfile && providers) {
    const matches = findProvidersByProfile(providers, document.activeProfile);
    if (matches.length === 1) {
      const activeProvider = providers.providers[matches[0]];
      if (isCopilotBridgeProvider(activeProvider)) {
        const installStatus = probeCopilotSdkInstall();
        if (!installStatus.installed) {
          issues.push({
            code: "COPILOT_SDK_MISSING",
            message: "The optional Copilot SDK runtime is not installed.",
            installDir: installStatus.installDir,
            packageName: installStatus.packageName,
          });
        }
        try {
          await readCopilotAuthState();
        } catch (error: unknown) {
          const normalized = normalizeError(error);
          issues.push({
            code: normalized.code,
            message: normalized.message,
            ...(normalized.details ?? {}),
          });
        }
        const bridge = await probeCopilotBridgeRuntime(activeProvider, runtimeState);
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
    } else if (!document?.activeProfile || runtimeProvider.profile !== document.activeProfile) {
      issues.push({
        code: "BRIDGE_STATE_STALE",
        message: "Copilot bridge runtime state exists for a provider that is not the current active profile.",
        activeProfile: document?.activeProfile ?? null,
        runtimeProvider: runtimeState.provider,
        runtimeProfile: runtimeProvider.profile,
        ...runtimeState,
      });
    }
  }

  // Drift inspection still runs when files are missing so status output can explain partial state.
  const drift = inspectLiveStateDrift(currentProfile, providers);

  const codexCheck = probeCodexRuntime();
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
      storage: getStorageRoles(),
      liveState: drift,
      auth: authState,
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
    case "ORPHANED_PROFILE_REFERENCE":
      return `Profile "${issue.profile}" is referenced by providers but missing from config.toml.`;
    case "UNMANAGED_ACTIVE_PROFILE":
      return `Active profile "${issue.profile}" is not mapped by providers.json.`;
    case "SHARED_PROFILE_REFERENCE":
      return `Profile "${issue.profile}" is shared by multiple providers.`;
    case "ORPHANED_PROFILE_SECTION":
      return `Profile section "${issue.profile}" is not linked to any provider.`;
    case "MODEL_PROVIDER_MISSING":
      return `Profile "${issue.profile}" is missing model_provider.`;
    case "MODEL_PROVIDER_NAME_MISMATCH":
      return `Profile "${issue.profile}" must use matching model_provider name "${issue.profile}", found "${issue.modelProvider}".`;
    case "MODEL_PROVIDER_SECTION_MISSING":
      return `Model provider section "${issue.modelProvider}" for profile "${issue.profile}" is missing from config.toml.`;
    case "MODEL_PROVIDER_BASE_URL_MISSING":
      return `Model provider section "${issue.modelProvider}" for profile "${issue.profile}" is missing base_url.`;
    case "ACTIVE_PROVIDER_UNRESOLVED":
      return `Active profile "${issue.profile}" maps to multiple providers, so the active managed provider cannot be resolved uniquely.`;
    case "AUTH_JSON_INVALID":
      return String((issue as { reason?: string; message?: string }).message ?? (issue as { reason?: string }).reason ?? "auth.json is invalid.");
    case "DESTRUCTIVE_REMOVE_BLOCKED":
      return `Provider "${issue.provider}" cannot be removed while "${issue.activeProfile}" remains active.`;
    default:
      return String((issue as { code?: string }).code ?? "UNKNOWN_ISSUE");
  }
}
