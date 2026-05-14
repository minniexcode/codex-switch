import { cliError } from "../domain/errors";
import { isCopilotBridgeProvider } from "../domain/providers";
import {
  applyConfigMutation,
  createConfigMutationPlan,
  ensureProfileExists,
  requireRuntimeEnvKey,
} from "../storage/config-repo";
import { readProvidersFile } from "../storage/providers-repo";
import { readAuthFileIfExists, writeAuthFile } from "../storage/auth-repo";
import { ensureCopilotBridge, stopCopilotBridge } from "../runtime/copilot-bridge";
import { probeCopilotSdkInstall } from "../runtime/copilot-installer";
import { readCopilotAuthState } from "../runtime/copilot-adapter";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Switches the active Codex profile and rewrites auth.json for the target provider.
 */
export async function switchProvider(args: {
  codexDir: string;
  backupsDir: string;
  latestBackupPath: string;
  configPath: string;
  providersPath: string;
  authPath: string;
  providerName: string;
}): Promise<CommandResult> {
  const providers = readProvidersFile(args.providersPath);
  const provider = providers.providers[args.providerName];
  if (!provider) {
    throw cliError("PROVIDER_NOT_FOUND", `Provider "${args.providerName}" was not found.`, {
      availableProviders: Object.keys(providers.providers).sort(),
    });
  }

  const document = ensureProfileExists(args.configPath, provider.profile, args.providerName);
  const envKey = requireRuntimeEnvKey(document, provider.profile);
  if (provider.envKey !== envKey) {
    throw cliError("PROVIDER_ENV_KEY_MISMATCH", `Provider "${args.providerName}" envKey does not match runtime env_key.`, {
      provider: args.providerName,
      profile: provider.profile,
      providerEnvKey: provider.envKey,
      runtimeEnvKey: envKey,
    });
  }
  if (isCopilotBridgeProvider(provider)) {
    const installStatus = probeCopilotSdkInstall();
    if (!installStatus.installed) {
      throw cliError("COPILOT_SDK_MISSING", "The optional Copilot SDK runtime is not installed.", {
        installDir: installStatus.installDir,
        packageName: installStatus.packageName,
      });
    }
    await readCopilotAuthState();
    const bridge = await ensureCopilotBridge(args.providerName, provider);
    try {
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
          const configPlan = createConfigMutationPlan(document, {
            setActiveProfile: provider.profile,
          });
          applyConfigMutation(args.configPath, document, configPlan);
          const existingAuth = readAuthFileIfExists(args.authPath);
          writeAuthFile(args.authPath, provider, existingAuth ?? undefined);
          return {
            provider: args.providerName,
            profile: provider.profile,
            envKey: provider.envKey,
          };
        },
      });
    } catch (error: unknown) {
      if (!bridge.reused) {
        stopCopilotBridge();
      }
      throw error;
    }
  }
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
      const configPlan = createConfigMutationPlan(document, {
        setActiveProfile: provider.profile,
      });
      applyConfigMutation(args.configPath, document, configPlan);
      const existingAuth = readAuthFileIfExists(args.authPath);
      writeAuthFile(args.authPath, provider, existingAuth ?? undefined);
      return {
        provider: args.providerName,
        profile: provider.profile,
        envKey: provider.envKey,
      };
    },
  });
}
