import * as fs from "node:fs";
import { buildSetupDrafts, findIncompleteSetupProfiles } from "../domain/setup";
import { cliError } from "../domain/errors";
import { ProviderRecord } from "../domain/providers";
import { findCodexDirCandidates } from "../infra/codex-discovery";
import { checkCodexAvailable, checkCodexVersion } from "../infra/codex-cli";
import { listConfigProfiles } from "../infra/config-repo";
import { ensureDir } from "../infra/fs-utils";
import { mergeProviders, readProvidersFileIfExists, writeProvidersFile } from "../infra/providers-repo";
import { runDoctor } from "./run-doctor";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

const MIN_CODEX_VERSION = "0.0.1";

/**
 * Bootstraps a managed providers.json from the existing Codex directory.
 */
export function setupCodex(args: {
  codexDirOption?: string | null;
  codexDir: string;
  configPath: string;
  providersPath: string;
  backupsDir: string;
  latestBackupPath: string;
  strategy: "merge" | "overwrite";
  providerDetailsByProfile: Record<string, { providerName?: string; apiKey?: string; baseUrl?: string; note?: string; tags?: string[] }>;
}): CommandResult {
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

  const candidates = findCodexDirCandidates(args.codexDirOption);
  if (candidates.length === 0) {
    throw cliError("CODEX_DIR_NOT_FOUND", "No Codex directory could be found.", {
      codexDir: args.codexDir,
    });
  }
  if (candidates.length > 1) {
    throw cliError("CODEX_DIR_AMBIGUOUS", "Multiple Codex directories were found.", {
      candidates,
    });
  }
  if (!fs.existsSync(args.codexDir)) {
    throw cliError("CODEX_DIR_NOT_FOUND", "The requested Codex directory does not exist.", {
      codexDir: args.codexDir,
    });
  }

  const profiles = Array.from(listConfigProfiles(args.configPath)).sort();
  if (profiles.length === 0) {
    throw cliError("PROFILE_NOT_FOUND", "No profiles were found in config.toml.", {
      file: args.configPath,
    });
  }

  const drafts = buildSetupDrafts(profiles, args.providerDetailsByProfile);
  const incompleteProfiles = findIncompleteSetupProfiles(drafts);
  if (incompleteProfiles.length > 0) {
    throw cliError("INVALID_ARGUMENT", "setup requires complete provider data for every selected profile.", {
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
    operation: "setup",
    files: [{ absolutePath: args.providersPath, relativePath: "providers.json" }],
    mutate: () => {
      writeProvidersFile(args.providersPath, finalProviders);
      return {
        codexDir: args.codexDir,
        strategy: args.strategy,
        providersInitialized: Object.keys(nextProviders.providers).length,
        providerNames: Object.keys(finalProviders.providers).sort(),
      };
    },
  });

  const doctor = runDoctor({
    codexDir: args.codexDir,
    configPath: args.configPath,
    providersPath: args.providersPath,
  });

  return {
    data: {
      ...result.data,
      doctor: doctor.data,
    },
    warnings: doctor.warnings,
  };
}
