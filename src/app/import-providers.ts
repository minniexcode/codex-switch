import * as fs from "node:fs";
import * as path from "node:path";
import { buildManagedProfileViews, validateManagedProfileCreation } from "../domain/config";
import { validateProvidersShape } from "../domain/providers";
import { cliError, normalizeError } from "../domain/errors";
import { applyConfigMutation, createConfigMutationPlan, readStructuredConfig } from "../infra/config-repo";
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
  configPath: string;
  sourceFile: string;
  merge?: boolean;
  repairProfiles?: Record<string, { model?: string; baseUrl?: string }>;
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
  const document = readStructuredConfig(args.configPath);
  return runMutation({
    codexDir: args.codexDir,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "import",
    files: [
      { absolutePath: args.providersPath, relativePath: "providers.json" },
      { absolutePath: args.configPath, relativePath: "config.toml" },
    ],
    mutate: () => {
      const current = readProvidersFileIfExists(args.providersPath);
      const next = args.merge ? mergeProviders(current, imported) : imported;
      const currentViews = buildManagedProfileViews(document, current);
      const nextViews = buildManagedProfileViews(document, next);
      const adoptedProfiles = currentViews
        .filter((view) => view.source === "unmanaged" && view.linkedProviders.length === 0)
        .filter((view) => nextViews.some((nextView) => nextView.name === view.name && nextView.managed))
        .map((view) => view.name)
        .sort();
      const missingViews = nextViews.filter((view) => view.source === "orphaned-reference");
      const repairedProfiles: string[] = [];
      const upsertProfiles = missingViews.reduce<Record<string, { model: string; baseUrl: string }>>((accumulator, view) => {
        const repair = args.repairProfiles?.[view.name];
        if (!repair) {
          throw cliError(
            "MANAGED_PROFILE_FIELDS_MISSING",
            "Import would create provider references to missing config profiles that need model and base_url.",
            {
              profilesNeedingRepair: missingViews.map((entry) => entry.name).sort(),
            }
          );
        }
        accumulator[view.name] = validateManagedProfileCreation(view.name, repair);
        repairedProfiles.push(view.name);
        return accumulator;
      }, {});

      const configPlan = createConfigMutationPlan(document, {
        upsertProfiles,
      });
      writeProvidersFile(args.providersPath, next);
      applyConfigMutation(args.configPath, document, configPlan);
      const replacedProviders = args.merge
        ? Object.keys(imported.providers).filter((name) => current.providers[name]).sort()
        : [];

      return {
        mode: args.merge ? "merge" : "replace",
        importedProviders: Object.keys(imported.providers).sort(),
        importedCount: Object.keys(imported.providers).length,
        mergedCount: Object.keys(next.providers).length,
        replacedProviders,
        createdProfileSections: configPlan.createdProfileSections,
        deletedProfileSections: [],
        keptSharedProfiles: nextViews.filter((view) => view.linkedProviders.length > 1).map((view) => view.name),
        switchedActiveProfile: false,
        adoptedProfiles,
        repairedProfiles: repairedProfiles.sort(),
      };
    },
  });
}
