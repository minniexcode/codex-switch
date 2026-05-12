import { validateManagedProfileCreation } from "../domain/config";
import { cleanProviderRecord } from "../domain/providers";
import { cliError } from "../domain/errors";
import { applyConfigMutation, createConfigMutationPlan, readStructuredConfig } from "../infra/config-repo";
import { ensureDir } from "../infra/fs-utils";
import { readProvidersFileIfExists, writeProvidersFile } from "../infra/providers-repo";
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
          baseUrl: args.baseUrl ?? undefined,
        }),
      }
    : undefined;

  const next = {
    providers: {
      ...providers.providers,
      [args.providerName]: cleanProviderRecord({
        profile: args.profile,
        apiKey: args.apiKey,
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
    ],
    mutate: () => {
      const configPlan = createConfigMutationPlan(document, {
        upsertProfiles,
      });
      // Persist only the normalized provider payload so later reads are deterministic.
      writeProvidersFile(args.providersPath, next);
      applyConfigMutation(args.configPath, document, configPlan);
      return {
        provider: args.providerName,
        profile: args.profile,
        createdProfileSections: configPlan.createdProfileSections,
        deletedProfileSections: configPlan.deletedProfileSections,
        keptSharedProfiles: [],
        switchedActiveProfile: configPlan.switchedActiveProfile,
        adoptedProfiles: [],
        repairedProfiles: [],
      };
    },
  });
}
