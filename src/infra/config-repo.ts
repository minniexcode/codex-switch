import { cliError } from "../domain/errors";
import { parseProfileNames, parseTopLevelProfile, replaceTopLevelProfile } from "../domain/config";
import { readRequiredFile, writeTextFileAtomic } from "./fs-utils";

/**
 * Reads config.toml and throws a typed error when the file is missing.
 */
export function readConfigFile(configPath: string): string {
  return readRequiredFile(configPath, "CONFIG_NOT_FOUND", "config.toml");
}

/**
 * Reads the active top-level profile from config.toml.
 */
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

/**
 * Lists all named profile sections declared in config.toml.
 */
export function listConfigProfiles(configPath: string): Set<string> {
  return parseProfileNames(readConfigFile(configPath));
}

/**
 * Verifies that a provider's target profile exists before a switch operation proceeds.
 */
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

/**
 * Rewrites config.toml so the requested profile becomes the active top-level profile.
 */
export function updateTopLevelProfile(configPath: string, configContent: string, profile: string): void {
  writeTextFileAtomic(configPath, replaceTopLevelProfile(configContent, profile));
}
