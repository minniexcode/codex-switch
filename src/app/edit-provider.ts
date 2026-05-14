import { cliError } from "../domain/errors";
import { buildManagedProfileEnvKey, planProfileLifecycleOutcome, validateManagedProfileCreation } from "../domain/config";
import { cleanProviderRecord } from "../domain/providers";
import {
  applyConfigMutation,
  createConfigMutationPlan,
  readStructuredConfig,
  requireRuntimeEnvKey,
  requireManagedProfileRuntime,
  resolveActiveProviderName,
} from "../storage/config-repo";
import { ensureDir } from "../storage/fs-utils";
import { readProvidersFile, writeProvidersFile } from "../storage/providers-repo";
import { readAuthFileIfExists, writeAuthFile } from "../storage/auth-repo";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Updates selected fields on a single managed provider.
 */
export function editProvider(args: {
  codexDir: string;
  backupsDir: string;
  latestBackupPath: string;
  providersPath: string;
  configPath: string;
  authPath: string;
  providerName: string;
  profile?: string | null;
  apiKey?: string | null;
  baseUrl?: string | null;
  model?: string | null;
  note?: string | null;
  tags?: string[] | null;
  createProfile?: boolean;
  switchToProfile?: string | null;
}): CommandResult {
  ensureDir(args.codexDir);
  const providers = readProvidersFile(args.providersPath);
  const document = readStructuredConfig(args.configPath);
  const current = providers.providers[args.providerName];
  if (!current) {
    throw cliError("PROVIDER_NOT_FOUND", `Provider "${args.providerName}" was not found.`, {
      provider: args.providerName,
      file: args.providersPath,
    });
  }

  const updatedFields: string[] = [];
  const nextProfile = args.profile ?? current.profile;

  if (args.profile !== undefined && args.profile !== current.profile) {
    updatedFields.push("profile");
  }
  if (args.apiKey !== undefined && args.apiKey !== current.apiKey) {
    updatedFields.push("apiKey");
  }
  if (args.baseUrl !== undefined && (args.baseUrl ?? undefined) !== current.baseUrl) {
    updatedFields.push("baseUrl");
  }
  if (args.note !== undefined && (args.note ?? undefined) !== current.note) {
    updatedFields.push("note");
  }
  if (args.tags !== undefined) {
    updatedFields.push("tags");
  }

  const oldProfile = current.profile;
  const newProfile = nextProfile;
  const targetSection = document.profiles.find((profile) => profile.name === newProfile) ?? null;
  const targetModelProviderSection = document.modelProviders.find((entry) => entry.name === newProfile) ?? null;
  const targetProfileExists = Boolean(targetSection);
  let upsertProfiles: Record<string, { model?: string; modelProvider?: string }> | undefined;
  let upsertModelProviders: Record<string, { baseUrl?: string; envKey?: string }> | undefined;
  if (!targetProfileExists) {
    if (!args.createProfile) {
      throw cliError("PROFILE_NOT_FOUND", `Profile "${newProfile}" does not exist in config.toml.`, {
        profile: newProfile,
        provider: args.providerName,
      });
    }
    upsertProfiles = {
      [newProfile]: validateManagedProfileCreation(newProfile, {
        model: args.model ?? undefined,
        modelProvider: newProfile,
      }),
    };
    upsertModelProviders = {
      [newProfile]: {
        baseUrl: args.baseUrl ?? undefined,
        envKey: buildManagedProfileEnvKey(newProfile),
      },
    };
  } else {
    requireManagedProfileRuntime(document, providers, newProfile);
  }
  const nextEnvKey =
    args.profile !== undefined && args.profile !== current.profile
      ? targetModelProviderSection?.envKey ?? buildManagedProfileEnvKey(newProfile)
      : current.envKey;
  if (nextEnvKey !== current.envKey) {
    updatedFields.push("envKey");
  }
  const nextRecord = cleanProviderRecord({
    profile: newProfile,
    apiKey: args.apiKey ?? current.apiKey,
    envKey: nextEnvKey,
    baseUrl: args.baseUrl === null ? undefined : args.baseUrl ?? current.baseUrl,
    note: args.note === null ? undefined : args.note ?? current.note,
    tags: args.tags ?? current.tags,
  });
  if (targetProfileExists && args.model !== undefined) {
    upsertProfiles = {
      [newProfile]: {
        ...(args.model !== undefined && args.model !== null ? { model: args.model } : {}),
      },
    };
    if (args.model !== undefined && (targetSection?.model !== args.model) && !updatedFields.includes("model")) {
      updatedFields.push("model");
    }
  }

  // Compute profile link ownership after the edit so lifecycle planning can decide whether sections stay, move, or delete.
  const remainingLinksByProfile = new Map<string, string[]>();
  for (const [name, provider] of Object.entries(providers.providers)) {
    if (name === args.providerName) {
      continue;
    }
    const list = remainingLinksByProfile.get(provider.profile) ?? [];
    list.push(name);
    remainingLinksByProfile.set(provider.profile, list);
  }
  if (newProfile !== oldProfile) {
    const list = remainingLinksByProfile.get(newProfile) ?? [];
    list.push(args.providerName);
    remainingLinksByProfile.set(newProfile, list);
  }
  const lifecycle = planProfileLifecycleOutcome({
    providerName: args.providerName,
    oldProfile,
    newProfile,
    activeProfile: document.activeProfile,
    remainingLinksByProfile,
    switchToProfile: args.switchToProfile ?? null,
  });

  return runMutation({
    codexDir: args.codexDir,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "edit",
    files: [
      { absolutePath: args.providersPath, relativePath: "providers.json" },
      { absolutePath: args.configPath, relativePath: "config.toml" },
      { absolutePath: args.authPath, relativePath: "auth.json" },
    ],
    mutate: () => {
      const configPlan = createConfigMutationPlan(document, {
        upsertProfiles,
        upsertModelProviders,
        deleteProfiles: lifecycle.deletedProfileSections,
        setActiveProfile: lifecycle.nextActiveProfile,
      });
      const nextProviders = {
        providers: {
          ...providers.providers,
          [args.providerName]: nextRecord,
        },
      };
      // Write providers first so the registry and config move together inside the managed backup boundary.
      writeProvidersFile(args.providersPath, nextProviders);
      applyConfigMutation(args.configPath, document, configPlan);
      const updatedDocument = readStructuredConfig(args.configPath);
      if (updatedDocument.activeProfile) {
        const activeProviderName = resolveActiveProviderName(updatedDocument, nextProviders);
        const existingAuth = readAuthFileIfExists(args.authPath);
        writeAuthFile(args.authPath, nextProviders.providers[activeProviderName], existingAuth ?? undefined);
      }

        return {
          provider: args.providerName,
          updatedFields,
          createdProfileSections: configPlan.createdProfileSections,
          createdModelProviderSections: configPlan.createdModelProviderSections,
          deletedProfileSections: configPlan.deletedProfileSections,
          keptSharedProfiles: lifecycle.keptSharedProfiles,
          switchedActiveProfile: lifecycle.switchedActiveProfile,
        adoptedProfiles: [],
        repairedProfiles: [],
      };
    },
  });
}
