import * as crypto from "node:crypto";
import { validateManagedProfileCreation } from "../domain/config";
import { buildCopilotBridgeBaseUrl, cleanProviderRecord, ProviderRuntime } from "../domain/providers";
import { cliError, normalizeError } from "../domain/errors";
import {
  applyConfigMutation,
  createConfigMutationPlan,
  readStructuredConfig,
  requireManagedProfileRuntime,
} from "../storage/config-repo";
import { ensureDir } from "../storage/fs-utils";
import { readProvidersFileIfExists, writeProvidersFile } from "../storage/providers-repo";
import { readCopilotAuthState } from "../runtime/copilot-adapter";
import { probeCopilotSdkInstall } from "../runtime/copilot-installer";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Adds a new provider record to the managed providers registry.
 */
export async function addProvider(args: {
  codexDir: string;
  toolHomeDir: string;
  lockPath: string;
  runtimesDir: string;
  backupsDir: string;
  latestBackupPath: string;
  providersPath: string;
  configPath: string;
  authPath: string;
  providerName: string;
  profile: string;
  apiKey: string;
  baseUrl?: string | null;
  model?: string | null;
  note?: string | null;
  tags: string[];
  createProfile?: boolean;
  copilot?: boolean;
  bridgeHost?: string | null;
  bridgePort?: number | null;
  bridgeApiKey?: string | null;
}): Promise<CommandResult> {
  ensureDir(args.codexDir);
  const providers = readProvidersFileIfExists(args.providersPath);
  if (providers.providers[args.providerName]) {
    throw cliError("INVALID_IMPORT_FILE", `Provider "${args.providerName}" already exists.`);
  }
  const bridgeHost = args.bridgeHost ?? "127.0.0.1";
  const bridgePort = args.bridgePort ?? 41415;
  const runtime: ProviderRuntime | undefined = args.copilot
    ? {
        kind: "copilot-sdk-bridge",
        upstream: "github-copilot",
        bridgeHost,
        bridgePort,
        bridgePath: "/v1",
        premiumRequests: true,
        authSource: "official-sdk",
        sdkInstallMode: "lazy",
      }
    : undefined;
  if (args.copilot) {
    const installStatus = probeCopilotSdkInstall(args.runtimesDir);
    if (!installStatus.installed) {
      throw cliError("COPILOT_SDK_MISSING", "The optional Copilot SDK runtime is not installed. Run `codexs login copilot` first.", {
        installDir: installStatus.installDir,
        packageName: installStatus.packageName,
        suggestion: "Run `codexs login copilot` to install the Copilot SDK and complete login.",
      });
    }
    try {
      await readCopilotAuthState(args.runtimesDir);
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      if (normalized.code === "COPILOT_AUTH_REQUIRED") {
        throw cliError("COPILOT_AUTH_REQUIRED", "Copilot authentication is required before a Copilot provider can be added.", {
          ...(normalized.details ?? {}),
          suggestion: "Run `codexs login copilot` to complete GitHub Copilot login.",
        });
      }
      throw error;
    }
  }
  const document = readStructuredConfig(args.configPath);
  const existingProfile = document.profiles.find((profile) => profile.name === args.profile);
  const existingModelProvider = document.modelProviders.find((entry) => entry.name === args.profile);
  if (!existingProfile && !args.createProfile) {
    throw cliError("PROFILE_NOT_FOUND", `Profile "${args.profile}" does not exist in config.toml.`, {
      profile: args.profile,
      provider: args.providerName,
    });
  }
  const upsertProfiles = !existingProfile && args.createProfile
    ? {
        [args.profile]: validateManagedProfileCreation(args.profile, {
          model: args.model ?? undefined,
          modelProvider: args.profile,
        }),
      }
    : undefined;
  const upsertModelProviders = !existingModelProvider && args.createProfile
    ? {
        [args.profile]: {
          baseUrl: args.copilot ? buildCopilotBridgeBaseUrl(runtime as ProviderRuntime) : args.baseUrl ?? undefined,
        },
      }
    : undefined;
  if (existingProfile) {
    requireManagedProfileRuntime(document, providers, args.profile);
  }
  const apiKey = args.copilot ? args.bridgeApiKey ?? crypto.randomBytes(24).toString("hex") : args.apiKey;
  const baseUrl = args.copilot ? buildCopilotBridgeBaseUrl(runtime as ProviderRuntime) : args.baseUrl ?? undefined;

  const next = {
    providers: {
      ...providers.providers,
      [args.providerName]: cleanProviderRecord({
        profile: args.profile,
        apiKey,
        baseUrl,
        note: args.note ?? undefined,
        tags: args.tags,
        runtime,
      }),
    },
  };

  return runMutation({
    lockPath: args.lockPath,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "add",
    files: [
      { absolutePath: args.providersPath, relativePath: "providers.json" },
      { absolutePath: args.configPath, relativePath: "config.toml" },
    ],
    mutate: () => {
      const configPlan = createConfigMutationPlan(document, {
        upsertProfiles,
        upsertModelProviders,
      });
      // Persist only the normalized provider payload so later reads are deterministic.
      writeProvidersFile(args.providersPath, next);
      applyConfigMutation(args.configPath, document, configPlan);
      return {
        provider: args.providerName,
        profile: args.profile,
        runtimeKind: runtime?.kind ?? null,
        createdProfileSections: configPlan.createdProfileSections,
        createdModelProviderSections: configPlan.createdModelProviderSections,
        deletedProfileSections: configPlan.deletedProfileSections,
        keptSharedProfiles: [],
        switchedActiveProfile: configPlan.switchedActiveProfile,
        adoptedProfiles: [],
        repairedProfiles: [],
      };
    },
  });
}
