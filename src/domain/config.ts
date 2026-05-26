import * as os from "node:os";
import { cliError } from "./errors";
import { ProvidersFile } from "./providers";

export type ManagedProfileFields = {
  model: string;
  modelProvider: string;
};

/**
 * Runtime fields required for a managed model_providers section.
 */
export type ManagedModelProviderFields = {
  baseUrl: string;
  name: string;
  requiresOpenAiAuth: boolean;
  wireApi: string;
};

export type ManagedProfileView = {
  name: string;
  managed: boolean;
  isActive: boolean;
  linkedProviders: string[];
  model: string | null;
  modelProvider: string | null;
  baseUrl: string | null;
  managedFields: string[];
  source: "managed" | "unmanaged" | "orphaned-reference";
};

export type ConfigConsistencyIssue =
  | { code: "ORPHANED_PROFILE_REFERENCE"; profile: string; providers: string[] }
  | { code: "UNMANAGED_ACTIVE_PROFILE"; profile: string }
  | { code: "SHARED_PROFILE_REFERENCE"; profile: string; providers: string[] }
  | { code: "ORPHANED_PROFILE_SECTION"; profile: string }
  | { code: "MODEL_PROVIDER_MISSING"; profile: string }
  | { code: "MODEL_PROVIDER_NAME_MISMATCH"; profile: string; modelProvider: string }
  | { code: "MODEL_PROVIDER_SECTION_MISSING"; profile: string; modelProvider: string }
  | { code: "MODEL_PROVIDER_BASE_URL_MISSING"; profile: string; modelProvider: string }
  | {
      code: "PROVIDER_BASE_URL_MISMATCH";
      profile: string;
      provider: string;
      providerBaseUrl: string;
      configBaseUrl: string;
      providerType: "direct";
    }
  | { code: "ACTIVE_PROVIDER_UNRESOLVED"; profile: string; providers: string[] }
  | { code: "DESTRUCTIVE_REMOVE_BLOCKED"; profile: string; provider: string; activeProfile: string; linkedProviders: string[] };

export type ValueRange = {
  start: number;
  end: number;
};

export type ProfileSectionRef = {
  name: string;
  headerStart: number;
  sectionStart: number;
  sectionEnd: number;
  managedFieldInsertIndex: number;
  modelValueRange: ValueRange | null;
  modelProviderValueRange: ValueRange | null;
  model: string | null;
  modelProvider: string | null;
};

export type ModelProviderSectionRef = {
  name: string;
  sectionStart: number;
  sectionEnd: number;
  managedFieldInsertIndex: number;
  baseUrlValueRange: ValueRange | null;
  baseUrl: string | null;
  nameValueRange: ValueRange | null;
  providerName: string | null;
  requiresOpenAiAuthValueRange: ValueRange | null;
  requiresOpenAiAuth: boolean | null;
  wireApiValueRange: ValueRange | null;
  wireApi: string | null;
};

export type ParsedConfigDocument = {
  rawText: string;
  lineEnding: "\n" | "\r\n";
  activeProfile: string | null;
  activeProfileRange: ValueRange | null;
  profiles: ProfileSectionRef[];
  modelProviders: ModelProviderSectionRef[];
};

export type ConfigPatchOperation =
  | { kind: "replace-range"; start: number; end: number; text: string }
  | { kind: "insert-at"; index: number; text: string }
  | { kind: "delete-range"; start: number; end: number };

export type ConfigMutationPlan = {
  operations: ConfigPatchOperation[];
  createdProfileSections: string[];
  createdModelProviderSections: string[];
  deletedProfileSections: string[];
  updatedProfiles: string[];
  updatedModelProviders: string[];
  switchedActiveProfile: boolean;
};

type ProfileLinkInfo = {
  linkedProviders: string[];
  managed: boolean;
};

/**
 * Reads the active top-level profile from config.toml content.
 */
export function parseTopLevelProfile(configContent: string): string | null {
  return parseStructuredConfig(configContent).activeProfile;
}

/**
 * Collects all named profile sections declared in config.toml content.
 */
