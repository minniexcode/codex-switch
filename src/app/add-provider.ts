import { cleanProviderRecord } from "../domain/providers";
import { cliError, normalizeError } from "../domain/errors";
import { createBackup, restoreManifest, saveLatestManifest } from "../infra/backup-repo";
import { ensureDir } from "../infra/fs-utils";
import { readProvidersFileIfExists, writeProvidersFile } from "../infra/providers-repo";
import { CommandResult } from "./types";

export function addProvider(args: {
  codexDir: string;
  backupsDir: string;
  latestBackupPath: string;
  providersPath: string;
  providerName: string;
  profile: string;
  apiKey: string;
  baseUrl?: string | null;
  note?: string | null;
  tags: string[];
}): CommandResult {
  ensureDir(args.codexDir);
  const providers = readProvidersFileIfExists(args.providersPath);
  if (providers.providers[args.providerName]) {
    throw cliError("INVALID_IMPORT_FILE", `Provider "${args.providerName}" already exists.`);
  }

  const backup = createBackup(args.codexDir, args.backupsDir, "add", [
    { absolutePath: args.providersPath, relativePath: "providers.json" },
  ]);

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

  try {
    writeProvidersFile(args.providersPath, next);
    saveLatestManifest(args.latestBackupPath, backup);
    return {
      data: {
        provider: args.providerName,
        profile: args.profile,
        backupPath: backup.backupDir,
      },
    };
  } catch (error: unknown) {
    try {
      restoreManifest(backup);
    } catch (rollbackError: unknown) {
      throw cliError("ROLLBACK_FAILED", "Add failed and rollback was not successful.", {
        cause: normalizeError(error).message,
        rollbackReason: normalizeError(rollbackError).message,
        backupPath: backup.backupDir,
      });
    }

    throw cliError("INVALID_IMPORT_FILE", "Add failed and previous providers.json was restored.", {
      cause: normalizeError(error).message,
      rollbackApplied: true,
      backupPath: backup.backupDir,
    });
  }
}
