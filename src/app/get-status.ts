import * as fs from "node:fs";
import { buildManagedProfileViews, collectConfigConsistencyIssues } from "../domain/config";
import { getStorageRoles, inspectLiveStateDrift } from "../domain/runtime-state";
import { readStructuredConfig } from "../storage/config-repo";
import { readProvidersFile } from "../storage/providers-repo";
import { CommandResult } from "./types";

/**
 * Reports the current on-disk runtime state and how it maps back to managed providers.
 */
export function getStatus(codexDir: string, configPath: string, providersPath: string): CommandResult {
  const configExists = fs.existsSync(configPath);
  const providersExists = fs.existsSync(providersPath);
  let currentProfile: string | null = null;
  const warnings: string[] = [];
  const providers = providersExists ? readProvidersFile(providersPath) : null;
  let configViews: ReturnType<typeof buildManagedProfileViews> = [];
  let consistencyIssues: ReturnType<typeof collectConfigConsistencyIssues> = [];

  if (configExists) {
    const document = readStructuredConfig(configPath);
    currentProfile = document.activeProfile;
    configViews = buildManagedProfileViews(document, providers);
    consistencyIssues = collectConfigConsistencyIssues(document, providers);
    if (!currentProfile) {
      warnings.push("config.toml exists but has no top-level profile.");
    }
  }

  const liveState = inspectLiveStateDrift(currentProfile, providers);
  if (liveState.canBackfillActiveProvider) {
    // Surface unmanaged live state without mutating anything during a read-only status call.
    warnings.push("Current config profile is not mapped in providers.json. Backfill would be required before treating live state as managed.");
  }

  return {
    warnings,
    data: {
      codexDir,
      storage: getStorageRoles(),
      configExists,
      providersExists,
      currentProfile,
      currentProfileMapped: liveState.profileMapped,
      provider: liveState.mappedProvider,
      liveState,
      configProfiles: configViews,
      issues: consistencyIssues,
    },
  };
}
