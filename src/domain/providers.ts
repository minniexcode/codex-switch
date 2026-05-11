export type ProviderRecord = {
  profile: string;
  apiKey: string;
  baseUrl?: string;
  note?: string;
  tags?: string[];
};

export type ProvidersFile = {
  providers: Record<string, ProviderRecord>;
};

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

    providers[name] = cleanProviderRecord({
      profile: provider.profile,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl as string | undefined,
      note: provider.note as string | undefined,
      tags: provider.tags as string[] | undefined,
    });
  }

  return { providers };
}

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

  return next;
}

export function sortProviders(providers: ProvidersFile): ProvidersFile {
  const orderedProviders = Object.keys(providers.providers)
    .sort()
    .reduce<Record<string, ProviderRecord>>((accumulator, key) => {
      accumulator[key] = providers.providers[key];
      return accumulator;
    }, {});

  return { providers: orderedProviders };
}

export function findProviderByProfile(providers: ProvidersFile, profile: string): string | null {
  for (const [name, provider] of Object.entries(providers.providers)) {
    if (provider.profile === profile) {
      return name;
    }
  }

  return null;
}
