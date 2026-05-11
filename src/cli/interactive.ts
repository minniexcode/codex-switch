import * as fs from "node:fs";
import * as path from "node:path";
import { BackupManifest } from "../domain/backup";
import { cliError } from "../domain/errors";
import { readProvidersFile } from "../infra/providers-repo";
import { loadLatestManifest } from "../infra/backup-repo";
import { CliPromptRuntime, PromptChoice } from "./prompt";

/**
 * Keeps CLI-side interactivity rules in one place so automation paths remain explicit.
 */
export function canPrompt(runtime: CliPromptRuntime, jsonMode: boolean): boolean {
  return !jsonMode && runtime.isInteractive();
}

export async function promptForProviderSelection(
  runtime: CliPromptRuntime,
  providersPath: string,
  message: string
): Promise<string> {
  const providers = readProvidersFile(providersPath);
  const choices = Object.entries(providers.providers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([providerName, provider]) => ({
      value: providerName,
      label: providerName,
      hint: provider.profile,
    }));

  if (choices.length === 0) {
    throw cliError("PROVIDER_NOT_FOUND", "No providers are configured.");
  }

  return runtime.selectOne(message, choices);
}

export async function confirmProviderRemoval(
  runtime: CliPromptRuntime,
  providerName: string
): Promise<void> {
  const confirmed = await runtime.confirmAction(`Remove provider "${providerName}"?`, {
    defaultValue: false,
  });
  if (!confirmed) {
    throw cliError("INVALID_IMPORT_FILE", `Removal cancelled for provider "${providerName}".`);
  }
}

export async function confirmImport(runtime: CliPromptRuntime, sourceFile: string): Promise<void> {
  const confirmed = await runtime.confirmAction(
    `Import providers from ${path.resolve(sourceFile)} and replace the current registry?`,
    { defaultValue: false }
  );
  if (!confirmed) {
    throw cliError("INVALID_IMPORT_FILE", "Import cancelled.");
  }
}

export async function confirmExportOverwrite(
  runtime: CliPromptRuntime,
  targetFile: string
): Promise<boolean> {
  return runtime.confirmAction(`Overwrite existing export target ${path.resolve(targetFile)}?`, {
    defaultValue: false,
  });
}

export function exportTargetExists(targetFile: string): boolean {
  return fs.existsSync(path.resolve(targetFile));
}

export function getRollbackSummary(latestBackupPath: string): {
  manifest: BackupManifest;
  previewLines: string[];
} {
  const manifest = loadLatestManifest(latestBackupPath);
  const previewLines = [
    "Rollback preview",
    `Backup: ${manifest.backupDir}`,
    ...manifest.files.map((file) => {
      const suffix = file.existed ? "restore" : "remove";
      return `- ${file.relativePath} (${suffix})`;
    }),
  ];

  return { manifest, previewLines };
}

export async function confirmRollback(runtime: CliPromptRuntime, latestBackupPath: string): Promise<void> {
  const { previewLines } = getRollbackSummary(latestBackupPath);
  for (const line of previewLines) {
    runtime.writeLine(line);
  }

  const confirmed = await runtime.confirmAction("Restore files from the latest backup?", {
    defaultValue: false,
  });
  if (!confirmed) {
    throw cliError("INVALID_IMPORT_FILE", "Rollback cancelled.");
  }
}
