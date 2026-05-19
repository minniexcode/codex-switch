/**
 * Supported runtime-backed provider configuration.
 */
export type ProviderRuntime = {
  kind: "copilot-sdk-bridge";
  upstream: "github-copilot";
  bridgeHost: string;
  bridgePort: number;
  bridgePath: "/v1";
  premiumRequests: true;
  authSource: "official-sdk";
  sdkInstallMode: "lazy";
};

export type CopilotModelProviderProjection = {
  baseUrl: string;
  name: "copilot";
  requiresOpenAiAuth: true;
  wireApi: "responses";
};

/**
 * Provider definition stored in providers.json.
 */
export type ProviderRecord = {
  profile: string;
  apiKey: string;
  baseUrl?: string;
  note?: string;
  tags?: string[];
  runtime?: ProviderRuntime;
};

/**
 * Root providers.json document shape.
 */
export type ProvidersFile = {
  providers: Record<string, ProviderRecord>;
};

/**
 * Validates and normalizes unknown JSON into the providers.json domain model.
 */
export function validateProvidersShape(input: unknown): ProvidersFile {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Root value must be an object.");
  }

  const providersValue = (input as { providers?: unknown }).providers;
  if (!providersValue || typeof providersValue !== "object" || Array.isArray(providersValue)) {
    throw new Error('Missing or invalid "providers" object.');
  }

  const providers: Record<string, ProviderRecord> = {};
  for (const [name, value] of Object.entries(providersValue)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Provider "${name}" must be an object.`);
    }

    const provider = value as Record<string, unknown>;
    if (typeof provider.profile !== "string" || provider.profile.trim() === "") {
      throw new Error(`Provider "${name}" is missing a valid profile.`);
    }
    if (typeof provider.apiKey !== "string" || provider.apiKey.trim() === "") {
      throw new Error(`Provider "${name}" is missing a valid apiKey.`);
    }

    if (provider.baseUrl !== undefined && typeof provider.baseUrl !== "string") {
      throw new Error(`Provider "${name}" has an invalid baseUrl.`);
    }
    if (provider.note !== undefined && typeof provider.note !== "string") {
      throw new Error(`Provider "${name}" has an invalid note.`);
    }
    if (
      provider.tags !== undefined &&
      (!Array.isArray(provider.tags) || provider.tags.some((tag) => typeof tag !== "string"))
    ) {
      throw new Error(`Provider "${name}" has invalid tags.`);
    }
    if (provider.runtime !== undefined) {
      validateProviderRuntime(name, provider.runtime);
      const expectedBaseUrl = buildCopilotBridgeBaseUrl(provider.runtime as ProviderRuntime);
      if (typeof provider.baseUrl !== "string" || provider.baseUrl.trim() !== expectedBaseUrl) {
        throw new Error(`Provider "${name}" baseUrl must match runtime bridge base URL "${expectedBaseUrl}".`);
      }
    }

    // Normalize provider fields during validation so the persisted format stays clean.
    providers[name] = cleanProviderRecord({
      profile: provider.profile,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl as string | undefined,
      note: provider.note as string | undefined,
      tags: provider.tags as string[] | undefined,
      runtime: provider.runtime as ProviderRuntime | undefined,
    });
  }

  return { providers };
}

/**
 * Trims optional fields and removes empty values from a provider record.
 */
export function cleanProviderRecord(record: ProviderRecord): ProviderRecord {
  const next: ProviderRecord = {
    profile: record.profile.trim(),
    apiKey: record.apiKey.trim(),
  };

  if (record.baseUrl && record.baseUrl.trim() !== "") {
    next.baseUrl = record.baseUrl.trim();
  }
  if (record.note && record.note.trim() !== "") {
    next.note = record.note.trim();
  }
  if (record.tags && record.tags.length > 0) {
    next.tags = record.tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  }
  if (record.runtime) {
    next.runtime = {
      kind: record.runtime.kind,
      upstream: record.runtime.upstream,
      bridgeHost: record.runtime.bridgeHost.trim(),
      bridgePort: record.runtime.bridgePort,
      bridgePath: record.runtime.bridgePath,
      premiumRequests: record.runtime.premiumRequests,
      authSource: record.runtime.authSource,
      sdkInstallMode: record.runtime.sdkInstallMode,
    };
  }

  return next;
}

/**
 * Returns a copy of the providers file with provider names sorted deterministically.
 */
export function sortProviders(providers: ProvidersFile): ProvidersFile {
  const orderedProviders = Object.keys(providers.providers)
    .sort()
    .reduce<Record<string, ProviderRecord>>((accumulator, key) => {
      accumulator[key] = providers.providers[key];
      return accumulator;
    }, {});

  return { providers: orderedProviders };
}

/**
 * Finds the provider name associated with a given Codex profile.
 */
export function findProviderByProfile(providers: ProvidersFile, profile: string): string | null {
  const matches = findProvidersByProfile(providers, profile);
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Returns all provider names associated with a given Codex profile.
 */
export function findProvidersByProfile(providers: ProvidersFile, profile: string): string[] {
  const matches: string[] = [];
  for (const [name, provider] of Object.entries(providers.providers)) {
    if (provider.profile === profile) {
      matches.push(name);
    }
  }

  return matches.sort();
}

/**
 * Masks a secret for human-readable output while preserving a short fingerprint.
 */
export function maskSecret(value: string): string {
  if (value.length <= 5) {
    return "*".repeat(Math.max(value.length, 1));
  }

  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

/**
 * Returns whether one provider record relies on an auxiliary runtime component.
 */
export function isRuntimeBackedProvider(provider: ProviderRecord): boolean {
  return Boolean(provider.runtime);
}

/**
 * Returns whether one provider uses the GitHub Copilot SDK bridge runtime.
 */
export function isCopilotBridgeProvider(provider: ProviderRecord): boolean {
  return provider.runtime?.kind === "copilot-sdk-bridge";
}

/**
 * Builds the canonical local bridge URL for one Copilot runtime provider.
 */
export function buildCopilotBridgeBaseUrl(runtime: ProviderRuntime): string {
  return `http://${runtime.bridgeHost}:${runtime.bridgePort}${runtime.bridgePath}`;
}

