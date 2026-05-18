import { cliError } from "../domain/errors";
import { buildCopilotBridgeBaseUrl, cleanProviderRecord, isCopilotBridgeProvider, ProviderRecord, ProvidersFile } from "../domain/providers";
import {
  applyConfigMutation,
  createConfigMutationPlan,
  readCurrentProfile,
  readStructuredConfig,
} from "../storage/config-repo";
import { readProvidersFile, writeProvidersFile } from "../storage/providers-repo";
import { canPrompt } from "../interaction/interactive";
import { CliPromptRuntime } from "../interaction/prompt";
import { ensureCopilotBridge, probeCopilotBridgeRuntime, stopCopilotBridge } from "../runtime/copilot-bridge";
import { readCopilotBridgeState } from "../storage/runtime-state-repo";
import { probeCopilotSdkInstall } from "../runtime/copilot-installer";
import { readCopilotAuthState } from "../runtime/copilot-adapter";
import { CommandResult } from "./types";

const DEFAULT_BRIDGE_PORT = 41415;

type BridgeTarget = {
  providerName: string;
  provider: ProviderRecord;
};

/**
 * Starts or reuses the managed Copilot bridge for one provider.
 */
export async function startBridge(args: {
  providersPath: string;
  configPath: string;
  providerName?: string | null;
  runtime: CliPromptRuntime;
  json: boolean;
}): Promise<CommandResult> {
  const providers = readProvidersFile(args.providersPath);
  const target = await resolveBridgeTarget({
    requestedProviderName: args.providerName ?? null,
    providers,
    configPath: args.configPath,
    runtime: args.runtime,
    json: args.json,
    commandName: "start",
    preferRuntimeState: false,
  });

  await requireBridgeRuntimeReadiness();
  const bridge = await ensureCopilotBridge(target.providerName, target.provider);
  const nextProvider = bridge.portChanged ? rewriteBridgeProviderPort(target.provider, bridge.port) : target.provider;

  if (bridge.portChanged) {
    try {
      persistRecoveredBridgePort({
        providersPath: args.providersPath,
        configPath: args.configPath,
        providers,
        providerName: target.providerName,
        previousProvider: target.provider,
        provider: nextProvider,
      });
    } catch (error: unknown) {
      if (!bridge.reused) {
        stopCopilotBridge();
      }
      throw error;
    }
  }

  return {
    data: {
      provider: target.providerName,
      profile: nextProvider.profile,
      baseUrl: buildCopilotBridgeBaseUrl(nextProvider.runtime!),
      host: bridge.host,
      port: bridge.port,
      reused: bridge.reused,
      portChanged: bridge.portChanged,
      defaultPort: DEFAULT_BRIDGE_PORT,
    },
  };
}

/**
 * Stops the managed Copilot bridge.
 */
export async function stopBridge(args: {
  providersPath: string;
  configPath: string;
  providerName?: string | null;
  runtime: CliPromptRuntime;
  json: boolean;
}): Promise<CommandResult> {
  const providers = readProvidersFile(args.providersPath);
  const state = readCopilotBridgeState();
  if (!state && !args.providerName) {
    return {
      data: {
        provider: null,
        stopped: true,
        hadRuntimeState: false,
      },
    };
  }

  if (!state && args.providerName) {
    resolveNamedBridgeProvider(providers, args.providerName);
    return {
      data: {
        provider: args.providerName,
        stopped: true,
        hadRuntimeState: false,
      },
    };
  }

  const target = await resolveBridgeTarget({
    requestedProviderName: args.providerName ?? null,
    providers,
    configPath: args.configPath,
    runtime: args.runtime,
    json: args.json,
    commandName: "stop",
    preferRuntimeState: true,
  });

  if (args.providerName && state?.provider && state.provider !== args.providerName) {
    throw cliError("BRIDGE_PROVIDER_MISMATCH", `Bridge runtime state belongs to "${state.provider}" not "${args.providerName}".`, {
      stateProvider: state.provider,
      requestedProvider: args.providerName,
    });
  }

  stopCopilotBridge();
  return {
    data: {
      provider: target.providerName,
      stopped: true,
      hadRuntimeState: Boolean(state),
    },
  };
}

/**
 * Reports the managed Copilot bridge state.
 */
export async function statusBridge(args: {
  providersPath: string;
  configPath: string;
  providerName?: string | null;
  runtime: CliPromptRuntime;
  json: boolean;
}): Promise<CommandResult> {
  const providers = readProvidersFile(args.providersPath);
  const state = readCopilotBridgeState();
  const target = await resolveBridgeTarget({
    requestedProviderName: args.providerName ?? null,
    providers,
    configPath: args.configPath,
    runtime: args.runtime,
    json: args.json,
    commandName: "status",
    preferRuntimeState: true,
  });
  const provider = target.provider;
  const runtimeStatus = await probeCopilotBridgeRuntime(provider);
  const expectedBaseUrl = buildCopilotBridgeBaseUrl(provider.runtime!);

  if (args.providerName && state?.provider && state.provider !== args.providerName) {
    throw cliError("BRIDGE_PROVIDER_MISMATCH", `Bridge runtime state belongs to "${state.provider}" not "${args.providerName}".`, {
      stateProvider: state.provider,
      requestedProvider: args.providerName,
    });
  }

  return {
    data: {
      provider: target.providerName,
      profile: provider.profile,
      runtimeState: state,
      expectedBaseUrl,
      matches: Boolean(state && state.provider === target.providerName && state.baseUrl === expectedBaseUrl),
      active: runtimeStatus.ok,
      health: runtimeStatus,
    },
  };
}

/**
 * Resolves the Copilot provider target for one bridge command.
 */
