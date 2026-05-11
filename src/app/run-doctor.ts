import * as fs from "node:fs";
import { parseProfileNames, parseTopLevelProfile } from "../domain/config";
import { getStorageRoles, inspectLiveStateDrift } from "../domain/runtime-state";
import { checkCodexAvailable } from "../infra/codex-cli";
import { readProvidersFile } from "../infra/providers-repo";
import { normalizeError } from "../domain/errors";
import { CommandResult } from "./types";

/**
 * Performs consistency checks across config.toml, providers.json, and the local Codex CLI.
 */
export function runDoctor(args: {
  codexDir: string;
  configPath: string;
  providersPath: string;
}): CommandResult {
  const issues: Array<Record<string, unknown>> = [];
  let configProfiles: Set<string> = new Set();
  let currentProfile: string | null = null;
  let providers = null;

  if (!fs.existsSync(args.configPath)) {
    issues.push({
      code: "CONFIG_NOT_FOUND",
      message: "config.toml does not exist.",
      file: args.configPath,
    });
  } else {
    const configContent = fs.readFileSync(args.configPath, "utf8");
    configProfiles = parseProfileNames(configContent);
    currentProfile = parseTopLevelProfile(configContent);
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
      // Every managed provider must map to a profile that still exists in config.toml.
      for (const [name, provider] of Object.entries(providers.providers)) {
        if (!configProfiles.has(provider.profile)) {
          issues.push({
            code: "PROFILE_NOT_FOUND",
            message: `Provider "${name}" maps to missing profile "${provider.profile}".`,
            provider: name,
            profile: provider.profile,
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
  if (drift.canBackfillActiveProvider) {
    // Distinguish unmanaged live state from hard parse/configuration errors.
    issues.push({
      code: "LIVE_STATE_DRIFT",
      message: `Active profile "${drift.currentProfile}" is present in config.toml but not mapped by providers.json.`,
      currentProfile: drift.currentProfile,
      suggestedAction: "backfill-active-provider",
      storage: getStorageRoles(),
    });
  }

  const codexCheck = checkCodexAvailable();
  if (!codexCheck.ok) {
    issues.push({
      code: "CODEX_LOGIN_FAILED",
      message: "codex CLI is not available.",
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
