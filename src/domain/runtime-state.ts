import * as path from "node:path";
import { ProvidersFile } from "./providers";

/**
 * Documents how codex-switch splits managed state across configuration files.
 */
export type StorageLocation = {
  scope: "toolHome" | "targetRuntime";
  path: string;
};

export type StorageRoles = {
  toolHome: {
    root: string;
    toolConfig: string;
    providers: string;
    backupsDir: string;
    latestBackup: string;
    runtimeStateDir: string;
    runtimeInstallDir: string;
  };
  targetRuntime: {
    root: string;
    config: string;
    auth: string;
  };
  managementSSOT: StorageLocation;
  runtimeMirrors: [StorageLocation];
  authStateFile: StorageLocation;
  rollbackState: StorageLocation;
  runtimeState: StorageLocation & {
    managedBackup: false;
  };
  runtimeInstall: StorageLocation & {
    managedBackup: false;
  };
};

/**
 * Describes whether the live config.toml model_provider route still maps back to providers.json.
 */
export type LiveStateDrift = {
  currentModelProvider: string | null;
  mappedProvider: string | null;
  mappedProviders: string[];
  modelProviderMapped: boolean;
  providerResolvable: boolean;
  canBackfillActiveProvider: boolean;
  reason:
    | "ok"
    | "shared-profile"
    | "config-missing"
    | "model-provider-missing"
    | "providers-missing"
    | "provider-unmapped";
};

/**
 * Returns the stable storage contract used by the CLI.
 */
export function getStorageRoles(args: {
  codexDir: string;
  providersPath: string;
  configPath: string;
  authPath: string;
  runtimeDir?: string;
  runtimesDir?: string;
}): StorageRoles {
  const toolHomeDir = path.dirname(path.resolve(args.providersPath));
  const backupsDir = path.join(toolHomeDir, "backups");
  const runtimeDir = args.runtimeDir ? path.resolve(args.runtimeDir) : path.join(toolHomeDir, "runtime");
  const runtimesDir = args.runtimesDir ? path.resolve(args.runtimesDir) : path.join(toolHomeDir, "runtimes");
  return {
    toolHome: {
      root: toolHomeDir,
      toolConfig: path.join(toolHomeDir, "codex-switch.json"),
      providers: path.resolve(args.providersPath),
      backupsDir,
      latestBackup: path.join(backupsDir, "latest.json"),
      runtimeStateDir: runtimeDir,
      runtimeInstallDir: runtimesDir,
    },
    targetRuntime: {
      root: path.resolve(args.codexDir),
      config: path.resolve(args.configPath),
      auth: path.resolve(args.authPath),
    },
    managementSSOT: {
      scope: "toolHome",
      path: path.resolve(args.providersPath),
    },
    runtimeMirrors: [
      {
        scope: "targetRuntime",
        path: path.resolve(args.configPath),
      },
    ],
    authStateFile: {
      scope: "targetRuntime",
      path: path.resolve(args.authPath),
    },
    rollbackState: {
      scope: "toolHome",
      path: path.join(backupsDir, "latest.json"),
    },
    runtimeState: {
      scope: "toolHome",
      path: runtimeDir,
      managedBackup: false,
    },
    runtimeInstall: {
      scope: "toolHome",
      path: runtimesDir,
      managedBackup: false,
    },
  };
}

/**
 * Compares the live active model_provider against managed providers to detect drift.
 */
export function inspectLiveStateDrift(
  currentModelProvider: string | null,
  providers: ProvidersFile | null
): LiveStateDrift {
  if (currentModelProvider === null) {
    return {
      currentModelProvider,
      mappedProvider: null,
      mappedProviders: [],
      modelProviderMapped: false,
      providerResolvable: false,
      canBackfillActiveProvider: false,
      reason: providers ? "model-provider-missing" : "config-missing",
    };
  }

  if (!providers) {
    return {
      currentModelProvider,
      mappedProvider: null,
      mappedProviders: [],
      modelProviderMapped: false,
      providerResolvable: false,
      canBackfillActiveProvider: false,
      reason: "providers-missing",
    };
  }

  const mappedProviders: string[] = [];
  for (const [name, provider] of Object.entries(providers.providers)) {
    if (provider.profile === currentModelProvider) {
      mappedProviders.push(name);
    }
  }

  if (mappedProviders.length === 1) {
    return {
      currentModelProvider,
      mappedProvider: mappedProviders[0],
      mappedProviders,
      modelProviderMapped: true,
      providerResolvable: true,
      canBackfillActiveProvider: false,
      reason: "ok",
    };
  }

  if (mappedProviders.length > 1) {
    return {
      currentModelProvider,
      mappedProvider: null,
      mappedProviders,
      modelProviderMapped: true,
      providerResolvable: false,
      canBackfillActiveProvider: false,
      reason: "shared-profile",
    };
  }

  return {
    currentModelProvider,
    mappedProvider: null,
    mappedProviders: [],
    modelProviderMapped: false,
    providerResolvable: false,
    canBackfillActiveProvider: true,
    reason: "provider-unmapped",
  };
}
