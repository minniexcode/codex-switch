import { cliError } from "../domain/errors";
import { planProfileLifecycleOutcome } from "../domain/config";
import { applyConfigMutation, createConfigMutationPlan, readStructuredConfig } from "../infra/config-repo";
import { readProvidersFile, writeProvidersFile } from "../infra/providers-repo";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Removes a provider from the managed providers registry.
 */
export function removeProvider(args: {
  codexDir: string;
  backupsDir: string;
  latestBackupPath: string;
  providersPath: string;
  configPath: string;
  providerName: string;
  switchToProfile?: string | null;
}): CommandResult {
  const providers = readProvidersFile(args.providersPath);
  const document = readStructuredConfig(args.configPath);
  const current = providers.providers[args.providerName];
  if (!current) {
    throw cliError("PROVIDER_NOT_FOUND", `Provider "${args.providerName}" was not found.`);
  }

  const nextProviders = { ...providers.providers };
  // Delete against a copied object so the original parsed state stays untouched.
  delete nextProviders[args.providerName];
  const remainingLinksByProfile = new Map<string, string[]>();
  for (const [name, provider] of Object.entries(nextProviders)) {
    const list = remainingLinksByProfile.get(provider.profile) ?? [];
    list.push(name);
    remainingLinksByProfile.set(provider.profile, list);
  }
  const lifecycle = planProfileLifecycleOutcome({
    providerName: args.providerName,
    oldProfile: current.profile,
    newProfile: null,
    activeProfile: document.activeProfile,
    remainingLinksByProfile,
    switchToProfile: args.switchToProfile ?? null,
  });

  return runMutation({
    codexDir: args.codexDir,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "remove",
    files: [
      { absolutePath: args.providersPath, relativePath: "providers.json" },
      { absolutePath: args.configPath, relativePath: "config.toml" },
    ],
    mutate: () => {
      const configPlan = createConfigMutationPlan(document, {
        deleteProfiles: lifecycle.deletedProfileSections,
        setActiveProfile: lifecycle.nextActiveProfile,
      });
      writeProvidersFile(args.providersPath, { providers: nextProviders });
      applyConfigMutation(args.configPath, document, configPlan);
      return {
        provider: args.providerName,
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
