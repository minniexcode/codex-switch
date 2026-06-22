import * as crypto from "node:crypto";
import {
  buildCopilotBridgeBaseUrl,
  buildDirectModelProviderProjection,
  buildCopilotModelProviderProjection,
  cleanProviderRecord,
  ProviderRuntime,
} from "../domain/providers";
import { cliError, normalizeError } from "../domain/errors";
import {
  applyConfigMutation,
  createConfigMutationPlan,
  readStructuredConfig,
} from "../storage/config-repo";
import { ensureDir } from "../storage/fs-utils";
import { readProvidersFileIfExists, writeProvidersFile } from "../storage/providers-repo";
import { readCopilotAuthState } from "../runtime/copilot-adapter";
import { assertCopilotNodeRuntimeSupported, probeCopilotSdkInstall } from "../runtime/copilot-installer";
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
    assertCopilotNodeRuntimeSupported();
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
  const existingModelProvider = document.modelProviders.find((entry) => entry.name === args.profile);
  const inheritedModel = document.currentModel ?? undefined;
  const providerModel = args.model ?? inheritedModel;
  if (!providerModel) {
    throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Provider "${args.providerName}" requires a model.`, {
      provider: args.providerName,
      modelProvider: args.profile,
      missingFields: ["model"],
      suggestion: "Pass `--model <name>` or set a top-level model in config.toml first.",
    });
  }
  const directBaseUrl = args.baseUrl;
  if (!args.copilot && (!directBaseUrl || directBaseUrl.trim() === "") && !existingModelProvider) {
    throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Model provider "${args.profile}" requires base_url.`, {
      profile: args.profile,
      modelProvider: args.profile,
      missingFields: ["base_url"],
    });
  }
  const upsertModelProviders = args.copilot
    ? {
        [args.profile]: buildCopilotModelProviderProjection(runtime as ProviderRuntime),
      }
    : {
        [args.profile]: buildDirectModelProviderProjection(
          args.profile,
          (directBaseUrl ?? existingModelProvider?.baseUrl ?? "").trim()
        ),
      };
  const apiKey = args.copilot ? args.bridgeApiKey ?? crypto.randomBytes(24).toString("hex") : args.apiKey;
  const baseUrl = args.copilot ? buildCopilotBridgeBaseUrl(runtime as ProviderRuntime) : args.baseUrl ?? undefined;

  const next = {
    providers: {
      ...providers.providers,
      [args.providerName]: cleanProviderRecord({
        profile: args.profile,
        apiKey,
        model: providerModel,
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
        upsertModelProviders,
        scrubModelProviderEnvKeys: [args.profile],
      });
      // Persist only the normalized provider payload so later reads are deterministic.
      writeProvidersFile(args.providersPath, next);
      applyConfigMutation(args.configPath, document, configPlan);
      return {
        provider: args.providerName,
        model: providerModel,
        modelProvider: args.profile,
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
