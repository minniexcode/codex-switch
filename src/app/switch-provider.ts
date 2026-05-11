import { cliError } from "../domain/errors";
import { ensureProfileExists, updateTopLevelProfile } from "../infra/config-repo";
import { runCodexLogin } from "../infra/codex-cli";
import { readProvidersFile } from "../infra/providers-repo";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Switches the active Codex profile and optionally refreshes the CLI login session.
 */
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
  return runMutation({
    codexDir: args.codexDir,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "switch",
    files: [
      { absolutePath: args.configPath, relativePath: "config.toml" },
      { absolutePath: args.authPath, relativePath: "auth.json" },
    ],
    mutate: () => {
      // Update the runtime profile first so any subsequent login is associated with the new target.
      updateTopLevelProfile(args.configPath, configContent, provider.profile);
      if (!args.noLogin) {
        runCodexLogin(provider.apiKey, args.codexDir);
      }
      return {
        provider: args.providerName,
        profile: provider.profile,
        loginPerformed: !args.noLogin,
      };
    },
  });
}