export function parseProfileNames(configContent: string): Set<string> {
  return new Set(parseStructuredConfig(configContent).profiles.map((profile) => profile.name));
}

/**
 * Replaces or inserts the top-level profile assignment while preserving the rest of the file.
 */
export function replaceTopLevelProfile(configContent: string, profile: string): string {
  const plan = planConfigMutation(parseStructuredConfig(configContent), { setActiveProfile: profile });
  return applyPatchOperations(configContent, plan.operations);
}

/**
 * Parses the supported config.toml subset into a structured document with stable text ranges.
 */
export function parseStructuredConfig(configContent: string): ParsedConfigDocument {
  const lineEnding: "\n" | "\r\n" = configContent.includes("\r\n") ? "\r\n" : "\n";
  const lines = splitWithOffsets(configContent);
  let activeProfile: string | null = null;
  let activeProfileRange: ValueRange | null = null;
  const profiles: ProfileSectionRef[] = [];
  const modelProviders: ModelProviderSectionRef[] = [];
  let currentProfile: ProfileSectionRef | null = null;
  let currentModelProvider: ModelProviderSectionRef | null = null;
  let inRoot = true;

  for (const line of lines) {
    const trimmed = line.content.trim();
    const headerMatch = trimmed.match(/^\[profiles\.([^\]]+)\]$/);
    if (headerMatch) {
      if (currentProfile) {
        currentProfile.sectionEnd = line.start;
      }
      if (currentModelProvider) {
        currentModelProvider.sectionEnd = line.start;
        currentModelProvider = null;
      }
      currentProfile = {
        name: headerMatch[1],
        headerStart: line.start,
        sectionStart: line.start,
        sectionEnd: configContent.length,
        managedFieldInsertIndex: configContent.length,
        modelValueRange: null,
        modelProviderValueRange: null,
        model: null,
        modelProvider: null,
      };
      profiles.push(currentProfile);
      inRoot = false;
      continue;
    }

    const modelProviderHeaderMatch = trimmed.match(/^\[model_providers\.([^\]]+)\]$/);
    if (modelProviderHeaderMatch) {
      if (currentProfile) {
        currentProfile.sectionEnd = line.start;
        currentProfile = null;
      }
      if (currentModelProvider) {
        currentModelProvider.sectionEnd = line.start;
      }
      currentModelProvider = {
        name: modelProviderHeaderMatch[1],
        sectionStart: line.start,
        sectionEnd: configContent.length,
        managedFieldInsertIndex: configContent.length,
        baseUrlValueRange: null,
        baseUrl: null,
        nameValueRange: null,
        providerName: null,
        requiresOpenAiAuthValueRange: null,
        requiresOpenAiAuth: null,
        wireApiValueRange: null,
        wireApi: null,
      };
      modelProviders.push(currentModelProvider);
      inRoot = false;
      continue;
    }

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      if (currentProfile) {
        currentProfile.sectionEnd = line.start;
        currentProfile = null;
      }
      if (currentModelProvider) {
        currentModelProvider.sectionEnd = line.start;
        currentModelProvider = null;
      }
      inRoot = false;
      continue;
    }

    if (inRoot) {
      const profileMatch = matchKeyValueLine(line.content, "profile");
      if (profileMatch && !activeProfile) {
        activeProfile = profileMatch.value;
        activeProfileRange = {
          start: line.start + profileMatch.valueStart,
          end: line.start + profileMatch.valueEnd,
        };
      }
    }

    if (currentProfile) {
      const modelMatch = matchKeyValueLine(line.content, "model");
      if (modelMatch) {
        currentProfile.model = modelMatch.value;
        currentProfile.modelValueRange = {
          start: line.start + modelMatch.valueStart,
          end: line.start + modelMatch.valueEnd,
        };
      }
      const modelProviderMatch = matchKeyValueLine(line.content, "model_provider");
      if (modelProviderMatch) {
        currentProfile.modelProvider = modelProviderMatch.value;
        currentProfile.modelProviderValueRange = {
          start: line.start + modelProviderMatch.valueStart,
          end: line.start + modelProviderMatch.valueEnd,
        };
      }
    }

    if (currentModelProvider) {
      const baseUrlMatch = matchKeyValueLine(line.content, "base_url");
      if (baseUrlMatch) {
        currentModelProvider.baseUrl = baseUrlMatch.value;
        currentModelProvider.baseUrlValueRange = {
          start: line.start + baseUrlMatch.valueStart,
          end: line.start + baseUrlMatch.valueEnd,
        };
      }
      const nameMatch = matchKeyValueLine(line.content, "name");
      if (nameMatch) {
        currentModelProvider.providerName = nameMatch.value;
        currentModelProvider.nameValueRange = {
          start: line.start + nameMatch.valueStart,
          end: line.start + nameMatch.valueEnd,
        };
      }
      const requiresOpenAiAuthMatch = matchBooleanKeyValueLine(line.content, "requires_openai_auth");
      if (requiresOpenAiAuthMatch) {
        currentModelProvider.requiresOpenAiAuth = requiresOpenAiAuthMatch.value;
        currentModelProvider.requiresOpenAiAuthValueRange = {
          start: line.start + requiresOpenAiAuthMatch.valueStart,
          end: line.start + requiresOpenAiAuthMatch.valueEnd,
        };
      }
      const wireApiMatch = matchKeyValueLine(line.content, "wire_api");
      if (wireApiMatch) {
        currentModelProvider.wireApi = wireApiMatch.value;
        currentModelProvider.wireApiValueRange = {
          start: line.start + wireApiMatch.valueStart,
          end: line.start + wireApiMatch.valueEnd,
        };
      }
    }
  }

  return {
    rawText: configContent,
    lineEnding,
    activeProfile,
    activeProfileRange,
    profiles: profiles.map((profile) => ({
      ...profile,
      managedFieldInsertIndex: findManagedFieldInsertIndex(configContent, profile.sectionStart, profile.sectionEnd),
    })),
    modelProviders: modelProviders.map((provider) => ({
      ...provider,
      managedFieldInsertIndex: findManagedFieldInsertIndex(configContent, provider.sectionStart, provider.sectionEnd),
    })),
  };
}

