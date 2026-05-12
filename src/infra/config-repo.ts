import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  ConfigMutationPlan,
  ManagedProfileFields,
  ParsedConfigDocument,
  applyPatchOperations,
  parseStructuredConfig,
  parseTopLevelProfile,
  planConfigMutation,
} from "../domain/config";
import { cliError, normalizeError } from "../domain/errors";
import { CODEX_DIR_ENV_NAME, resolveCodexDir } from "./codex-paths";
import { readRequiredFile, writeTextFileAtomic } from "./fs-utils";

/**
 * Reads config.toml and throws a typed error when the file is missing.
 */
export function readConfigFile(configPath: string): string {
  return readRequiredFile(configPath, "CONFIG_NOT_FOUND", "config.toml");
}

/**
 * Reads and parses config.toml into the managed structured document shape.
 */
export function readStructuredConfig(configPath: string): ParsedConfigDocument {
  const content = readConfigFile(configPath);
  try {
    return parseStructuredConfig(content);
  } catch (error: unknown) {
    throw cliError("CONFIG_PARSE_ERROR", "Failed to parse config.toml.", {
      file: configPath,
      cause: normalizeError(error).message,
    });
  }
}

/**
 * Reads the active top-level profile from config.toml.
 */
export function readCurrentProfile(configPath: string): string {
  const profile = readStructuredConfig(configPath).activeProfile ?? parseTopLevelProfile(readConfigFile(configPath));
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
  return new Set(readStructuredConfig(configPath).profiles.map((profile) => profile.name));
}

/**
 * Verifies that a provider's target profile exists before a switch operation proceeds.
 */
export function ensureProfileExists(configPath: string, profile: string, provider?: string): ParsedConfigDocument {
  const document = readStructuredConfig(configPath);
  if (!document.profiles.some((entry) => entry.name === profile)) {
    throw cliError("PROFILE_NOT_FOUND", `Profile "${profile}" does not exist in config.toml.`, {
      file: configPath,
      provider,
      profile,
    });
  }
  return document;
}

/**
 * Rewrites config.toml so the requested profile becomes the active top-level profile.
 */
export function updateTopLevelProfile(configPath: string, configContent: string, profile: string): void {
  writeTextFileAtomic(configPath, applyPatchOperations(configContent, planConfigMutation(parseStructuredConfig(configContent), {
    setActiveProfile: profile,
  }).operations));
}

/**
 * Exposes the config mutation planner to application services.
 */
export function createConfigMutationPlan(
  document: ParsedConfigDocument,
  args: {
    setActiveProfile?: string | null;
    upsertProfiles?: Record<string, Partial<ManagedProfileFields>>;
    deleteProfiles?: string[];
  }
): ConfigMutationPlan {
  return planConfigMutation(document, args);
}

/**
 * Applies a previously generated mutation plan to config.toml in one write.
 */
export function applyConfigMutation(configPath: string, document: ParsedConfigDocument, plan: ConfigMutationPlan): void {
  writeTextFileAtomic(configPath, applyPatchOperations(document.rawText, plan.operations));
}

/**
 * Finds candidate Codex directories in a stable, non-recursive order.
 */
export function findCodexDirCandidates(explicitCodexDir?: string | null): string[] {
  if (explicitCodexDir) {
    return [resolveCodexDir(explicitCodexDir)];
  }

  const candidates = new Set<string>();
  const ordered: string[] = [];
  const envCandidate = process.env[CODEX_DIR_ENV_NAME];
  if (envCandidate) {
    ordered.push(resolveCodexDir(envCandidate));
  }
  if (process.env.NODE_ENV === "development") {
    ordered.push(path.resolve(process.cwd(), "dev-codex", "local-sandbox"));
  }
  ordered.push(path.join(os.homedir(), ".codex"));

  for (const candidate of ordered) {
    if (!candidate || candidates.has(candidate) || !fs.existsSync(candidate)) {
      continue;
    }
    candidates.add(candidate);
  }

  return [...candidates];
}
