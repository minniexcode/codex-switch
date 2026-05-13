import * as fs from "node:fs";
import { collectConfigConsistencyIssues, ConfigConsistencyIssue, ParsedConfigDocument } from "../domain/config";
import { getStorageRoles, inspectLiveStateDrift } from "../domain/runtime-state";
import { readStructuredConfig } from "../storage/config-repo";
import { readProvidersFile } from "../storage/providers-repo";
import { normalizeError } from "../domain/errors";
import { CommandResult } from "./types";
import { probeCodexRuntime } from "../runtime/codex-probe";

/**
 * Performs consistency checks across config.toml, providers.json, and the local Codex CLI.
 */
export function runDoctor(args: {
  codexDir: string;
  configPath: string;
  providersPath: string;
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
    },
    warnings: issues.length === 0 ? [] : [`doctor found ${issues.length} issue(s)`],
  };
}

function renderConfigIssueMessage(issue: ConfigConsistencyIssue): string {
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
    case "DESTRUCTIVE_REMOVE_BLOCKED":
      return `Provider "${issue.provider}" cannot be removed while "${issue.activeProfile}" remains active.`;
  }
}
