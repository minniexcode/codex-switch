import { CommandResult } from "./types";
import { readProvidersFile } from "../storage/providers-repo";

/**
 * Returns the sorted list of configured providers for display.
 */
export function listProviders(providersPath: string): CommandResult {
  const providers = readProvidersFile(providersPath);
  const names = Object.keys(providers.providers).sort();
  const items = names.map((name) => ({
    name,
    profile: providers.providers[name].profile,
    envKey: providers.providers[name].envKey,
    note: providers.providers[name].note ?? null,
    tags: providers.providers[name].tags ?? [],
  }));

  return {
    data: {
      providers: items,
      count: items.length,
    },
  };
}