/**
 * Builds the managed/unmanaged/orphaned profile views used by config commands and diagnostics.
 */
export function buildManagedProfileViews(
  document: ParsedConfigDocument,
  providers: ProvidersFile | null
): ManagedProfileView[] {
  const linkMap = buildProfileLinkMap(providers);
  const modelProviderMap = new Map(document.modelProviders.map((provider) => [provider.name, provider]));
  const views: ManagedProfileView[] = [];
  const seen = new Set<string>();

  for (const section of document.profiles) {
    const linkInfo = linkMap.get(section.name) ?? { linkedProviders: [], managed: false };
    const modelProviderSection = section.modelProvider ? modelProviderMap.get(section.modelProvider) ?? null : null;
    seen.add(section.name);
    views.push({
      name: section.name,
      managed: linkInfo.managed,
      isActive: document.activeProfile === section.name,
      linkedProviders: [...linkInfo.linkedProviders].sort(),
      model: section.model,
      modelProvider: section.modelProvider,
      baseUrl: modelProviderSection?.baseUrl ?? null,
      managedFields: collectManagedFields(section.model, section.modelProvider),
      source: linkInfo.managed ? "managed" : "unmanaged",
    });
  }

  for (const [profile, linkInfo] of [...linkMap.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (seen.has(profile)) {
      continue;
    }
    views.push({
      name: profile,
      managed: true,
      isActive: document.activeProfile === profile,
      linkedProviders: [...linkInfo.linkedProviders].sort(),
      model: null,
      modelProvider: null,
      baseUrl: null,
      managedFields: [],
      source: "orphaned-reference",
    });
  }

  return views.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Collects structured config consistency issues for doctor and status.
 */
export function collectConfigConsistencyIssues(
  document: ParsedConfigDocument,
  providers: ProvidersFile | null
): ConfigConsistencyIssue[] {
  const issues: ConfigConsistencyIssue[] = [];
  const providerMap = providers?.providers ?? null;
  const profileLinkMap = buildProfileLinkMap(providers);
  for (const view of buildManagedProfileViews(document, providers)) {
    if (view.source === "orphaned-reference") {
      issues.push({
        code: "ORPHANED_PROFILE_REFERENCE",
        profile: view.name,
        providers: [...view.linkedProviders],
      });
    }
    if (view.source === "unmanaged" && view.linkedProviders.length === 0) {
      issues.push({
        code: "ORPHANED_PROFILE_SECTION",
        profile: view.name,
      });
    }
    if (view.linkedProviders.length > 1) {
      issues.push({
        code: "SHARED_PROFILE_REFERENCE",
        profile: view.name,
        providers: [...view.linkedProviders],
      });
    }
    if (view.source !== "orphaned-reference") {
      if (!view.modelProvider) {
        issues.push({
          code: "MODEL_PROVIDER_MISSING",
          profile: view.name,
        });
      } else {
        if (view.modelProvider !== view.name) {
          issues.push({
            code: "MODEL_PROVIDER_NAME_MISMATCH",
            profile: view.name,
            modelProvider: view.modelProvider,
          });
        }
        const modelProviderSection = document.modelProviders.find((entry) => entry.name === view.modelProvider);
        if (!modelProviderSection) {
          issues.push({
            code: "MODEL_PROVIDER_SECTION_MISSING",
            profile: view.name,
            modelProvider: view.modelProvider,
          });
        } else if (!modelProviderSection.baseUrl) {
          issues.push({
            code: "MODEL_PROVIDER_BASE_URL_MISSING",
            profile: view.name,
            modelProvider: view.modelProvider,
          });
        } else {
          const profileLinkInfo = profileLinkMap.get(view.name);
          if (
            profileLinkInfo &&
            profileLinkInfo.linkedProviders.length === 1 &&
            providerMap
          ) {
            const providerName = profileLinkInfo.linkedProviders[0];
            const provider = providerMap[providerName];
            if (
              provider &&
              !provider.runtime &&
              typeof provider.baseUrl === "string" &&
              provider.baseUrl.trim() !== "" &&
              provider.baseUrl !== modelProviderSection.baseUrl
            ) {
              issues.push({
                code: "PROVIDER_BASE_URL_MISMATCH",
                profile: view.name,
                provider: providerName,
                providerBaseUrl: provider.baseUrl,
                configBaseUrl: modelProviderSection.baseUrl,
                providerType: "direct",
              });
            }
          }
        }
      }
    }
  }

  if (document.activeProfile) {
    const activeLinkInfo = profileLinkMap.get(document.activeProfile);
    if (!activeLinkInfo) {
      issues.push({
        code: "UNMANAGED_ACTIVE_PROFILE",
        profile: document.activeProfile,
      });
    } else if (activeLinkInfo.linkedProviders.length > 1) {
      issues.push({
        code: "ACTIVE_PROVIDER_UNRESOLVED",
        profile: document.activeProfile,
        providers: [...activeLinkInfo.linkedProviders],
      });
    }
  }

  return issues.sort((left, right) => {
    if (left.profile === right.profile) {
      return left.code.localeCompare(right.code);
    }
    return left.profile.localeCompare(right.profile);
  });
}

/**
 * Ensures the minimal managed profile fields are available before a new section is created.
 */
export function validateManagedProfileCreation(
  profile: string,
  fields: Partial<ManagedProfileFields>
): ManagedProfileFields {
  const model = fields.model?.trim() ?? "";
  const modelProvider = fields.modelProvider?.trim() ?? "";
  if (!model || !modelProvider) {
    throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Managed profile "${profile}" requires both model and model_provider.`, {
      profile,
      missingFields: [
        !model ? "model" : null,
        !modelProvider ? "model_provider" : null,
      ].filter((value): value is string => Boolean(value)),
    });
  }

  return {
    model,
    modelProvider,
  };
}

/**
 * Computes keep/delete/switch outcomes when a provider leaves or changes profiles.
 */
export function planProfileLifecycleOutcome(args: {
  providerName: string;
  oldProfile: string | null;
  newProfile: string | null;
  activeProfile: string | null;
  remainingLinksByProfile: Map<string, string[]>;
  switchToProfile?: string | null;
}): {
  deletedProfileSections: string[];
  keptSharedProfiles: string[];
  switchedActiveProfile: boolean;
  nextActiveProfile: string | null;
} {
  if (!args.oldProfile || args.oldProfile === args.newProfile) {
    return {
      deletedProfileSections: [],
      keptSharedProfiles: [],
      switchedActiveProfile: false,
      nextActiveProfile: args.activeProfile,
    };
  }

  const remainingLinks = args.remainingLinksByProfile.get(args.oldProfile) ?? [];
  if (remainingLinks.length > 0) {
    return {
      deletedProfileSections: [],
      keptSharedProfiles: [args.oldProfile],
      switchedActiveProfile: false,
      nextActiveProfile: args.activeProfile,
    };
  }

  if (args.activeProfile === args.oldProfile) {
    if (!args.switchToProfile) {
      throw cliError("PROFILE_IN_USE", `Profile "${args.oldProfile}" is still the active profile. Switch first before removing the last linked provider.`, {
        profile: args.oldProfile,
        provider: args.providerName,
        activeProfile: args.activeProfile,
        linkedProviders: [],
      });
    }

    return {
      deletedProfileSections: [args.oldProfile],
      keptSharedProfiles: [],
      switchedActiveProfile: true,
      nextActiveProfile: args.switchToProfile,
    };
  }

  return {
    deletedProfileSections: [args.oldProfile],
    keptSharedProfiles: [],
    switchedActiveProfile: false,
    nextActiveProfile: args.activeProfile,
  };
}

/**
 * Builds a text patch plan for top-level profile changes and profile section lifecycle changes.
 */
export function planConfigMutation(
  document: ParsedConfigDocument,
  args: {
    setActiveProfile?: string | null;
    upsertProfiles?: Record<string, Partial<ManagedProfileFields>>;
    upsertModelProviders?: Record<string, Partial<ManagedModelProviderFields>>;
    deleteProfiles?: string[];
  }
): ConfigMutationPlan {
  const operations: ConfigPatchOperation[] = [];
  const createdProfileSections: string[] = [];
  const createdModelProviderSections: string[] = [];
  const deletedProfileSections: string[] = [];
  const updatedProfiles: string[] = [];
  const updatedModelProviders: string[] = [];
  const sectionMap = new Map(document.profiles.map((profile) => [profile.name, profile]));
  const modelProviderSectionMap = new Map(document.modelProviders.map((entry) => [entry.name, entry]));

  if (args.setActiveProfile && args.setActiveProfile !== document.activeProfile) {
    const quoted = `"${args.setActiveProfile}"`;
    if (document.activeProfileRange) {
      operations.push({
        kind: "replace-range",
        start: document.activeProfileRange.start,
        end: document.activeProfileRange.end,
        text: quoted,
      });
    } else {
      const insertAt = findTopLevelInsertIndex(document.rawText);
      const text = `profile = ${quoted}${document.lineEnding}`;
      operations.push({
        kind: "insert-at",
        index: insertAt,
        text,
      });
    }
  }

  for (const profileName of args.deleteProfiles ?? []) {
    const section = sectionMap.get(profileName);
    if (!section) {
      continue;
    }
    operations.push({
      kind: "delete-range",
      start: section.sectionStart,
      end: expandDeletionEnd(document.rawText, section.sectionStart, section.sectionEnd),
    });
    deletedProfileSections.push(profileName);
  }

  for (const [profileName, fields] of Object.entries(args.upsertProfiles ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    const section = sectionMap.get(profileName);
    if (!section) {
      const requiredFields = validateManagedProfileCreation(profileName, fields);
      const prefix = document.rawText.length > 0 && !document.rawText.endsWith(document.lineEnding)
        ? document.lineEnding
        : "";
      operations.push({
        kind: "insert-at",
        index: document.rawText.length,
        text:
          `${prefix}[profiles.${profileName}]${document.lineEnding}` +
          `model = ${JSON.stringify(requiredFields.model)}${document.lineEnding}` +
          `model_provider = ${JSON.stringify(requiredFields.modelProvider)}${document.lineEnding}`,
      });
      createdProfileSections.push(profileName);
      continue;
    }

    const sectionUpdated = planSectionFieldMutation(document, section, fields, operations);
    if (sectionUpdated) {
      updatedProfiles.push(profileName);
    }
  }

  for (const [profileName, fields] of Object.entries(args.upsertModelProviders ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    const section = modelProviderSectionMap.get(profileName);
    if (!section) {
      const baseUrl = fields.baseUrl?.trim() ?? "";
      const providerName = fields.name?.trim() ?? "";
      if (!baseUrl) {
        throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Model provider "${profileName}" requires base_url.`, {
          profile: profileName,
          modelProvider: profileName,
          missingFields: [
            !baseUrl ? "base_url" : null,
          ].filter((value): value is string => Boolean(value)),
        });
      }
      const prefix = document.rawText.length > 0 && !document.rawText.endsWith(document.lineEnding)
        ? document.lineEnding
        : "";
      const requiresOpenAiAuth = fields.requiresOpenAiAuth;
      const wireApi = fields.wireApi?.trim() ?? "";
      operations.push({
        kind: "insert-at",
        index: document.rawText.length,
        text:
          `${prefix}[model_providers.${profileName}]${document.lineEnding}` +
          `base_url = ${JSON.stringify(baseUrl)}${document.lineEnding}` +
          (providerName ? `name = ${JSON.stringify(providerName)}${document.lineEnding}` : "") +
          (requiresOpenAiAuth !== undefined ? `requires_openai_auth = ${String(requiresOpenAiAuth)}${document.lineEnding}` : "") +
          (wireApi ? `wire_api = ${JSON.stringify(wireApi)}${document.lineEnding}` : ""),
      });
      createdModelProviderSections.push(profileName);
      continue;
    }

    const sectionUpdated = planModelProviderFieldMutation(section, fields, operations);
    if (sectionUpdated) {
      updatedModelProviders.push(profileName);
    }
  }

  return {
    operations,
    createdProfileSections,
    createdModelProviderSections,
    deletedProfileSections,
    updatedProfiles,
    updatedModelProviders,
    switchedActiveProfile: Boolean(args.setActiveProfile && args.setActiveProfile !== document.activeProfile),
  };
}

