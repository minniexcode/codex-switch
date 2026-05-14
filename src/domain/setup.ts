import { cleanProviderRecord, ProviderRecord } from "./providers";

export type SetupProviderDraft = {
  providerName: string;
  record: ProviderRecord;
};

/**
 * Creates initial provider drafts from config profile names.
 */
export function buildSetupDrafts(
  profiles: string[],
  detailsByProfile: Record<string, Partial<ProviderRecord> & { providerName?: string }>
): SetupProviderDraft[] {
  return profiles.map((profile) => {
    const detail = detailsByProfile[profile] ?? {};
    const providerName = (detail.providerName ?? profile).trim();
    return {
      providerName,
      record: cleanProviderRecord({
        profile,
        apiKey: detail.apiKey ?? "",
        envKey: detail.envKey ?? "",
        baseUrl: detail.baseUrl,
        note: detail.note,
        tags: detail.tags,
      }),
    };
  });
}

/**
 * Returns the profile names that still lack required provider fields.
 */
export function findIncompleteSetupProfiles(drafts: SetupProviderDraft[]): string[] {
  return drafts.filter((draft) => draft.record.apiKey.trim() === "").map((draft) => draft.record.profile);
}
