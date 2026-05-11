import { cliError, normalizeError } from "../domain/errors";
import { loadLatestManifest, restoreManifest } from "../infra/backup-repo";
import { CommandResult } from "./types";

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
