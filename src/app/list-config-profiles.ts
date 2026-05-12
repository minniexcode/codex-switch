import { buildManagedProfileViews } from "../domain/config";
import { readStructuredConfig } from "../infra/config-repo";
import { readProvidersFileIfExists } from "../infra/providers-repo";
import { CommandResult } from "./types";

/**
 * Returns the lightweight config profile listing.
 */
export function listConfigProfilesView(args: { configPath: string; providersPath: string }): CommandResult {
  const document = readStructuredConfig(args.configPath);
  const providers = readProvidersFileIfExists(args.providersPath);
  const profiles = buildManagedProfileViews(document, providers).map((profile) => ({
    name: profile.name,
    managed: profile.managed,
    isActive: profile.isActive,
    linkedProviders: profile.linkedProviders,
    model: profile.model,
    baseUrl: profile.baseUrl,
    source: profile.source,
  }));

  return {
    data: {
      activeProfile: document.activeProfile,
      profiles,
      count: profiles.length,
    },
  };
}
