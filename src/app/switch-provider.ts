import { cliError } from "../domain/errors";
import {
  applyConfigMutation,
  createConfigMutationPlan,
  readStructuredConfig,
} from "../storage/config-repo";
import { writeOpenAiApiKeyAuth } from "../storage/auth-repo";
import { readProvidersFile, writeProvidersFile } from "../storage/providers-repo";
import { ensureCopilotBridge, stopCopilotBridge } from "../runtime/copilot-bridge";
import { assertCopilotNodeRuntimeSupported, probeCopilotSdkInstall } from "../runtime/copilot-installer";
import { readCopilotAuthState } from "../runtime/copilot-adapter";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";
import {
  buildCopilotModelProviderProjection,
  buildDirectModelProviderProjection,
  cleanProviderRecord,
  isCopilotBridgeProvider,
} from "../domain/providers";

/**
 * Switches the active Codex route to the target provider.
 */
export async function switchProvider(args: {
  codexDir: string;
  lockPath: string;
  backupsDir: string;
  latestBackupPath: string;
  configPath: string;
  providersPath: string;
  authPath: string;
  runtimeDir?: string;
  runtimesDir?: string;
  providerName: string;
}): Promise<CommandResult> {
  const providers = readProvidersFile(args.providersPath);
  const provider = providers.providers[args.providerName];
  if (!provider) {
    throw cliError("PROVIDER_NOT_FOUND", `Provider "${args.providerName}" was not found.`, {
      availableProviders: Object.keys(providers.providers).sort(),
    });
  }

  const document = readStructuredConfig(args.configPath);
  const providerProfileSection = document.profiles.find((entry) => entry.name === provider.profile) ?? null;
  const providerModelProviderSection = document.modelProviders.find((entry) => entry.name === provider.profile) ?? null;
  const resolvedModel = provider.model ?? providerProfileSection?.model ?? document.currentModel;
  if (!resolvedModel) {
    throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Provider "${args.providerName}" has no model to switch with.`, {
      provider: args.providerName,
      modelProvider: provider.profile,
      suggestion: "Run `codexs edit <provider> --model <name>` or `codexs add <provider> --model <name>`.",
    });
  }
  if (isCopilotBridgeProvider(provider)) {
    assertCopilotNodeRuntimeSupported();
    const installStatus = probeCopilotSdkInstall(args.runtimesDir);
    if (!installStatus.installed) {
      throw cliError("COPILOT_SDK_MISSING", "The optional Copilot SDK runtime is not installed.", {
        installDir: installStatus.installDir,
        packageName: installStatus.packageName,
      });
    }
    await readCopilotAuthState(args.runtimesDir);
    const bridge = await ensureCopilotBridge(args.providerName, provider, args.runtimeDir, args.runtimesDir);
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
        lockPath: args.lockPath,
        backupsDir: args.backupsDir,
        latestBackupPath: args.latestBackupPath,
        operation: "switch",
        files: [
          { absolutePath: args.authPath, relativePath: "auth.json" },
          { absolutePath: args.providersPath, relativePath: "providers.json" },
          { absolutePath: args.configPath, relativePath: "config.toml" },
        ],
        mutate: () => {
          const configPlan = createConfigMutationPlan(document, {
            setCurrentModel: resolvedModel,
            setCurrentModelProvider: provider.profile,
            upsertModelProviders: {
              [provider.profile]: buildCopilotModelProviderProjection(nextProvider.runtime!),
            },
            deleteLegacyProfile: true,
            deleteLegacyProfilesByName: [provider.profile],
            scrubModelProviderEnvKeys: [provider.profile],
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
          writeOpenAiApiKeyAuth(args.authPath, provider.apiKey);
          return {
            provider: args.providerName,
            model: resolvedModel,
            modelProvider: nextProvider.profile,
            profile: nextProvider.profile,
            portChanged: bridge.portChanged,
            bridgePort: bridge.port,
            bridgeReused: bridge.reused,
            bridgeReplaced: bridge.replaced,
            bridgeRestartReason: bridge.restartReason ?? null,
            bridgeLogPath: bridge.logPath,
          };
        },
      });
    } catch (error: unknown) {
      if (!bridge.reused) {
        stopCopilotBridge(args.runtimeDir);
      }
      throw error;
    }
  }
  return runMutation({
    lockPath: args.lockPath,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "switch",
    files: [
      { absolutePath: args.authPath, relativePath: "auth.json" },
      { absolutePath: args.configPath, relativePath: "config.toml" },
    ],
    mutate: () => {
      const directBaseUrl = provider.baseUrl?.trim() ?? "";
      const resolvedBaseUrl = directBaseUrl || providerModelProviderSection?.baseUrl?.trim() || "";
      if (!resolvedBaseUrl) {
        throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Provider "${args.providerName}" requires base_url before switching.`, {
          provider: args.providerName,
          modelProvider: provider.profile,
          suggestion: "Run `codexs edit <provider> --base-url <url>`.",
        });
      }
      const configPlan = createConfigMutationPlan(document, {
        setCurrentModel: resolvedModel,
        setCurrentModelProvider: provider.profile,
        upsertModelProviders: {
          [provider.profile]: buildDirectModelProviderProjection(provider.profile, resolvedBaseUrl),
        },
        deleteLegacyProfile: true,
        deleteLegacyProfilesByName: [provider.profile],
        scrubModelProviderEnvKeys: [provider.profile],
      });
      applyConfigMutation(args.configPath, document, configPlan);
      writeOpenAiApiKeyAuth(args.authPath, provider.apiKey);
      return {
        provider: args.providerName,
        model: resolvedModel,
        modelProvider: provider.profile,
        profile: provider.profile,
      };
    },
  });
}
