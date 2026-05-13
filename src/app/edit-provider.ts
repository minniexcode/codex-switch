import { cliError } from "../domain/errors";
import { planProfileLifecycleOutcome, validateManagedProfileCreation } from "../domain/config";
import { cleanProviderRecord } from "../domain/providers";
import {
  applyConfigMutation,
  createConfigMutationPlan,
  readCurrentProfile,
  readStructuredConfig,
  requireManagedProfileRuntime,
  requireModelProviderRuntimeSection,
} from "../infra/config-repo";
import { ensureDir } from "../infra/fs-utils";
import { readProvidersFile, writeProvidersFile } from "../infra/providers-repo";
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
  const nextRecord = cleanProviderRecord({
    profile: args.profile ?? current.profile,
    apiKey: args.apiKey ?? current.apiKey,
    baseUrl: args.baseUrl === null ? undefined : args.baseUrl ?? current.baseUrl,
    note: args.note === null ? undefined : args.note ?? current.note,
    tags: args.tags ?? current.tags,
  });

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
  const newProfile = nextRecord.profile;
  const targetSection = document.profiles.find((profile) => profile.name === newProfile) ?? null;
  const targetProfileExists = Boolean(targetSection);
  let upsertProfiles: Record<string, { model?: string; modelProvider?: string }> | undefined;
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
    requireModelProviderRuntimeSection(document, newProfile);
  } else {
    requireManagedProfileRuntime(document, providers, newProfile);
  }
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
    ],
    mutate: () => {
      const configPlan = createConfigMutationPlan(document, {
        upsertProfiles,
        deleteProfiles: lifecycle.deletedProfileSections,
        setActiveProfile: lifecycle.nextActiveProfile,
      });
      writeProvidersFile(args.providersPath, {
        providers: {
          ...providers.providers,
          [args.providerName]: nextRecord,
        },
      });
      applyConfigMutation(args.configPath, document, configPlan);

      return {
        provider: args.providerName,
        updatedFields,
        createdProfileSections: configPlan.createdProfileSections,
        deletedProfileSections: configPlan.deletedProfileSections,
        keptSharedProfiles: lifecycle.keptSharedProfiles,
        switchedActiveProfile: lifecycle.switchedActiveProfile,
        adoptedProfiles: [],
        repairedProfiles: [],
      };
    },
  });
}
