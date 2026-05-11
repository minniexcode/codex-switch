import { cliError } from "../domain/errors";
import { parseProfileNames, parseTopLevelProfile, replaceTopLevelProfile } from "../domain/config";
import { readRequiredFile, writeTextFileAtomic } from "./fs-utils";

export function readConfigFile(configPath: string): string {
  return readRequiredFile(configPath, "CONFIG_NOT_FOUND", "config.toml");
}

export function readCurrentProfile(configPath: string): string {
  const content = readConfigFile(configPath);
  const profile = parseTopLevelProfile(content);
  if (!profile) {
    throw cliError("PROFILE_NOT_FOUND", "No top-level profile is set in config.toml.", {
      file: configPath,
    });
  }
  return profile;
}

export function listConfigProfiles(configPath: string): Set<string> {
  return parseProfileNames(readConfigFile(configPath));
}

export function ensureProfileExists(configPath: string, profile: string, provider?: string): string {
  const configContent = readConfigFile(configPath);
  const profiles = parseProfileNames(configContent);
  if (!profiles.has(profile)) {
    throw cliError("PROFILE_NOT_FOUND", `Profile "${profile}" does not exist in config.toml.`, {
      file: configPath,
      provider,
      profile,
    });
  }
  return configContent;
}

export function updateTopLevelProfile(configPath: string, configContent: string, profile: string): void {
  writeTextFileAtomic(configPath, replaceTopLevelProfile(configContent, profile));
}
