import { cliError, normalizeError } from "../domain/errors";
import { createBackup, restoreManifest, saveLatestManifest } from "../infra/backup-repo";
import { ensureProfileExists, updateTopLevelProfile } from "../infra/config-repo";
import { runCodexLogin } from "../infra/codex-cli";
import { readProvidersFile } from "../infra/providers-repo";
import { CommandResult } from "./types";

export function switchProvider(args: {
  codexDir: string;
  backupsDir: string;
  latestBackupPath: string;
  configPath: string;
  providersPath: string;
  authPath: string;
  providerName: string;
  noLogin: boolean;
}): CommandResult {
  const providers = readProvidersFile(args.providersPath);
  const provider = providers.providers[args.providerName];
  if (!provider) {
    throw cliError("PROVIDER_NOT_FOUND", `Provider "${args.providerName}" was not found.`, {
      availableProviders: Object.keys(providers.providers).sort(),
    });
  }

  const configContent = ensureProfileExists(args.configPath, provider.profile, args.providerName);
  const backup = createBackup(args.codexDir, args.backupsDir, "switch", [
    { absolutePath: args.configPath, relativePath: "config.toml" },
    { absolutePath: args.authPath, relativePath: "auth.json" },
  ]);

  try {
    updateTopLevelProfile(args.configPath, configContent, provider.profile);
    if (!args.noLogin) {
      runCodexLogin(provider.apiKey, args.codexDir);
    }

    saveLatestManifest(args.latestBackupPath, backup);
    return {
      data: {
        provider: args.providerName,
        profile: provider.profile,
        loginPerformed: !args.noLogin,
        backupPath: backup.backupDir,
      },
    };
  } catch (error: unknown) {
    try {
      restoreManifest(backup);
      saveLatestManifest(args.latestBackupPath, backup);
    } catch (rollbackError: unknown) {
      const baseError = normalizeError(error);
      throw cliError("ROLLBACK_FAILED", "Switch failed and rollback was not successful.", {
        cause: baseError.message,
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
}
