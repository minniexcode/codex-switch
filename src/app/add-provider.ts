import { buildManagedProfileEnvKey, validateManagedProfileCreation } from "../domain/config";
import { cleanProviderRecord } from "../domain/providers";
import { cliError } from "../domain/errors";
import {
  applyConfigMutation,
  createConfigMutationPlan,
  readStructuredConfig,
  requireRuntimeEnvKey,
  requireManagedProfileRuntime,
    resolveActiveProviderName,
  } from "../storage/config-repo";
import { ensureDir } from "../storage/fs-utils";
import { readProvidersFileIfExists, writeProvidersFile } from "../storage/providers-repo";
import { readAuthFileIfExists, writeAuthFile } from "../storage/auth-repo";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Adds a new provider record to the managed providers registry.
 */
export function addProvider(args: {
  codexDir: string;
  backupsDir: string;
  latestBackupPath: string;
  providersPath: string;
  configPath: string;
  authPath: string;
  providerName: string;
  profile: string;
  apiKey: string;
  baseUrl?: string | null;
  model?: string | null;
  note?: string | null;
  tags: string[];
  createProfile?: boolean;
}): CommandResult {
  ensureDir(args.codexDir);
  const providers = readProvidersFileIfExists(args.providersPath);
  if (providers.providers[args.providerName]) {
    throw cliError("INVALID_IMPORT_FILE", `Provider "${args.providerName}" already exists.`);
  }
  const document = readStructuredConfig(args.configPath);
  const existingProfile = document.profiles.find((profile) => profile.name === args.profile);
  const existingModelProvider = document.modelProviders.find((entry) => entry.name === args.profile);
  if (!existingProfile && !args.createProfile) {
    throw cliError("PROFILE_NOT_FOUND", `Profile "${args.profile}" does not exist in config.toml.`, {
      profile: args.profile,
      provider: args.providerName,
    });
  }
  const upsertProfiles = !existingProfile && args.createProfile
    ? {
        [args.profile]: validateManagedProfileCreation(args.profile, {
          model: args.model ?? undefined,
          modelProvider: args.profile,
        }),
      }
    : undefined;
  const upsertModelProviders = !existingModelProvider && args.createProfile
    ? {
        [args.profile]: {
          baseUrl: args.baseUrl ?? undefined,
          envKey: buildManagedProfileEnvKey(args.profile),
        },
      }
    : undefined;
  if (existingProfile) {
    requireManagedProfileRuntime(document, providers, args.profile);
  }
  const envKey = existingModelProvider?.envKey ?? buildManagedProfileEnvKey(args.profile);

  const next = {
    providers: {
      ...providers.providers,
      [args.providerName]: cleanProviderRecord({
        profile: args.profile,
        apiKey: args.apiKey,
        envKey,
        baseUrl: args.baseUrl ?? undefined,
        note: args.note ?? undefined,
        tags: args.tags,
      }),
    },
  };

  return runMutation({
    codexDir: args.codexDir,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "add",
    files: [
      { absolutePath: args.providersPath, relativePath: "providers.json" },
      { absolutePath: args.configPath, relativePath: "config.toml" },
      { absolutePath: args.authPath, relativePath: "auth.json" },
    ],
    mutate: () => {
      const configPlan = createConfigMutationPlan(document, {
        upsertProfiles,
        upsertModelProviders,
      });
      // Persist only the normalized provider payload so later reads are deterministic.
      writeProvidersFile(args.providersPath, next);
      applyConfigMutation(args.configPath, document, configPlan);
      if (document.activeProfile === args.profile) {
        const activeProviderName = resolveActiveProviderName(document, next);
        const existingAuth = readAuthFileIfExists(args.authPath);
        writeAuthFile(args.authPath, next.providers[activeProviderName], existingAuth ?? undefined);
      }
        return {
          provider: args.providerName,
          profile: args.profile,
          envKey,
          createdProfileSections: configPlan.createdProfileSections,
          createdModelProviderSections: configPlan.createdModelProviderSections,
          deletedProfileSections: configPlan.deletedProfileSections,
          keptSharedProfiles: [],
          switchedActiveProfile: configPlan.switchedActiveProfile,
        adoptedProfiles: [],
        repairedProfiles: [],
      };
    },
  });
}