/**
 * Builds the Codex-facing custom model_provider projection for the managed Copilot bridge.
 */
export function buildCopilotModelProviderProjection(runtime: ProviderRuntime): CopilotModelProviderProjection {
  return {
    baseUrl: buildCopilotBridgeBaseUrl(runtime),
    name: "copilot",
    requiresOpenAiAuth: true,
    wireApi: "responses",
  };
}

/**
 * Validates one runtime-backed provider block.
 */
function validateProviderRuntime(name: string, runtime: unknown): void {
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
    throw new Error(`Provider "${name}" has an invalid runtime block.`);
  }
  const record = runtime as Record<string, unknown>;
  if (record.kind !== "copilot-sdk-bridge") {
    throw new Error(`Provider "${name}" has an unsupported runtime kind.`);
  }
  if (record.upstream !== "github-copilot") {
    throw new Error(`Provider "${name}" has an invalid runtime upstream.`);
  }
  if (typeof record.bridgeHost !== "string" || record.bridgeHost.trim() === "") {
    throw new Error(`Provider "${name}" has an invalid runtime bridgeHost.`);
  }
  if (typeof record.bridgePort !== "number" || !Number.isInteger(record.bridgePort) || record.bridgePort <= 0) {
    throw new Error(`Provider "${name}" has an invalid runtime bridgePort.`);
  }
  if (record.bridgePath !== "/v1") {
    throw new Error(`Provider "${name}" has an invalid runtime bridgePath.`);
  }
  if (record.premiumRequests !== true) {
    throw new Error(`Provider "${name}" must enable runtime premiumRequests.`);
  }
  if (record.authSource !== "official-sdk") {
    throw new Error(`Provider "${name}" has an invalid runtime authSource.`);
  }
  if (record.sdkInstallMode !== "lazy") {
    throw new Error(`Provider "${name}" has an invalid runtime sdkInstallMode.`);
  }
}
