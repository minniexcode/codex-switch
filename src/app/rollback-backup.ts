import { cliError, normalizeError } from "../domain/errors";
import { loadLatestManifest, loadManifestById, restoreManifest } from "../storage/backup-repo";
import { CommandResult } from "./types";

/**
 * Restores either the latest backup or a specific historical backup by id.
 */
export function rollbackBackup(args: {
  latestBackupPath: string;
  backupsDir: string;
  allowedRoots: string[];
  backupId?: string | null;
}): CommandResult {
  const manifest = args.backupId
    ? loadManifestById(args.backupsDir, args.backupId)
    : loadLatestManifest(args.latestBackupPath);

  try {
    restoreManifest(manifest, args.allowedRoots);
    return {
      data: {
        restoredFiles: manifest.files.map((file) => file.relativePath),
        backupId: args.backupId ?? null,
        backupPath: manifest.backupDir,
      },
    };
  } catch (error: unknown) {
    const normalized = normalizeError(error);
    if (normalized.code === "ROLLBACK_PATH_REJECTED") {
      // Surface the specific cause: a rejected manifest is not a transient failure.
      throw error;
    }

    throw cliError("ROLLBACK_FAILED", "Rollback failed.", {
      cause: normalized.message,
      backupPath: manifest.backupDir,
      backupId: args.backupId ?? null,
    });
  }
}
