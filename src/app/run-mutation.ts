import * as path from "node:path";
import { BackupManifest, FileBackupEntry } from "../domain/backup";
import { cliError, normalizeError } from "../domain/errors";
import { createBackup, restoreManifest, saveLatestManifest } from "../storage/backup-repo";
import { withCodexLock } from "../storage/lock-repo";

type ManagedFile = {
  absolutePath: string;
  relativePath: string;
};

type MutationContext = {
  backup: BackupManifest;
};

/**
 * Runs a write operation under a lock with automatic backup and rollback handling.
 */
export function runMutation<TData extends Record<string, unknown>>(args: {
  codexDir?: string;
  lockPath?: string;
  backupsDir: string;
  latestBackupPath: string;
  operation: string;
  files: ManagedFile[];
  mutate: (context: MutationContext) => TData;
}): { data: TData & { backupPath: string; managedState: Record<string, unknown> } } {
  const lockPath = args.lockPath ?? path.join(args.codexDir ?? process.cwd(), ".codex-switch.lock");
  return withCodexLock(lockPath, args.operation, () => {
    const backup = createBackup(args.backupsDir, args.operation, args.files);
    try {
      const data = args.mutate({ backup });
      // Record the successful backup only after the mutation completes.
      saveLatestManifest(args.latestBackupPath, backup);
      return {
        data: {
          ...data,
          backupPath: backup.backupDir,
          managedState: {
            transaction: "single-process-file-lock",
            backupFiles: listBackedUpFiles(backup.files),
          },
        },
      };
    } catch (error: unknown) {
      try {
        // Roll back the managed files to their pre-mutation state on any failure.
        restoreManifest(backup, buildAllowedRoots(args));
      } catch (rollbackError: unknown) {
        throw cliError("ROLLBACK_FAILED", `${capitalize(args.operation)} failed and rollback was not successful.`, {
          cause: normalizeError(error).message,
          rollbackReason: normalizeError(rollbackError).message,
          backupPath: backup.backupDir,
        });
      }

      const baseError = normalizeError(error);
      throw cliError(baseError.code, baseError.message, {
        ...(baseError.details ?? {}),
        rollbackApplied: true,
        backupPath: backup.backupDir,
      });
    }
  });
}

/**
 * Builds the directories a rollback for this mutation may write into.
 *
 * Sourced from the caller's file list and the backup directory's parent, never from the
 * backup manifest, so a tampered manifest cannot redirect a restore outside the files
 * this operation actually owns.
 */
function buildAllowedRoots(args: { backupsDir: string; files: ManagedFile[] }): string[] {
  const roots = new Set<string>([path.dirname(args.backupsDir)]);
  for (const file of args.files) {
    roots.add(path.dirname(file.absolutePath));
  }
  return [...roots];
}

/**
 * Lists the files that existed before the mutation and were captured in the backup.
 */
function listBackedUpFiles(files: FileBackupEntry[]): string[] {
  return files.filter((entry) => entry.existed).map((entry) => entry.relativePath);
}

/**
 * Uppercases the first character for human-readable operation names.
 */
function capitalize(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}
