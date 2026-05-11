import { ProvidersFile } from "./providers";

/**
 * Documents how codex-switch splits managed state across configuration files.
 */
export type StorageRoles = {
  managementSSOT: "providers.json";
  runtimeMirrors: ["config.toml", "auth.json"];
  rollbackState: "backups/latest.json";
};

/**
 * Describes whether the live config.toml profile still maps back to providers.json.
 */
export type LiveStateDrift = {
  currentProfile: string | null;
  mappedProvider: string | null;
  profileMapped: boolean;
  canBackfillActiveProvider: boolean;
  reason:
    | "ok"
    | "config-missing"
    | "profile-missing"
    | "providers-missing"
    | "provider-unmapped";
};

/**
 * Returns the stable storage contract used by the CLI.
 */
export function getStorageRoles(): StorageRoles {
  return {
    managementSSOT: "providers.json",
    runtimeMirrors: ["config.toml", "auth.json"],
    rollbackState: "backups/latest.json",
  };
}

/**
 * Compares the live active profile against managed providers to detect drift.
 */
export function inspectLiveStateDrift(
  currentProfile: string | null,
  providers: ProvidersFile | null
): LiveStateDrift {
  if (currentProfile === null) {
    return {
      currentProfile,
      mappedProvider: null,
      profileMapped: false,
      canBackfillActiveProvider: false,
      reason: providers ? "profile-missing" : "config-missing",
    };
  }

  if (!providers) {
    return {
      currentProfile,
      mappedProvider: null,
      profileMapped: false,
      canBackfillActiveProvider: false,
      reason: "providers-missing",
    };
  }

  for (const [name, provider] of Object.entries(providers.providers)) {
    // A direct profile match means the runtime state is still managed.
    if (provider.profile === currentProfile) {
      return {
        currentProfile,
        mappedProvider: name,
        profileMapped: true,
        canBackfillActiveProvider: false,
        reason: "ok",
      };
    }
  }

  return {
    currentProfile,
    mappedProvider: null,
    profileMapped: false,
    canBackfillActiveProvider: true,
    reason: "provider-unmapped",
  };
}
