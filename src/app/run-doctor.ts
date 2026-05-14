import * as fs from "node:fs";
import { collectConfigConsistencyIssues, ConfigConsistencyIssue, ParsedConfigDocument } from "../domain/config";
import { getStorageRoles, inspectLiveStateDrift } from "../domain/runtime-state";
import { readStructuredConfig } from "../storage/config-repo";
import { readProvidersFile } from "../storage/providers-repo";
import { normalizeError } from "../domain/errors";
import { CommandResult } from "./types";
import { probeCodexRuntime } from "../runtime/codex-probe";
import { readManagedAuthState } from "../storage/auth-repo";
import { findProvidersByProfile } from "../domain/providers";

/**
 * Performs consistency checks across config.toml, providers.json, and the local Codex CLI.
 */
export function runDoctor(args: {
  codexDir: string;
  configPath: string;
  providersPath: string;
  authPath: string;
}): CommandResult {
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

  const authState = readManagedAuthState(args.authPath);
  if (authState.exists && !authState.valid) {
    issues.push({
      code: "AUTH_JSON_INVALID",
      message: authState.parseError ?? "auth.json is invalid.",
      file: args.authPath,
    });
  }

  if (document?.activeProfile && providers) {
    const matches = findProvidersByProfile(providers, document.activeProfile);
    if (matches.length === 1) {
      const activeProvider = providers.providers[matches[0]];
      const payload = authState.payload ?? {};
      const actualKeys = authState.managedSecretKeys;
      if (authState.authMode !== null && authState.authMode !== "apikey") {
        issues.push({
          code: "AUTH_JSON_INVALID",
          message: `auth.json auth_mode must be "apikey", found "${authState.authMode}".`,
        });
      }
      if (!actualKeys.includes(activeProvider.envKey) || actualKeys.length !== 1) {
        issues.push({
          code: "AUTH_JSON_ENV_KEY_MISMATCH",
          message: `auth.json managed env key does not match active provider "${matches[0]}".`,
          provider: matches[0],
          expectedEnvKey: activeProvider.envKey,
          actualEnvKeys: actualKeys,
        });
      }
      if ((payload as Record<string, unknown>)[activeProvider.envKey] !== activeProvider.apiKey) {
        issues.push({
          code: "AUTH_JSON_APIKEY_MISMATCH",
          message: `auth.json secret value does not match active provider "${matches[0]}".`,
          provider: matches[0],
        });
      }
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
    case "MODEL_PROVIDER_ENV_KEY_MISSING":
      return `Model provider section "${issue.modelProvider}" for profile "${issue.profile}" is missing env_key.`;
    case "PROVIDER_ENV_KEY_MISMATCH":
      return `Provider "${issue.provider}" envKey does not match runtime env_key for profile "${issue.profile}".`;
    case "ACTIVE_PROVIDER_UNRESOLVED":
      return `Active profile "${issue.profile}" maps to multiple providers and cannot determine the current auth mirror owner.`;
    case "AUTH_JSON_INVALID":
      return String((issue as { reason?: string; message?: string }).message ?? (issue as { reason?: string }).reason ?? "auth.json is invalid.");
    case "AUTH_JSON_ENV_KEY_MISMATCH":
      return `auth.json managed env key does not match provider "${String((issue as { provider?: string }).provider ?? "")}".`;
    case "AUTH_JSON_APIKEY_MISMATCH":
      return `auth.json secret does not match provider "${String((issue as { provider?: string }).provider ?? "")}".`;
    case "DESTRUCTIVE_REMOVE_BLOCKED":
      return `Provider "${issue.provider}" cannot be removed while "${issue.activeProfile}" remains active.`;
    default:
      return String((issue as { code?: string }).code ?? "UNKNOWN_ISSUE");
  }
}
