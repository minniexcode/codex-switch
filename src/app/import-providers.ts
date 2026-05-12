import * as fs from "node:fs";
import * as path from "node:path";
import { validateProvidersShape } from "../domain/providers";
import { cliError, normalizeError } from "../domain/errors";
import { ensureDir } from "../infra/fs-utils";
import { mergeProviders, readProvidersFileIfExists, writeProvidersFile } from "../infra/providers-repo";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Imports provider definitions from an external JSON file into the managed registry.
 */
export function importProviders(args: {
  codexDir: string;
  backupsDir: string;
  latestBackupPath: string;
  providersPath: string;
  sourceFile: string;
  merge?: boolean;
}): CommandResult {
  const absoluteSource = path.resolve(args.sourceFile);
  let imported;
  try {
    // Validate before writing so malformed imports never touch the managed file.
    imported = validateProvidersShape(JSON.parse(fs.readFileSync(absoluteSource, "utf8")));
  } catch (error: unknown) {
    throw cliError("INVALID_IMPORT_FILE", "Import file is not valid providers.json data.", {
      file: absoluteSource,
      cause: normalizeError(error).message,
    });
  }

  ensureDir(args.codexDir);
  return runMutation({
    codexDir: args.codexDir,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "import",
    files: [{ absolutePath: args.providersPath, relativePath: "providers.json" }],
    mutate: () => {
      const current = readProvidersFileIfExists(args.providersPath);
      const next = args.merge ? mergeProviders(current, imported) : imported;
      writeProvidersFile(args.providersPath, next);
      const replacedProviders = args.merge
        ? Object.keys(imported.providers).filter((name) => current.providers[name]).sort()
        : [];

      return {
        mode: args.merge ? "merge" : "replace",
        importedProviders: Object.keys(imported.providers).sort(),
        importedCount: Object.keys(imported.providers).length,
        mergedCount: Object.keys(next.providers).length,
        replacedProviders,
      };
    },
  });
}
