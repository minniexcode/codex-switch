import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  ConfigMutationPlan,
  ManagedModelProviderFields,
  ManagedProfileFields,
  ManagedProfileView,
  ParsedConfigDocument,
  applyPatchOperations,
  buildManagedProfileViews,
  parseStructuredConfig,
  parseTopLevelProfile,
  planConfigMutation,
} from "../domain/config";
import { cliError, normalizeError } from "../domain/errors";
import { findProvidersByProfile, ProvidersFile } from "../domain/providers";
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
 * Resolves one profile view and enforces the managed model_provider contract.
 */
export function requireManagedProfileRuntime(
  document: ParsedConfigDocument,
  providers: ProvidersFile | null,
  profile: string
): ManagedProfileView {
  const view = buildManagedProfileViews(document, providers).find((entry) => entry.name === profile);
  if (!view) {
    throw cliError("PROFILE_NOT_FOUND", `Profile "${profile}" does not exist in config.toml.`, {
      profile,
    });
  }
  if (!view.modelProvider) {
    throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Managed profile "${profile}" requires model_provider.`, {
      profile,
      missingFields: ["model_provider"],
    });
  }
  if (view.modelProvider !== profile) {
    throw cliError("INVALID_ARGUMENT", `Managed profile "${profile}" must use the same model_provider name.`, {
      profile,
      modelProvider: view.modelProvider,
    });
  }
  const modelProviderSection = document.modelProviders.find((entry) => entry.name === view.modelProvider);
  if (!modelProviderSection) {
    throw cliError("PROFILE_NOT_FOUND", `Model provider "${view.modelProvider}" does not exist in config.toml.`, {
      profile,
      modelProvider: view.modelProvider,
    });
  }
  if (!modelProviderSection.baseUrl) {
    throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Model provider "${view.modelProvider}" requires base_url.`, {
      profile,
      modelProvider: view.modelProvider,
      missingFields: ["base_url"],
    });
  }
  if (!modelProviderSection.envKey) {
    throw cliError("MODEL_PROVIDER_ENV_KEY_MISSING", `Model provider "${view.modelProvider}" requires env_key.`, {
      profile,
      modelProvider: view.modelProvider,
      missingFields: ["env_key"],
    });
  }
  return view;
}

/**
 * Verifies that a same-named model_provider runtime section exists and has base_url.
 */
export function requireModelProviderRuntimeSection(document: ParsedConfigDocument, profile: string): void {
  const modelProviderSection = document.modelProviders.find((entry) => entry.name === profile);
  if (!modelProviderSection) {
    throw cliError("PROFILE_NOT_FOUND", `Model provider "${profile}" does not exist in config.toml.`, {
      profile,
      modelProvider: profile,
    });
  }
  if (!modelProviderSection.baseUrl) {
    throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Model provider "${profile}" requires base_url.`, {
      profile,
      modelProvider: profile,
      missingFields: ["base_url"],
    });
  }
  if (!modelProviderSection.envKey) {
    throw cliError("MODEL_PROVIDER_ENV_KEY_MISSING", `Model provider "${profile}" requires env_key.`, {
      profile,
      modelProvider: profile,
      missingFields: ["env_key"],
    });
  }
}

/**
 * Returns the runtime env_key for one profile or throws a typed error.
 */
export function requireRuntimeEnvKey(document: ParsedConfigDocument, profile: string): string {
  const modelProviderSection = document.modelProviders.find((entry) => entry.name === profile);
  if (!modelProviderSection) {
    throw cliError("PROFILE_NOT_FOUND", `Model provider "${profile}" does not exist in config.toml.`, {
      profile,
      modelProvider: profile,
    });
  }
  if (!modelProviderSection.envKey) {
    throw cliError("MODEL_PROVIDER_ENV_KEY_MISSING", `Model provider "${profile}" requires env_key.`, {
      profile,
      modelProvider: profile,
      missingFields: ["env_key"],
    });
  }
  return modelProviderSection.envKey;
}

/**
 * Resolves the current active provider and requires the mapping to be unique.
 */
export function resolveActiveProviderName(document: ParsedConfigDocument, providers: ProvidersFile): string {
  if (!document.activeProfile) {
    throw cliError("PROFILE_NOT_FOUND", "No top-level profile is set in config.toml.");
  }
  const matches = findProvidersByProfile(providers, document.activeProfile);
  if (matches.length === 0) {
    throw cliError("UNMANAGED_ACTIVE_PROFILE", `Active profile "${document.activeProfile}" is not mapped by providers.json.`, {
      profile: document.activeProfile,
    });
  }
  if (matches.length > 1) {
    throw cliError("ACTIVE_PROVIDER_UNRESOLVED", `Active profile "${document.activeProfile}" maps to multiple providers.`, {
      profile: document.activeProfile,
      providers: matches,
    });
  }
  return matches[0];
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
    upsertModelProviders?: Record<string, Partial<ManagedModelProviderFields>>;
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