/**
 * Applies a patch plan to raw config text. Callers should sort by reverse offsets only once here.
 */
export function applyPatchOperations(rawText: string, operations: ConfigPatchOperation[]): string {
  const sorted = [...operations].sort((left, right) => getOperationStart(right) - getOperationStart(left));
  let nextText = rawText;
  for (const operation of sorted) {
    if (operation.kind === "replace-range") {
      nextText = `${nextText.slice(0, operation.start)}${operation.text}${nextText.slice(operation.end)}`;
      continue;
    }
    if (operation.kind === "delete-range") {
      nextText = `${nextText.slice(0, operation.start)}${nextText.slice(operation.end)}`;
      continue;
    }
    nextText = `${nextText.slice(0, operation.index)}${operation.text}${nextText.slice(operation.index)}`;
  }

  return nextText;
}

function planSectionFieldMutation(
  document: ParsedConfigDocument,
  section: ProfileSectionRef,
  fields: Partial<ManagedProfileFields>,
  operations: ConfigPatchOperation[]
): boolean {
  let updated = false;
  const modelText = fields.model !== undefined ? JSON.stringify(fields.model) : null;
  const modelProviderText = fields.modelProvider !== undefined ? JSON.stringify(fields.modelProvider) : null;
  const inserts: string[] = [];

  if (modelText !== null && section.modelValueRange) {
    if (section.model !== fields.model) {
      operations.push({
        kind: "replace-range",
        start: section.modelValueRange.start,
        end: section.modelValueRange.end,
        text: modelText,
      });
      updated = true;
    }
  } else if (modelText !== null && !section.modelValueRange) {
    inserts.push(`model = ${modelText}${document.lineEnding}`);
    updated = true;
  }

  if (modelProviderText !== null && section.modelProviderValueRange) {
    if (section.modelProvider !== fields.modelProvider) {
      operations.push({
        kind: "replace-range",
        start: section.modelProviderValueRange.start,
        end: section.modelProviderValueRange.end,
        text: modelProviderText,
      });
      updated = true;
    }
  } else if (modelProviderText !== null && !section.modelProviderValueRange) {
    inserts.push(`model_provider = ${modelProviderText}${document.lineEnding}`);
    updated = true;
  }

  if (inserts.length > 0) {
    operations.push({
      kind: "insert-at",
      index: section.managedFieldInsertIndex,
      text: inserts.join(""),
    });
  }

  return updated;
}

