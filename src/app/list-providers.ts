import * as fs from "node:fs";
import { CommandResult } from "./types";
import { isCopilotBridgeProvider } from "../domain/providers";
import { inspectLiveStateDrift } from "../domain/runtime-state";
import { readStructuredConfig } from "../storage/config-repo";
import { readProvidersFile } from "../storage/providers-repo";

export type ProviderListItem = {
  name: string;
  profile: string;
  providerType: "direct" | "copilot";
  isActive: boolean;
  note: string | null;
  tags: string[];
};

/**
 * Returns the sorted list of configured providers for display.
 */
export function listProviders(providersPath: string, configPath?: string): CommandResult {
  const providers = readProvidersFile(providersPath);
  const names = Object.keys(providers.providers).sort();
  const currentProfile =
    configPath && fs.existsSync(configPath)
      ? readStructuredConfig(configPath).activeProfile
      : null;
  const liveState = inspectLiveStateDrift(currentProfile, providers);
  const items: ProviderListItem[] = names.map((name) => ({
    name,
    profile: providers.providers[name].profile,
    providerType: isCopilotBridgeProvider(providers.providers[name]) ? "copilot" : "direct",
    isActive: liveState.providerResolvable && liveState.mappedProvider === name,
    note: providers.providers[name].note ?? null,
    tags: providers.providers[name].tags ?? [],
  }));

  return {
    data: {
      providers: items,
      count: items.length,
      currentProfile,
      activeProvider: liveState.mappedProvider,
      activeProviderResolvable: liveState.providerResolvable,
      activeProviderCandidates: liveState.mappedProviders,
    },
  };
}
