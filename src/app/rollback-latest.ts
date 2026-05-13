import { cliError, normalizeError } from "../domain/errors";
import { loadLatestManifest, restoreManifest } from "../storage/backup-repo";
import { CommandResult } from "./types";

/**
 * Restores the most recent mutation backup recorded by codex-switch.
 */
export function rollbackLatest(latestBackupPath: string): CommandResult {
  const manifest = loadLatestManifest(latestBackupPath);
  try {
    restoreManifest(manifest);
    return {
      data: {
        restoredFiles: manifest.files.map((file) => file.relativePath),
        backupPath: manifest.backupDir,
      },
    };
  } catch (error: unknown) {
    throw cliError("ROLLBACK_FAILED", "Rollback failed.", {
      cause: normalizeError(error).message,
      backupPath: manifest.backupDir,
    });
  }
}