/**
 * Plans managed field updates for one model_providers section.
 */
function planModelProviderFieldMutation(
  section: ModelProviderSectionRef,
  fields: Partial<ManagedModelProviderFields>,
  operations: ConfigPatchOperation[]
): boolean {
  let updated = false;
  const baseUrlText = fields.baseUrl !== undefined ? JSON.stringify(fields.baseUrl) : null;
  const nameText = fields.name !== undefined ? JSON.stringify(fields.name) : null;
  const requiresOpenAiAuthText = fields.requiresOpenAiAuth !== undefined ? String(fields.requiresOpenAiAuth) : null;
  const wireApiText = fields.wireApi !== undefined ? JSON.stringify(fields.wireApi) : null;
  const inserts: string[] = [];

  if (baseUrlText !== null && section.baseUrlValueRange) {
    if (section.baseUrl !== fields.baseUrl) {
      operations.push({
        kind: "replace-range",
        start: section.baseUrlValueRange.start,
        end: section.baseUrlValueRange.end,
        text: baseUrlText,
      });
      updated = true;
    }
  } else if (baseUrlText !== null) {
    inserts.push(`base_url = ${baseUrlText}`);
    updated = true;
  }

  if (nameText !== null && section.nameValueRange) {
    if (section.providerName !== fields.name) {
      operations.push({
        kind: "replace-range",
        start: section.nameValueRange.start,
        end: section.nameValueRange.end,
        text: nameText,
      });
      updated = true;
    }
  } else if (nameText !== null) {
    inserts.push(`name = ${nameText}`);
    updated = true;
  }

  if (requiresOpenAiAuthText !== null && section.requiresOpenAiAuthValueRange) {
    if (section.requiresOpenAiAuth !== fields.requiresOpenAiAuth) {
      operations.push({
        kind: "replace-range",
        start: section.requiresOpenAiAuthValueRange.start,
        end: section.requiresOpenAiAuthValueRange.end,
        text: requiresOpenAiAuthText,
      });
      updated = true;
    }
  } else if (requiresOpenAiAuthText !== null) {
    inserts.push(`requires_openai_auth = ${requiresOpenAiAuthText}`);
    updated = true;
  }

  if (wireApiText !== null && section.wireApiValueRange) {
    if (section.wireApi !== fields.wireApi) {
      operations.push({
        kind: "replace-range",
        start: section.wireApiValueRange.start,
        end: section.wireApiValueRange.end,
        text: wireApiText,
      });
      updated = true;
    }
  } else if (wireApiText !== null) {
    inserts.push(`wire_api = ${wireApiText}`);
    updated = true;
  }

  if (inserts.length > 0) {
    operations.push({
      kind: "insert-at",
      index: section.managedFieldInsertIndex,
      text: `${inserts.join("\n")}\n`,
    });
  }

  return updated;
}

