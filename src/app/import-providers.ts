import * as fs from "node:fs";
import * as path from "node:path";
import { validateProvidersShape } from "../domain/providers";
import { cliError, normalizeError } from "../domain/errors";
import { createBackup, restoreManifest, saveLatestManifest } from "../infra/backup-repo";
import { ensureDir } from "../infra/fs-utils";
import { writeProvidersFile } from "../infra/providers-repo";
import { CommandResult } from "./types";

export function importProviders(args: {
  codexDir: string;
  backupsDir: string;
  latestBackupPath: string;
  providersPath: string;
  sourceFile: string;
}): CommandResult {
  const absoluteSource = path.resolve(args.sourceFile);
  let imported;
  try {
    imported = validateProvidersShape(JSON.parse(fs.readFileSync(absoluteSource, "utf8")));
  } catch (error: unknown) {
    throw cliError("INVALID_IMPORT_FILE", "Import file is not valid providers.json data.", {
      file: absoluteSource,
      cause: normalizeError(error).message,
    });
  }

  ensureDir(args.codexDir);
  const backup = createBackup(args.codexDir, args.backupsDir, "import", [
    { absolutePath: args.providersPath, relativePath: "providers.json" },
  ]);

  try {
    writeProvidersFile(args.providersPath, imported);
    saveLatestManifest(args.latestBackupPath, backup);
    return {
      data: {
        importedProviders: Object.keys(imported.providers).sort(),
        backupPath: backup.backupDir,
      },
    };
  } catch (error: unknown) {
    try {
      restoreManifest(backup);
    } catch (rollbackError: unknown) {
      throw cliError("ROLLBACK_FAILED", "Import failed and rollback was not successful.", {
        cause: normalizeError(error).message,
        rollbackReason: normalizeError(rollbackError).message,
        backupPath: backup.backupDir,
      });
    }

    throw cliError("INVALID_IMPORT_FILE", "Import failed and previous providers.json was restored.", {
      cause: normalizeError(error).message,
      backupPath: backup.backupDir,
      rollbackApplied: true,
    });
  }
}
