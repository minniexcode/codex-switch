import { cliError } from "../domain/errors";
import { buildCopilotBridgeBaseUrl, cleanProviderRecord, isCopilotBridgeProvider } from "../domain/providers";
import {
  applyConfigMutation,
  createConfigMutationPlan,
  ensureProfileExists,
} from "../storage/config-repo";
import { writeOpenAiApiKeyAuth } from "../storage/auth-repo";
import { readProvidersFile, writeProvidersFile } from "../storage/providers-repo";
import { ensureCopilotBridge, stopCopilotBridge } from "../runtime/copilot-bridge";
import { probeCopilotSdkInstall } from "../runtime/copilot-installer";
import { readCopilotAuthState } from "../runtime/copilot-adapter";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Switches the active Codex profile to the target provider.
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
    const nextProvider = bridge.portChanged
      ? cleanProviderRecord({
          ...provider,
          baseUrl: bridge.baseUrl,
          runtime: {
            ...provider.runtime!,
            bridgePort: bridge.port,
          },
        })
      : provider;
    try {
      return runMutation({
        codexDir: args.codexDir,
        backupsDir: args.backupsDir,
        latestBackupPath: args.latestBackupPath,
        operation: "switch",
        files: [
          { absolutePath: args.providersPath, relativePath: "providers.json" },
          { absolutePath: args.configPath, relativePath: "config.toml" },
        ],
        mutate: () => {
          const configPlan = createConfigMutationPlan(document, {
            setActiveProfile: provider.profile,
            upsertModelProviders: bridge.portChanged
              ? {
                  [provider.profile]: {
                    baseUrl: buildCopilotBridgeBaseUrl(nextProvider.runtime!),
                  },
                }
              : undefined,
          });
          if (bridge.portChanged) {
            writeProvidersFile(args.providersPath, {
              providers: {
                ...providers.providers,
                [args.providerName]: nextProvider,
              },
            });
          }
          applyConfigMutation(args.configPath, document, configPlan);
          return {
            provider: args.providerName,
            profile: nextProvider.profile,
            portChanged: bridge.portChanged,
            bridgePort: bridge.port,
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
      { absolutePath: args.authPath, relativePath: "auth.json" },
      { absolutePath: args.configPath, relativePath: "config.toml" },
    ],
    mutate: () => {
      const configPlan = createConfigMutationPlan(document, {
        setActiveProfile: provider.profile,
      });
      applyConfigMutation(args.configPath, document, configPlan);
      writeOpenAiApiKeyAuth(args.authPath, provider.apiKey);
      return {
        provider: args.providerName,
        profile: provider.profile,
      };
    },
  });
}