async function resolveBridgeTarget(args: {
  requestedProviderName: string | null;
  providers: ProvidersFile;
  configPath: string;
  runtime: CliPromptRuntime;
  json: boolean;
  commandName: "start" | "stop" | "status";
  preferRuntimeState: boolean;
}): Promise<BridgeTarget> {
  if (args.requestedProviderName) {
    return resolveNamedBridgeProvider(args.providers, args.requestedProviderName);
  }

  if (args.preferRuntimeState) {
    const runtimeState = readCopilotBridgeState();
    if (runtimeState?.provider && args.providers.providers[runtimeState.provider]) {
      return resolveNamedBridgeProvider(args.providers, runtimeState.provider);
    }
  }

  const activeTarget = resolveActiveCopilotBridgeProvider(args.providers, args.configPath);
  if (activeTarget) {
    return activeTarget;
  }

  const copilotTargets = listCopilotBridgeProviders(args.providers);
  if (copilotTargets.length === 1) {
    return copilotTargets[0];
  }

  if (canPrompt(args.runtime, args.json)) {
    const selected = await promptForCopilotBridgeSelection(args.runtime, copilotTargets, args.commandName);
    return resolveNamedBridgeProvider(args.providers, selected);
  }

  throw cliError("BRIDGE_TARGET_UNRESOLVED", `Unable to resolve a Copilot provider for bridge ${args.commandName}.`, {
    availableProviders: copilotTargets.map((entry) => entry.providerName),
  });
}

/**
 * Resolves the active provider when the current top-level profile maps to one Copilot bridge provider.
 */
function resolveActiveCopilotBridgeProvider(providers: ProvidersFile, configPath: string): BridgeTarget | null {
  try {
    const currentProfile = readCurrentProfile(configPath);
    const matches = Object.entries(providers.providers)
      .filter(([, provider]) => provider.profile === currentProfile && isCopilotBridgeProvider(provider))
      .sort(([left], [right]) => left.localeCompare(right));
    if (matches.length === 1) {
      return {
        providerName: matches[0][0],
        provider: matches[0][1],
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Resolves one named provider and enforces the Copilot bridge runtime kind.
 */
function resolveNamedBridgeProvider(providers: ProvidersFile, providerName: string): BridgeTarget {
  const provider = providers.providers[providerName];
  if (!provider) {
    throw cliError("PROVIDER_NOT_FOUND", `Provider "${providerName}" was not found.`, {
      provider: providerName,
    });
  }
  if (!isCopilotBridgeProvider(provider)) {
    throw cliError("BRIDGE_PROVIDER_MISMATCH", `Provider "${providerName}" is not a Copilot bridge provider.`, {
      provider: providerName,
    });
  }
  return { providerName, provider };
}

/**
 * Lists all configured Copilot bridge providers in stable order.
 */
function listCopilotBridgeProviders(providers: ProvidersFile): BridgeTarget[] {
  return Object.entries(providers.providers)
    .filter(([, provider]) => isCopilotBridgeProvider(provider))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([providerName, provider]) => ({ providerName, provider }));
}

/**
 * Uses a Copilot-only provider picker instead of the generic provider selector.
 */
async function promptForCopilotBridgeSelection(
  runtime: CliPromptRuntime,
  targets: BridgeTarget[],
  commandName: "start" | "stop" | "status"
): Promise<string> {
  if (targets.length === 0) {
    throw cliError("BRIDGE_TARGET_UNRESOLVED", `No Copilot bridge providers are configured for bridge ${commandName}.`);
  }

  return runtime.selectOne(
    `Choose a Copilot provider to ${commandName}`,
    targets.map((target) => ({
      value: target.providerName,
      label: target.providerName,
      hint: target.provider.profile,
    }))
  );
}

/**
 * Verifies that the local Copilot bridge prerequisites are available before startup.
 */
async function requireBridgeRuntimeReadiness(): Promise<void> {
  const installStatus = probeCopilotSdkInstall();
  if (!installStatus.installed) {
    throw cliError("COPILOT_SDK_MISSING", "The optional Copilot SDK runtime is not installed.", {
      installDir: installStatus.installDir,
      packageName: installStatus.packageName,
    });
  }
  await readCopilotAuthState();
}

/**
 * Rewrites one Copilot bridge provider record with a recovered runtime port.
 */
function rewriteBridgeProviderPort(provider: ProviderRecord, port: number): ProviderRecord {
  return cleanProviderRecord({
    ...provider,
    baseUrl: `http://${provider.runtime!.bridgeHost}:${port}${provider.runtime!.bridgePath}`,
    runtime: {
      ...provider.runtime!,
      bridgePort: port,
    },
  });
}

/**
 * Persists the recovered bridge port to both providers.json and config.toml.
 */
function persistRecoveredBridgePort(args: {
  providersPath: string;
  configPath: string;
  providers: ProvidersFile;
  providerName: string;
  previousProvider: ProviderRecord;
  provider: ProviderRecord;
}): void {
  const previousProviders = {
    providers: {
      ...args.providers.providers,
    },
  };
  const nextProviders = {
    providers: {
      ...args.providers.providers,
      [args.providerName]: args.provider,
    },
  };

  writeProvidersFile(args.providersPath, nextProviders);

  try {
    const document = readStructuredConfig(args.configPath);
    const configPlan = createConfigMutationPlan(document, {
      upsertModelProviders: {
        [args.provider.profile]: {
          baseUrl: buildCopilotBridgeBaseUrl(args.provider.runtime!),
        },
      },
    });
    applyConfigMutation(args.configPath, document, configPlan);
  } catch (error: unknown) {
    writeProvidersFile(args.providersPath, previousProviders);
    throw error;
  }
}
