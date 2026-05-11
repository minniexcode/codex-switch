import * as fs from "node:fs";
import { parseTopLevelProfile } from "../domain/config";
import { findProviderByProfile } from "../domain/providers";
import { readProvidersFile } from "../infra/providers-repo";
import { CommandResult } from "./types";

export function getStatus(codexDir: string, configPath: string, providersPath: string): CommandResult {
  const configExists = fs.existsSync(configPath);
  const providersExists = fs.existsSync(providersPath);
  let currentProfile: string | null = null;
  let mappedProvider: string | null = null;
  const warnings: string[] = [];

  if (configExists) {
    const configContent = fs.readFileSync(configPath, "utf8");
    currentProfile = parseTopLevelProfile(configContent);
    if (!currentProfile) {
      warnings.push("config.toml exists but has no top-level profile.");
    }
  }

  if (providersExists && currentProfile) {
    mappedProvider = findProviderByProfile(readProvidersFile(providersPath), currentProfile);
  }

  return {
    warnings,
    data: {
      codexDir,
      configExists,
      providersExists,
      currentProfile,
      currentProfileMapped: mappedProvider !== null,
      provider: mappedProvider,
    },
  };
}
