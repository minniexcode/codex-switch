import * as fs from "node:fs";
import * as path from "node:path";
import { BackupManifest } from "../domain/backup";
import { cliError } from "../domain/errors";
import { getBackupId } from "../domain/backups";
import { resolveCodexDir } from "../infra/codex-paths";
import { readProvidersFile } from "../infra/providers-repo";
import { loadLatestManifest, loadManifestById } from "../infra/backup-repo";
import { CliPromptRuntime, PromptChoice } from "./prompt";
import { promptTags } from "./add-interactive";

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
    throw cliError("PROMPT_CANCELLED", `Removal cancelled for provider "${providerName}".`);
  }
}

export async function confirmImport(runtime: CliPromptRuntime, sourceFile: string, merge = false): Promise<void> {
  const confirmed = await runtime.confirmAction(
    merge
      ? `Import providers from ${path.resolve(sourceFile)} and merge into the current registry?`
      : `Import providers from ${path.resolve(sourceFile)} and replace the current registry?`,
    { defaultValue: false }
  );
  if (!confirmed) {
    throw cliError("PROMPT_CANCELLED", "Import cancelled.");
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
  return buildRollbackSummary(manifest);
}

export function getRollbackSummaryById(backupsDir: string, backupId: string): {
  manifest: BackupManifest;
  previewLines: string[];
} {
  const manifest = loadManifestById(backupsDir, backupId);
  return buildRollbackSummary(manifest);
}

function buildRollbackSummary(manifest: BackupManifest): {
  manifest: BackupManifest;
  previewLines: string[];
} {
  const previewLines = [
    "Rollback preview",
    `Backup ID: ${getBackupId(manifest.backupDir)}`,
    `Backup: ${manifest.backupDir}`,
    ...manifest.files.map((file) => {
      const suffix = file.existed ? "restore" : "remove";
      return `- ${file.relativePath} (${suffix})`;
    }),
  ];

  return { manifest, previewLines };
}

export async function confirmRollback(
  runtime: CliPromptRuntime,
  latestBackupPath: string,
  backupsDir?: string,
  backupId?: string | null
): Promise<void> {
  const { previewLines } =
    backupId && backupsDir
      ? getRollbackSummaryById(backupsDir, backupId)
      : getRollbackSummary(latestBackupPath);
  for (const line of previewLines) {
    runtime.writeLine(line);
  }

  const confirmed = await runtime.confirmAction(
    backupId ? `Restore files from backup "${backupId}"?` : "Restore files from the latest backup?",
    {
      defaultValue: false,
    }
  );
  if (!confirmed) {
    throw cliError("PROMPT_CANCELLED", "Rollback cancelled.");
  }
}

export async function chooseSetupStrategy(runtime: CliPromptRuntime): Promise<"merge" | "overwrite" | "cancel"> {
  return runtime.selectOne("providers.json already exists. Choose a setup strategy.", [
    { value: "merge", label: "merge", hint: "keep existing providers and override by imported names" },
    { value: "overwrite", label: "overwrite", hint: "replace the existing registry" },
    { value: "cancel", label: "cancel", hint: "abort setup without writing" },
  ]);
}

export async function chooseCodexDir(
  runtime: CliPromptRuntime,
  candidates: string[]
): Promise<string> {
  if (candidates.length === 0) {
    const manual = (await runtime.inputText("Codex directory path")).trim();
    if (!manual) {
      throw cliError("CODEX_DIR_NOT_FOUND", "No Codex directory was provided.");
    }
    return resolveCodexDir(manual);
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const selected = await runtime.selectOne("Choose a Codex directory", [
    ...candidates.map((candidate) => ({
      value: candidate,
      label: candidate,
    })),
    {
      value: "__manual__",
      label: "Enter manually",
    },
  ]);

  if (selected !== "__manual__") {
    return selected;
  }

  const manual = (await runtime.inputText("Codex directory path")).trim();
  if (!manual) {
    throw cliError("CODEX_DIR_NOT_FOUND", "No Codex directory was provided.");
  }
  return resolveCodexDir(manual);
}

export async function chooseSetupProfiles(
  runtime: CliPromptRuntime,
  profiles: Array<{ name: string; model: string; baseUrl: string }>
): Promise<string[]> {
  if (profiles.length === 0) {
    return [];
  }

  return runtime.selectMany(
    "Choose unmanaged config profiles to adopt into providers.json.",
    profiles.map((profile) => ({
      value: profile.name,
      label: profile.name,
      hint: `${profile.model} | ${profile.baseUrl}`,
    }))
  );
}

export async function collectSetupProviderDetails(
  runtime: CliPromptRuntime,
  profiles: string[]
): Promise<Record<string, { providerName?: string; apiKey?: string; baseUrl?: string; note?: string; tags?: string[] }>> {
  const result: Record<string, { providerName?: string; apiKey?: string; baseUrl?: string; note?: string; tags?: string[] }> = {};

  for (const profile of profiles) {
    const providerName = (await runtime.inputText(`Provider name for profile "${profile}"`, {
      defaultValue: profile,
    })).trim();
    const apiKey = (await runtime.inputSecret(`API key for profile "${profile}"`)).trim();
    const baseUrl = (await runtime.inputText(`Base URL for profile "${profile}" (optional)`)).trim();
    const note = (await runtime.inputText(`Note for profile "${profile}" (optional)`)).trim();
    const tags = await promptTags(runtime);

    result[profile] = {
      providerName: providerName || profile,
      apiKey,
      baseUrl: baseUrl || undefined,
      note: note || undefined,
      tags: tags.length > 0 ? tags : undefined,
    };
  }

  return result;
}

export async function collectImportRepairDetails(
  runtime: CliPromptRuntime,
  profiles: string[]
): Promise<Record<string, { model?: string; baseUrl?: string }>> {
  const repairs: Record<string, { model?: string; baseUrl?: string }> = {};

  for (const profile of profiles) {
    const model = (await runtime.inputText(`Model for missing profile "${profile}"`)).trim();
    const baseUrl = (await runtime.inputText(`Base URL for missing profile "${profile}"`)).trim();
    repairs[profile] = {
      model: model || undefined,
      baseUrl: baseUrl || undefined,
    };
  }

  return repairs;
}

export async function collectEditInput(
  runtime: CliPromptRuntime,
  current: { profile: string; apiKey: string; baseUrl?: string; note?: string; tags?: string[] }
): Promise<{
  profile: string;
  apiKey: string;
  baseUrl?: string;
  note?: string;
  tags?: string[];
}> {
  const profile = (await runtime.inputText("Profile", { defaultValue: current.profile })).trim();
  const apiKey = (await runtime.inputSecret("API key")).trim() || current.apiKey;
  const baseUrl = (await runtime.inputText("Base URL (optional)", { defaultValue: current.baseUrl ?? "" })).trim();
  const note = (await runtime.inputText("Note (optional)", { defaultValue: current.note ?? "" })).trim();
  const tags = await promptTags(runtime, current.tags ?? []);

  return {
    profile,
    apiKey,
    baseUrl: baseUrl || undefined,
    note: note || undefined,
    tags,
  };
}
