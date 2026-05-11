import * as fs from "node:fs";
import * as path from "node:path";
import { BackupManifest, FileBackupEntry } from "../domain/backup";
import { cliError, normalizeError } from "../domain/errors";
import { ensureDir, writeTextFileAtomic } from "./fs-utils";

/**
 * Creates a point-in-time backup for the managed files involved in a mutation.
 */
export function createBackup(
  codexDir: string,
  backupsDir: string,
  reason: string,
  files: Array<{ absolutePath: string; relativePath: string }>
): BackupManifest {
  try {
    const backupDir = path.join(backupsDir, `${createTimestamp()}-${reason}`);
    ensureDir(backupsDir);
    ensureDir(backupDir);

    const entries: FileBackupEntry[] = [];
    for (const file of files) {
      const exists = fs.existsSync(file.absolutePath);
      const backupFileName = exists ? file.relativePath.replace(/[\\/]/g, "__") : null;
      if (exists && backupFileName) {
        // Flatten relative paths into a single filename inside the backup directory.
        fs.copyFileSync(file.absolutePath, path.join(backupDir, backupFileName));
      }

      entries.push({
        relativePath: file.relativePath,
        existed: exists,
        backupFileName,
      });
    }

    const manifest: BackupManifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      reason,
      rootDir: codexDir,
      backupDir,
      files: entries,
    };

    writeTextFileAtomic(path.join(backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } catch (error: unknown) {
    throw cliError("BACKUP_FAILED", "Failed to create backup.", {
      cause: normalizeError(error).message,
    });
  }
}

/**
 * Restores all files described by a backup manifest back into the Codex directory.
 */
export function restoreManifest(manifest: BackupManifest): void {
  for (const entry of manifest.files) {
    const targetPath = path.join(manifest.rootDir, entry.relativePath);
    if (!entry.existed) {
      if (fs.existsSync(targetPath)) {
        // Remove files that were created by the failed mutation but were absent before it.
        fs.rmSync(targetPath, { force: true });
      }
      continue;
    }

    if (!entry.backupFileName) {
      throw new Error(`Backup file for ${entry.relativePath} is missing from manifest.`);
    }

    const sourcePath = path.join(manifest.backupDir, entry.backupFileName);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Backup file not found: ${sourcePath}`);
    }

    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
  }
}

/**
 * Persists the latest successful backup manifest for manual rollback.
 */
export function saveLatestManifest(latestBackupPath: string, manifest: BackupManifest): void {
  writeTextFileAtomic(latestBackupPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Loads and validates the latest rollback manifest file.
 */
export function loadLatestManifest(latestBackupPath: string): BackupManifest {
  if (!fs.existsSync(latestBackupPath)) {
    throw cliError("ROLLBACK_FAILED", "No rollback backup is available.", {
      file: latestBackupPath,
    });
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(latestBackupPath, "utf8")) as BackupManifest;
    if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.files)) {
      throw new Error("Invalid latest backup manifest.");
    }
    return manifest;
  } catch (error: unknown) {
    throw cliError("ROLLBACK_FAILED", "Failed to read latest backup manifest.", {
      file: latestBackupPath,
      cause: normalizeError(error).message,
    });
  }
}

/**
 * Formats a filesystem-safe timestamp for backup directory names.
 */
function createTimestamp(): string {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");
  return [
    now.getFullYear().toString(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}