function splitWithOffsets(value: string): Array<{ content: string; start: number; end: number }> {
  if (value.length === 0) {
    return [];
  }

  const result: Array<{ content: string; start: number; end: number }> = [];
  let index = 0;
  while (index < value.length) {
    let nextBreak = value.indexOf("\n", index);
    if (nextBreak === -1) {
      nextBreak = value.length;
    } else {
      nextBreak += 1;
    }
    result.push({
      content: value.slice(index, nextBreak).replace(/\r?\n$/, ""),
      start: index,
      end: nextBreak,
    });
    index = nextBreak;
  }
  return result;
}

function matchKeyValueLine(line: string, key: string): { value: string; valueStart: number; valueEnd: number } | null {
  const match = line.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(["'])(.*?)\\1\\s*(#.*)?$`));
  if (!match || match.index === undefined) {
    return null;
  }

  const value = match[2];
  const openingQuoteIndex = line.indexOf(match[1], match.index);
  if (openingQuoteIndex === -1) {
    return null;
  }
  const valueStart = openingQuoteIndex;
  const valueEnd = openingQuoteIndex + match[1].length + value.length + match[1].length;
  return {
    value,
    valueStart,
    valueEnd,
  };
}

function matchBooleanKeyValueLine(line: string, key: string): { value: boolean; valueStart: number; valueEnd: number } | null {
  const match = line.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(true|false)\\s*(#.*)?$`));
  if (!match || match.index === undefined) {
    return null;
  }

  const value = match[1] === "true";
  const valueStart = line.indexOf(match[1], match.index);
  if (valueStart === -1) {
    return null;
  }
  const valueEnd = valueStart + match[1].length;
  return {
    value,
    valueStart,
    valueEnd,
  };
}

function findManagedFieldInsertIndex(rawText: string, sectionStart: number, sectionEnd: number): number {
  const sectionText = rawText.slice(sectionStart, sectionEnd);
  const lines = splitWithOffsets(sectionText);
  let lastMeaningfulIndex = lines.length - 1;

  while (lastMeaningfulIndex >= 0) {
    const trimmed = lines[lastMeaningfulIndex].content.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      lastMeaningfulIndex -= 1;
      continue;
    }
    break;
  }

  if (lastMeaningfulIndex < 0) {
    return sectionEnd;
  }

  return sectionStart + lines[lastMeaningfulIndex].end;
}

function collectManagedFields(model: string | null, modelProvider: string | null): string[] {
  const fields: string[] = [];
  if (model !== null) {
    fields.push("model");
  }
  if (modelProvider !== null) {
    fields.push("model_provider");
  }
  return fields;
}

function buildProfileLinkMap(providers: ProvidersFile | null): Map<string, ProfileLinkInfo> {
  const map = new Map<string, ProfileLinkInfo>();
  for (const [providerName, provider] of Object.entries(providers?.providers ?? {})) {
    const current = map.get(provider.profile) ?? { linkedProviders: [], managed: true };
    current.linkedProviders.push(providerName);
    current.managed = true;
    map.set(provider.profile, current);
  }

  for (const value of map.values()) {
    value.linkedProviders.sort();
  }
  return map;
}

function getOperationStart(operation: ConfigPatchOperation): number {
  if (operation.kind === "insert-at") {
    return operation.index;
  }
  return operation.start;
}

function findTopLevelInsertIndex(rawText: string): number {
  const sectionMatch = rawText.match(/^\s*\[/m);
  return sectionMatch && sectionMatch.index !== undefined ? sectionMatch.index : rawText.length;
}

function expandDeletionEnd(rawText: string, sectionStart: number, sectionEnd: number): number {
  let end = sectionEnd;
  while (end < rawText.length && (rawText[end] === "\r" || rawText[end] === "\n")) {
    end += 1;
  }
  if (sectionStart > 0) {
    let cursor = sectionStart - 1;
    while (cursor >= 0 && (rawText[cursor] === "\r" || rawText[cursor] === "\n")) {
      cursor -= 1;
    }
    if (cursor < sectionStart - 1) {
      return end;
    }
  }
  return end;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const DEFAULT_LINE_ENDING = os.EOL === "\r\n" ? "\r\n" : "\n";
