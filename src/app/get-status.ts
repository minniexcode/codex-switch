import * as fs from "node:fs";
import { buildManagedProfileViews, collectConfigConsistencyIssues } from "../domain/config";
import { getStorageRoles, inspectLiveStateDrift } from "../domain/runtime-state";
import { isCopilotBridgeProvider } from "../domain/providers";
import { readStructuredConfig } from "../storage/config-repo";
import { readProvidersFile } from "../storage/providers-repo";
import { readAuthFileState } from "../storage/auth-repo";
import { readGithubToken, exchangeForCopilotToken } from "../runtime/copilot-token";
import { probeCopilotBridgeRuntime } from "../runtime/copilot-bridge";
import { inspectCopilotBridgeState } from "../storage/runtime-state-repo";
import { CommandResult } from "./types";

/**
 * Reports the current on-disk runtime state and how it maps back to managed providers.
 */
export async function getStatus(
  codexDir: string,
  configPath: string,
  providersPath: string,
  authPath: string,
  options?: { runtimeDir?: string; runtimesDir?: string; toolHomeDir?: string }
): Promise<CommandResult> {
  const configExists = fs.existsSync(configPath);
  const providersExists = fs.existsSync(providersPath);
  let currentModelProvider: string | null = null;
  let currentModel: string | null = null;
  const warnings: string[] = [];
  const providers = providersExists ? readProvidersFile(providersPath) : null;
  let configViews: ReturnType<typeof buildManagedProfileViews> = [];
  let consistencyIssues: ReturnType<typeof collectConfigConsistencyIssues> = [];
  const authState = readAuthFileState(authPath);

  if (configExists) {
    const document = readStructuredConfig(configPath);
    currentModel = document.currentModel;
    currentModelProvider = document.currentModelProvider;
    configViews = buildManagedProfileViews(document, providers);
    consistencyIssues = collectConfigConsistencyIssues(document, providers);
    if (!currentModelProvider) {
      warnings.push("config.toml exists but has no top-level model_provider.");
    }
  }

  const liveState = inspectLiveStateDrift(currentModelProvider, providers);
  const activeProviderCandidates = liveState.mappedProviders;
  const activeProvider =
    liveState.providerResolvable && providers && liveState.mappedProvider
      ? providers.providers[liveState.mappedProvider]
      : null;
  const copilotInstall = { installed: Boolean(readGithubToken(options?.toolHomeDir)), source: "github-pat" };
  const runtimeStateInspection = inspectCopilotBridgeState(options?.runtimeDir);
  const runtimeState = runtimeStateInspection.state;
  const runtimeStateProvider = runtimeState && providers ? providers.providers[runtimeState.provider] ?? null : null;
  const bridgeProbeTarget =
    activeProvider && isCopilotBridgeProvider(activeProvider)
      ? activeProvider
      : runtimeStateProvider && isCopilotBridgeProvider(runtimeStateProvider)
        ? runtimeStateProvider
        : null;
  const copilotBridge = !runtimeStateInspection.valid && runtimeStateInspection.exists
    ? {
        ok: false,
        runtime: "copilot-bridge" as const,
        reason: "failed" as const,
        cause: runtimeStateInspection.parseError ?? "Failed to parse Copilot bridge runtime state.",
        details: {
          logPath: runtimeState?.logPath ?? null,
        },
      }
    : bridgeProbeTarget
      ? await probeCopilotBridgeRuntime(bridgeProbeTarget, runtimeState, options?.runtimeDir)
      : runtimeState
        ? {
            ok: false,
            runtime: "copilot-bridge" as const,
            reason: "failed" as const,
            cause: "Copilot bridge runtime state exists but no matching managed Copilot provider is active.",
            details: {
              ...runtimeState,
              logPath: runtimeState.logPath ?? null,
            },
          }
        : null;
  const copilotAuth =
    activeProvider && isCopilotBridgeProvider(activeProvider)
      ? await (async () => {
          const token = readGithubToken(options?.toolHomeDir);
          if (!token) return { ready: false, source: "github-pat", mode: "token", error: "No GitHub token found" };
          try {
            await exchangeForCopilotToken(token);
            return { ready: true, source: "github-pat", mode: "token" };
          } catch (error: unknown) {
            return { ready: false, source: "github-pat", mode: "token", error: error instanceof Error ? error.message : String(error) };
          }
        })()
      : null;
  if (liveState.canBackfillActiveProvider) {
    // Surface unmanaged live state without mutating anything during a read-only status call.
      warnings.push("Current config profile is not mapped in providers.json. Backfill would be required before treating live state as managed.");
  }
  if (liveState.reason === "shared-profile") {
    warnings.push(
      `Current model provider "${currentModelProvider}" is shared by multiple providers in providers.json, so the active provider cannot be resolved uniquely.`
    );
  }
  if (runtimeStateInspection.exists && !runtimeStateInspection.valid) {
    warnings.push(`Copilot bridge runtime state is unreadable: ${runtimeStateInspection.parseError ?? "unknown parse failure"}`);
  }

  return {
    warnings,
      data: {
        codexDir,
        storage: getStorageRoles({
          codexDir,
          providersPath,
          configPath,
          authPath,
          runtimeDir: options?.runtimeDir,
          runtimesDir: options?.runtimesDir,
        }),
        configExists,
        providersExists,
        currentModelProvider,
        currentModelProviderMapped: liveState.modelProviderMapped,
        currentModel,
        provider: liveState.mappedProvider,
        activeProviderResolvable: liveState.providerResolvable,
        activeProviderCandidates,
        runtimeProvider: activeProvider && isCopilotBridgeProvider(activeProvider) ? activeProvider.runtime?.kind ?? null : null,
        copilotSdk: {
          installed: copilotInstall.installed,
          source: copilotInstall.source,
        },
        copilotAuth,
        copilotBridge,
        copilotRuntimeState: runtimeState,
        copilotBridgeLogPath: runtimeState?.logPath ?? null,
        copilotBridgeRestartReason: runtimeState?.lastRestartReason ?? null,
        liveState,
        auth: authState,
        configProfiles: configViews,
        issues: consistencyIssues,
      },
  };
}
