import * as fs from "node:fs";
import { buildManagedProfileViews, collectConfigConsistencyIssues } from "../domain/config";
import { getStorageRoles, inspectLiveStateDrift } from "../domain/runtime-state";
import { findProvidersByProfile, isCopilotBridgeProvider } from "../domain/providers";
import { readStructuredConfig } from "../storage/config-repo";
import { readProvidersFile } from "../storage/providers-repo";
import { readAuthFileState } from "../storage/auth-repo";
import { probeCopilotSdkInstall } from "../runtime/copilot-installer";
import { probeCopilotBridgeRuntime } from "../runtime/copilot-bridge";
import { readCopilotAuthState } from "../runtime/copilot-adapter";
import { inspectCopilotBridgeState } from "../storage/runtime-state-repo";
import { CommandResult } from "./types";

/**
 * Reports the current on-disk runtime state and how it maps back to managed providers.
 */
export async function getStatus(codexDir: string, configPath: string, providersPath: string, authPath: string): Promise<CommandResult> {
  const configExists = fs.existsSync(configPath);
  const providersExists = fs.existsSync(providersPath);
  let currentProfile: string | null = null;
  const warnings: string[] = [];
  const providers = providersExists ? readProvidersFile(providersPath) : null;
  let configViews: ReturnType<typeof buildManagedProfileViews> = [];
  let consistencyIssues: ReturnType<typeof collectConfigConsistencyIssues> = [];
  const authState = readAuthFileState(authPath);

  if (configExists) {
    const document = readStructuredConfig(configPath);
    currentProfile = document.activeProfile;
    configViews = buildManagedProfileViews(document, providers);
    consistencyIssues = collectConfigConsistencyIssues(document, providers);
    if (!currentProfile) {
      warnings.push("config.toml exists but has no top-level profile.");
    }
  }

  const liveState = inspectLiveStateDrift(currentProfile, providers);
  const activeProviderCandidates = currentProfile && providers ? findProvidersByProfile(providers, currentProfile) : [];
  const activeProvider =
    activeProviderCandidates.length === 1 && providers ? providers.providers[activeProviderCandidates[0]] : null;
  const copilotInstall = probeCopilotSdkInstall();
  const runtimeStateInspection = inspectCopilotBridgeState();
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
      }
    : bridgeProbeTarget
      ? await probeCopilotBridgeRuntime(bridgeProbeTarget, runtimeState)
      : runtimeState
        ? {
            ok: false,
            runtime: "copilot-bridge" as const,
            reason: "failed" as const,
            cause: "Copilot bridge runtime state exists but no matching managed Copilot provider is active.",
            details: runtimeState,
          }
        : null;
  const copilotAuth =
    activeProvider && isCopilotBridgeProvider(activeProvider)
      ? await readCopilotAuthState().catch((error: unknown) => ({
          ready: false,
          source: "official-sdk",
          mode: "session",
          error: error instanceof Error ? error.message : String(error),
        }))
      : null;
  if (liveState.canBackfillActiveProvider) {
    // Surface unmanaged live state without mutating anything during a read-only status call.
    warnings.push("Current config profile is not mapped in providers.json. Backfill would be required before treating live state as managed.");
  }
  if (runtimeStateInspection.exists && !runtimeStateInspection.valid) {
    warnings.push(`Copilot bridge runtime state is unreadable: ${runtimeStateInspection.parseError ?? "unknown parse failure"}`);
  }

  return {
    warnings,
    data: {
      codexDir,
      storage: getStorageRoles(),
      configExists,
      providersExists,
      currentProfile,
      currentProfileMapped: liveState.profileMapped,
      provider: liveState.mappedProvider,
      activeProviderResolvable: activeProviderCandidates.length === 1,
      activeProviderCandidates,
      runtimeProvider: activeProvider && isCopilotBridgeProvider(activeProvider) ? activeProvider.runtime?.kind ?? null : null,
      copilotSdk: {
        installed: copilotInstall.installed,
        installDir: copilotInstall.installDir,
        packageName: copilotInstall.packageName,
        packageVersion: copilotInstall.packageVersion ?? null,
      },
      copilotAuth,
      copilotBridge,
      copilotRuntimeState: runtimeState,
      liveState,
      auth: authState,
      configProfiles: configViews,
      issues: consistencyIssues,
    },
  };
}
