import { cliError, normalizeError } from "../domain/errors";
import { createBackup, restoreManifest, saveLatestManifest } from "../infra/backup-repo";
import { readProvidersFile, writeProvidersFile } from "../infra/providers-repo";
import { CommandResult } from "./types";

export function removeProvider(args: {
  codexDir: string;
  backupsDir: string;
  latestBackupPath: string;
  providersPath: string;
  providerName: string;
}): CommandResult {
  const providers = readProvidersFile(args.providersPath);
  if (!providers.providers[args.providerName]) {
    throw cliError("PROVIDER_NOT_FOUND", `Provider "${args.providerName}" was not found.`);
  }

  const backup = createBackup(args.codexDir, args.backupsDir, "remove", [
    { absolutePath: args.providersPath, relativePath: "providers.json" },
  ]);

  const nextProviders = { ...providers.providers };
  delete nextProviders[args.providerName];

  try {
    writeProvidersFile(args.providersPath, { providers: nextProviders });
    saveLatestManifest(args.latestBackupPath, backup);
    return {
      data: {
        provider: args.providerName,
        backupPath: backup.backupDir,
      },
    };
  } catch (error: unknown) {
    try {
      restoreManifest(backup);
    } catch (rollbackError: unknown) {
      throw cliError("ROLLBACK_FAILED", "Remove failed and rollback was not successful.", {
        cause: normalizeError(error).message,
        rollbackReason: normalizeError(rollbackError).message,
        backupPath: backup.backupDir,
      });
    }

    throw cliError("INVALID_IMPORT_FILE", "Remove failed and previous providers.json was restored.", {
      cause: normalizeError(error).message,
      rollbackApplied: true,
      backupPath: backup.backupDir,
    });
  }
}
