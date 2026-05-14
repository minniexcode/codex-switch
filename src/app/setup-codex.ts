import * as fs from "node:fs";
import { buildSetupDrafts, findIncompleteSetupProfiles } from "../domain/setup";
import { cliError } from "../domain/errors";
import { buildManagedProfileViews } from "../domain/config";
import { ProviderRecord } from "../domain/providers";
import { checkCodexAvailable, checkCodexVersion } from "../runtime/codex-cli";
import {
  applyConfigMutation,
  createConfigMutationPlan,
  readStructuredConfig,
  resolveActiveProviderName,
} from "../storage/config-repo";
import { ensureDir } from "../storage/fs-utils";
import { mergeProviders, readProvidersFileIfExists, writeProvidersFile } from "../storage/providers-repo";
import { readAuthFileIfExists, writeAuthFile } from "../storage/auth-repo";
import { runDoctor } from "./run-doctor";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

const MIN_CODEX_VERSION = "0.0.1";

/**
 * Migrates unmanaged Codex config profiles into a managed providers.json registry.
 */
export async function migrateCodex(args: {
  codexDirOption?: string | null;
  codexDir: string;
  configPath: string;
  providersPath: string;
  authPath: string;
  backupsDir: string;
  latestBackupPath: string;
  strategy: "merge" | "overwrite";
  adoptProfiles: string[];
  providerDetailsByProfile: Record<string, { providerName?: string; apiKey?: string; envKey?: string; baseUrl?: string; note?: string; tags?: string[] }>;
}): Promise<CommandResult> {
  const available = checkCodexAvailable();
  if (!available.ok) {
    throw cliError("CODEX_NOT_INSTALLED", "codex CLI is not available.", {
      cause: available.cause,
    });
  }

  const version = checkCodexVersion(MIN_CODEX_VERSION);
  if (!version.ok) {
    throw cliError("CODEX_VERSION_UNSUPPORTED", "codex CLI version is below the supported minimum.", {
      minimumVersion: MIN_CODEX_VERSION,
      currentVersion: version.currentVersion ?? null,
      cause: version.cause,
    });
  }

  if (!fs.existsSync(args.codexDir)) {
    throw cliError("CODEX_DIR_NOT_FOUND", "The requested Codex directory does not exist.", {
      codexDir: args.codexDir,
    });
  }

  const document = readStructuredConfig(args.configPath);
  const profileViews = buildManagedProfileViews(document, null);
  // Migrate can only adopt unmanaged profiles that already contain enough runtime data to become managed.
  const adoptableProfiles = profileViews
    .filter((view) => view.source === "unmanaged" && view.model && view.modelProvider === view.name && view.baseUrl && view.envKey)
    .map((view) => view.name)
    .sort();
  if (profileViews.length === 0) {
    throw cliError("PROFILE_NOT_FOUND", "No profiles were found in config.toml.", {
      file: args.configPath,
    });
  }

  const invalidAdoptProfiles = args.adoptProfiles.filter((profile) => !adoptableProfiles.includes(profile));
  if (invalidAdoptProfiles.length > 0) {
    throw cliError("INVALID_ARGUMENT", "migrate only adopts unmanaged profiles that already contain model, model_provider, and matching model_providers base_url/env_key.", {
      invalidProfiles: invalidAdoptProfiles.sort(),
      adoptableProfiles,
    });
  }
  if (args.adoptProfiles.length === 0) {
    throw cliError("INVALID_ARGUMENT", "migrate requires at least one explicit profile to adopt.", {
      adoptableProfiles,
    });
  }

  const drafts = buildSetupDrafts(args.adoptProfiles, args.providerDetailsByProfile);
  const incompleteProfiles = findIncompleteSetupProfiles(drafts);
  if (incompleteProfiles.length > 0) {
    throw cliError("INVALID_ARGUMENT", "migrate requires complete provider data for every selected profile.", {
      incompleteProfiles,
    });
  }

  ensureDir(args.codexDir);
  const currentProviders = readProvidersFileIfExists(args.providersPath);
  const providersExists = fs.existsSync(args.providersPath);
  if (providersExists && args.strategy !== "merge" && args.strategy !== "overwrite") {
    throw cliError("PROVIDERS_ALREADY_EXISTS", "providers.json already exists.", {
      file: args.providersPath,
    });
  }

  const nextProviders = {
    providers: drafts.reduce<Record<string, ProviderRecord>>((accumulator, draft) => {
      accumulator[draft.providerName] = draft.record;
      return accumulator;
    }, {}),
  };

  const finalProviders = args.strategy === "merge" ? mergeProviders(currentProviders, nextProviders) : nextProviders;

  const result = runMutation({
    codexDir: args.codexDir,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "migrate",
    files: [
      { absolutePath: args.providersPath, relativePath: "providers.json" },
      { absolutePath: args.configPath, relativePath: "config.toml" },
      { absolutePath: args.authPath, relativePath: "auth.json" },
    ],
    mutate: () => {
      // migrate currently preserves config structure and only asserts that the file remains writable inside the mutation flow.
      const configPlan = createConfigMutationPlan(document, {});
      writeProvidersFile(args.providersPath, finalProviders);
      applyConfigMutation(args.configPath, document, configPlan);
      const activeProviderName = resolveActiveProviderName(document, finalProviders);
      const existingAuth = readAuthFileIfExists(args.authPath);
      writeAuthFile(args.authPath, finalProviders.providers[activeProviderName], existingAuth ?? undefined);
      return {
        codexDir: args.codexDir,
        strategy: args.strategy,
        providersInitialized: Object.keys(nextProviders.providers).length,
        providerNames: Object.keys(finalProviders.providers).sort(),
        createdProfileSections: configPlan.createdProfileSections,
        deletedProfileSections: configPlan.deletedProfileSections,
        keptSharedProfiles: [],
        switchedActiveProfile: false,
        adoptedProfiles: [...args.adoptProfiles].sort(),
        repairedProfiles: [],
      };
    },
  });

  // Re-run doctor on the final state so migrate returns immediate post-migration diagnostics.
  const doctor = await runDoctor({
    codexDir: args.codexDir,
    configPath: args.configPath,
    providersPath: args.providersPath,
    authPath: args.authPath,
  });

  return {
    data: {
      ...result.data,
      doctor: doctor.data,
    },
    warnings: doctor.warnings,
  };
}
