import * as fs from "node:fs";
import { addProvider } from "../app/add-provider";
import { editProvider } from "../app/edit-provider";
import { exportProviders } from "../app/export-providers";
import { getCurrentProfile } from "../app/get-current-profile";
import { getStatus } from "../app/get-status";
import { initCodex } from "../app/init-codex";
import { importProviders } from "../app/import-providers";
import { listConfigProfilesView } from "../app/list-config-profiles";
import { listBackupEntries } from "../app/list-backups";
import { listProviders } from "../app/list-providers";
import { removeProvider } from "../app/remove-provider";
import { rollbackBackup } from "../app/rollback-backup";
import { runDoctor } from "../app/run-doctor";
import { startBridge, statusBridge, stopBridge } from "../app/bridge";
import { migrateCodex } from "../app/setup-codex";
import { showConfig } from "../app/show-config";
import { showProvider } from "../app/show-provider";
import { switchProvider } from "../app/switch-provider";
import { buildManagedProfileViews } from "../domain/config";
import { cliError, normalizeError } from "../domain/errors";
import { collectMigrateAdoptability, SetupProviderDetails } from "../domain/setup";
import { validateProvidersShape } from "../domain/providers";
import { collectAddInput, collectCopilotAddInput, createNonInteractiveAddError } from "../interaction/add-interactive";
import {
  canPrompt,
  chooseCodexDir,
  chooseSetupProfiles,
  chooseSetupStrategy,
  collectEditInput,
  collectSetupProviderDetails,
  confirmExportOverwrite,
  confirmImport,
  confirmProviderRemoval,
  confirmRollback,
  exportTargetExists,
  promptForProviderSelection,
} from "../interaction/interactive";
import { CliPromptRuntime, createPromptRuntime } from "../interaction/prompt";
import { readCopilotAuthState } from "../runtime/copilot-adapter";
import { checkCopilotCliAvailable, runCopilotLogin } from "../runtime/copilot-cli";
import { installCopilotSdk as installCopilotSdkRuntime, probeCopilotSdkInstall } from "../runtime/copilot-installer";
import { findCodexDirCandidates, readStructuredConfig } from "../storage/config-repo";
import { createCodexPaths } from "../storage/codex-paths";
import { mergeProviders, readProvidersFileIfExists } from "../storage/providers-repo";
import { getSingleOption, hasFlag } from "./args";
import { CommandExecutionContext, ParsedCommand } from "./types";

/**
 * Executes one command handler selected from the shared command registry.
 */
export async function handleRegisteredCommand(
  ctx: CommandExecutionContext,
  parsed: ParsedCommand,
  runtime = createPromptRuntime()
): Promise<import("../app/types").CommandResult> {
  const packageVersion = (require("../../package.json") as { version?: string }).version ?? "0.0.0";
  if (!ctx.options.codexDir) {
    throw cliError("CODEX_DIR_NOT_FOUND", "No Codex directory could be resolved.");
  }
  let setupPaths = createCodexPaths(ctx.options.codexDir);
  const paths = setupPaths;

  switch (ctx.command) {
    case "list":
      return listProviders(paths.providersPath);
    case "show": {
      let providerName = parsed.positionals[0] ?? null;
      if (!providerName && canPrompt(runtime, ctx.options.json)) {
        providerName = await promptForProviderSelection(runtime, paths.providersPath, "Choose a provider to show");
      }

      if (!providerName) {
        throw cliError("INVALID_ARGUMENT", "Missing provider name for show command.");
      }
      return showProvider({
        providersPath: paths.providersPath,
        providerName,
        includeSecret: ctx.options.json,
      });
    }
    case "current":
      return getCurrentProfile(paths.configPath);
    case "status":
      return getStatus(paths.codexDir, paths.configPath, paths.providersPath, paths.authPath, {
        runtimeDir: paths.runtimeDir,
        runtimesDir: paths.runtimesDir,
      });
    case "bridge-start": {
      const providerName = parsed.positionals[0] ?? null;
      return startBridge({
        providersPath: paths.providersPath,
        configPath: paths.configPath,
        runtimeDir: paths.runtimeDir,
        runtimesDir: paths.runtimesDir,
        providerName,
        runtime,
        json: ctx.options.json,
      });
    }
    case "bridge-stop": {
      const providerName = parsed.positionals[0] ?? null;
      return stopBridge({
        providersPath: paths.providersPath,
        configPath: paths.configPath,
        runtimeDir: paths.runtimeDir,
        runtimesDir: paths.runtimesDir,
        providerName,
        runtime,
        json: ctx.options.json,
      });
    }
    case "bridge-status": {
      const providerName = parsed.positionals[0] ?? null;
      return statusBridge({
        providersPath: paths.providersPath,
        configPath: paths.configPath,
        runtimeDir: paths.runtimeDir,
        runtimesDir: paths.runtimesDir,
        providerName,
        runtime,
        json: ctx.options.json,
      });
    }
    case "init": {
      return initCodex({
        toolHomeDir: setupPaths.toolHomeDir,
        toolConfigPath: setupPaths.toolConfigPath,
        providersPath: setupPaths.providersPath,
        version: packageVersion,
        defaultCodexDir: ctx.options.codexDirExplicit ? setupPaths.codexDir : null,
      });
    }
    case "login": {
      const upstream = (parsed.positionals[0] ?? "").toLowerCase();
      if (ctx.options.json || !runtime.isInteractive()) {
        throw cliError("COPILOT_LOGIN_REQUIRES_TTY", "login requires an interactive TTY and does not support --json.");
      }
      if (upstream !== "copilot" && upstream !== "github-copilot") {
        throw cliError("INVALID_ARGUMENT", `Unsupported upstream "${parsed.positionals[0] ?? ""}".`, {
          supportedUpstreams: ["copilot", "github-copilot"],
        });
      }
      const installed = probeCopilotSdkInstall(paths.runtimesDir);
      let installedNow = false;
      if (!installed.installed) {
        const confirmInstall = await runtime.confirmAction("The Copilot SDK runtime is not installed. Install it now?", {
          defaultValue: true,
        });
        if (!confirmInstall) {
          throw cliError("COPILOT_SDK_MISSING", "The optional Copilot SDK runtime is not installed.", {
            installDir: installed.installDir,
            packageName: installed.packageName,
          });
        }
        runtime.writeLine("Installing Copilot SDK runtime...");
        installCopilotSdkRuntime(paths.runtimesDir);
        installedNow = true;
      }
      try {
        await readCopilotAuthState(paths.runtimesDir);
        return {
          data: {
            upstream: "github-copilot",
            sdkInstalled: true,
            sdkInstalledNow: installedNow,
            authReady: true,
            loginLaunched: false,
          },
        };
      } catch (error: unknown) {
        const normalized = normalizeError(error);
        if (normalized.code !== "COPILOT_AUTH_REQUIRED") {
          throw error;
        }
      }
      const availability = checkCopilotCliAvailable(paths.runtimesDir);
      if (!availability.ok) {
        throw cliError("COPILOT_CLI_MISSING", "The official Copilot CLI could not be resolved from the installed runtime or PATH.", {
          cause: availability.cause,
          source: availability.source ?? null,
          command: availability.command ?? null,
        });
      }
      try {
        runCopilotLogin({ runtimesDir: paths.runtimesDir });
      } catch (error: unknown) {
        throw cliError("COPILOT_LOGIN_LAUNCH_FAILED", "Failed to launch `copilot login`.", {
          cause: error instanceof Error ? error.message : String(error),
        });
      }
      try {
        await readCopilotAuthState(paths.runtimesDir);
      } catch (error: unknown) {
        const normalized = normalizeError(error);
        if (normalized.code === "COPILOT_AUTH_REQUIRED") {
          throw cliError("COPILOT_LOGIN_RECHECK_FAILED", "Copilot login completed but auth readiness recheck still failed.", {
            ...(normalized.details ?? {}),
          });
        }
        throw error;
      }
      return {
        data: {
          upstream: "github-copilot",
          sdkInstalled: true,
          sdkInstalledNow: installedNow,
          authReady: true,
          loginLaunched: true,
        },
      };
    }
    case "config-show":
      return showConfig({
        configPath: paths.configPath,
        providersPath: paths.providersPath,
        profileName: parsed.positionals[0] ?? null,
      });
    case "config-list-profiles":
      return listConfigProfilesView({
        configPath: paths.configPath,
        providersPath: paths.providersPath,
      });
    case "switch": {
      let providerName = parsed.positionals[0] ?? null;
      if (!providerName && canPrompt(runtime, ctx.options.json)) {
        providerName = await promptForProviderSelection(runtime, paths.providersPath, "Choose a provider to switch to");
      }

      if (!providerName) {
        throw cliError("PROVIDER_NOT_FOUND", "Missing provider name for switch command.");
      }
      if (hasFlag(parsed.commandOptions, "--install-copilot-sdk")) {
        throw cliError("INVALID_ARGUMENT", "--install-copilot-sdk is no longer supported with switch. Run `codexs login copilot` instead.", {
          suggestion: "Run `codexs login copilot` first, then rerun switch without --install-copilot-sdk.",
        });
      }

      return switchProvider({
        codexDir: paths.codexDir,
        lockPath: paths.lockPath,
        backupsDir: paths.backupsDir,
        latestBackupPath: paths.latestBackupPath,
        configPath: paths.configPath,
        providersPath: paths.providersPath,
        authPath: paths.authPath,
        runtimeDir: paths.runtimeDir,
        runtimesDir: paths.runtimesDir,
        providerName,
      });
    }
    case "import": {
      const sourceFile = parsed.positionals[0];
      if (!sourceFile) {
        throw cliError("INVALID_ARGUMENT", "Missing import file path.");
      }
      const merge = hasFlag(parsed.commandOptions, "--merge");
      if (canPrompt(runtime, ctx.options.json)) {
        await confirmImport(runtime, sourceFile, merge);
        const document = readStructuredConfig(paths.configPath);
        const imported = validateProvidersShape(JSON.parse(fs.readFileSync(sourceFile, "utf8")));
        const current = readProvidersFileIfExists(paths.providersPath);
        const next = merge ? mergeProviders(current, imported) : imported;
        // Precompute orphaned references during confirmation so the interactive path fails before mutation.
        buildManagedProfileViews(document, next)
          .filter((view) => view.source === "orphaned-reference")
          .map((view) => view.name)
          .sort();
      }

      return importProviders({
        codexDir: paths.codexDir,
        lockPath: paths.lockPath,
        backupsDir: paths.backupsDir,
        latestBackupPath: paths.latestBackupPath,
        providersPath: paths.providersPath,
        configPath: paths.configPath,
        sourceFile,
        merge,
      });
    }
    case "export": {
      const targetFile = parsed.positionals[0];
      if (!targetFile) {
        throw cliError("INVALID_ARGUMENT", "Missing export file path.");
      }

      let force = hasFlag(parsed.commandOptions, "--force");
      if (!force && canPrompt(runtime, ctx.options.json) && exportTargetExists(targetFile)) {
        const confirmed = await confirmExportOverwrite(runtime, targetFile);
        if (!confirmed) {
          throw cliError("PROMPT_CANCELLED", "Export cancelled.");
        }
        force = true;
      }

      return exportProviders({
        providersPath: paths.providersPath,
        targetFile,
        force,
      });
    }
    case "add": {
      let providerName = parsed.positionals[0] ?? null;
      let profile = getSingleOption(parsed.commandOptions, "--profile");
      let apiKey = getSingleOption(parsed.commandOptions, "--api-key");
      let baseUrl = getSingleOption(parsed.commandOptions, "--base-url", false);
      let model = getSingleOption(parsed.commandOptions, "--model", false);
      let note = getSingleOption(parsed.commandOptions, "--note", false);
      let tags = parsed.commandOptions.get("--tag") ?? [];
      let createProfile = hasFlag(parsed.commandOptions, "--create-profile");
      const copilot = hasFlag(parsed.commandOptions, "--copilot");
      let bridgeHost = getSingleOption(parsed.commandOptions, "--bridge-host", false);
      const bridgePortValue = getSingleOption(parsed.commandOptions, "--bridge-port", false);
      let bridgeApiKey = getSingleOption(parsed.commandOptions, "--bridge-api-key", false);
      const installCopilotSdk = hasFlag(parsed.commandOptions, "--install-copilot-sdk");
      let bridgePort = bridgePortValue ? Number(bridgePortValue) : null;

      if (copilot && apiKey) {
        throw cliError("INVALID_ARGUMENT", "--copilot does not allow --api-key. Use --bridge-api-key for the local bridge secret.");
      }
      if (copilot && installCopilotSdk) {
        throw cliError("INVALID_ARGUMENT", "--install-copilot-sdk is no longer supported with add --copilot. Run `codexs login copilot` instead.", {
          suggestion: "Run `codexs login copilot` first, then rerun add --copilot.",
        });
      }
      if (bridgePortValue && (!Number.isInteger(bridgePort) || bridgePort === null || bridgePort <= 0)) {
        throw cliError("INVALID_ARGUMENT", "--bridge-port must be a positive integer.");
      }

      if (!providerName || !profile || (!apiKey && !copilot)) {
        if (ctx.options.json || !runtime.isInteractive()) {
          throw createNonInteractiveAddError({ copilot });
        }

        if (copilot) {
          const prompted = await collectCopilotAddInput(
            runtime,
            {
              providerName,
              profile,
              model,
              note,
              tags,
            },
            (candidate) => Boolean(readProvidersFileIfExists(paths.providersPath).providers[candidate]),
            (candidate) => Boolean(readStructuredConfig(paths.configPath).profiles.find((profileView) => profileView.name === candidate)),
            {
              bridgeHost,
              bridgePort,
              bridgeApiKey,
            }
          );

          providerName = prompted.providerName;
          profile = prompted.profile;
          model = prompted.model ?? null;
          note = prompted.note ?? null;
          tags = prompted.tags;
          createProfile = createProfile || prompted.createProfile;
          baseUrl = null;
          bridgeHost = prompted.bridgeHost ?? bridgeHost;
          bridgePort = prompted.bridgePort ?? bridgePort;
          bridgeApiKey = prompted.bridgeApiKey ?? bridgeApiKey;
        } else {
          const prompted = await collectAddInput(
            runtime,
            {
              providerName,
              profile,
              apiKey,
              model,
              baseUrl,
              note,
              tags,
            },
            (candidate) => Boolean(readProvidersFileIfExists(paths.providersPath).providers[candidate]),
            (candidate) => Boolean(readStructuredConfig(paths.configPath).profiles.find((profileView) => profileView.name === candidate))
          );

          providerName = prompted.providerName;
          profile = prompted.profile;
          apiKey = prompted.apiKey;
          model = prompted.model ?? null;
          baseUrl = prompted.baseUrl ?? null;
          note = prompted.note ?? null;
          tags = prompted.tags;
          createProfile = createProfile || prompted.createProfile;
        }
      }

      return addProvider({
        codexDir: paths.codexDir,
        toolHomeDir: paths.toolHomeDir,
        lockPath: paths.lockPath,
        runtimesDir: paths.runtimesDir,
        backupsDir: paths.backupsDir,
        latestBackupPath: paths.latestBackupPath,
        providersPath: paths.providersPath,
        configPath: paths.configPath,
        authPath: paths.authPath,
        providerName,
        profile,
        apiKey: apiKey ?? "",
        baseUrl,
        model,
        note,
        tags,
        createProfile,
        copilot,
        bridgeHost,
        bridgePort,
        bridgeApiKey,
      });
    }
    case "edit": {
      let providerName = parsed.positionals[0] ?? null;
      if (!providerName && canPrompt(runtime, ctx.options.json)) {
        providerName = await promptForProviderSelection(runtime, paths.providersPath, "Choose a provider to edit");
      }

      if (!providerName) {
        throw cliError("INVALID_ARGUMENT", "Missing provider name for edit command.");
      }

      let profile: string | undefined = getSingleOption(parsed.commandOptions, "--profile", false) ?? undefined;
      let apiKey: string | undefined = getSingleOption(parsed.commandOptions, "--api-key", false) ?? undefined;
      let baseUrl: string | undefined = getSingleOption(parsed.commandOptions, "--base-url", false) ?? undefined;
      let model: string | undefined = getSingleOption(parsed.commandOptions, "--model", false) ?? undefined;
      let note: string | undefined = getSingleOption(parsed.commandOptions, "--note", false) ?? undefined;
      let tags: string[] | undefined = parsed.commandOptions.has("--tag") ? parsed.commandOptions.get("--tag") ?? [] : undefined;
      const createProfile = hasFlag(parsed.commandOptions, "--create-profile");
      const switchToProfile = getSingleOption(parsed.commandOptions, "--switch-to", false) ?? undefined;

      if (
        profile === undefined &&
        apiKey === undefined &&
        baseUrl === undefined &&
        model === undefined &&
        note === undefined &&
        tags === undefined &&
        canPrompt(runtime, ctx.options.json)
      ) {
        const provider = readProvidersFileIfExists(paths.providersPath).providers[providerName];
        if (!provider) {
          throw cliError("PROVIDER_NOT_FOUND", `Provider "${providerName}" was not found.`);
        }
        // Prompted edit starts from the stored record so blank answers can safely preserve current values.
        const prompted = await collectEditInput(runtime, provider);
        profile = prompted.profile;
        apiKey = prompted.apiKey;
        baseUrl = prompted.baseUrl;
        note = prompted.note;
        tags = prompted.tags;
      }

      if (profile === undefined && apiKey === undefined && baseUrl === undefined && model === undefined && note === undefined && tags === undefined) {
        throw cliError("INVALID_ARGUMENT", "edit requires at least one field to update.");
      }

      return editProvider({
        codexDir: paths.codexDir,
        lockPath: paths.lockPath,
        backupsDir: paths.backupsDir,
        latestBackupPath: paths.latestBackupPath,
        providersPath: paths.providersPath,
        configPath: paths.configPath,
        authPath: paths.authPath,
        providerName,
        profile,
        apiKey,
        baseUrl,
        model,
        note,
        tags,
        createProfile,
        switchToProfile,
      });
    }
    case "remove": {
      let providerName = parsed.positionals[0] ?? null;
      const force = hasFlag(parsed.commandOptions, "--force");
      const switchToProfile = getSingleOption(parsed.commandOptions, "--switch-to", false) ?? undefined;

      if (!providerName && canPrompt(runtime, ctx.options.json)) {
        providerName = await promptForProviderSelection(runtime, paths.providersPath, "Choose a provider to remove");
      }

      if (!providerName) {
        throw cliError("PROVIDER_NOT_FOUND", "Missing provider name for remove command.");
      }

      if (!force && !canPrompt(runtime, ctx.options.json)) {
        throw cliError("INVALID_ARGUMENT", "remove requires --force.");
      }

      if (canPrompt(runtime, ctx.options.json)) {
        await confirmProviderRemoval(runtime, providerName);
      }

      return removeProvider({
        codexDir: paths.codexDir,
        lockPath: paths.lockPath,
        backupsDir: paths.backupsDir,
        latestBackupPath: paths.latestBackupPath,
        providersPath: paths.providersPath,
        configPath: paths.configPath,
        providerName,
        switchToProfile,
      });
    }
    case "doctor":
      return runDoctor({
        codexDir: paths.codexDir,
        configPath: paths.configPath,
        providersPath: paths.providersPath,
        authPath: paths.authPath,
        runtimeDir: paths.runtimeDir,
        runtimesDir: paths.runtimesDir,
      });
    case "migrate": {
      let codexDir = ctx.options.codexDir;
      const candidates = findCodexDirCandidates(ctx.options.codexDirExplicit ? ctx.options.codexDir : null);
      if (!ctx.options.codexDirExplicit) {
        if (candidates.length > 1) {
          if (!canPrompt(runtime, ctx.options.json)) {
            throw cliError("CODEX_DIR_AMBIGUOUS", "Multiple Codex directories were found.", {
              candidates,
            });
          }
          // Ambiguous auto-discovery must be resolved before path-dependent flags are interpreted.
          codexDir = await chooseCodexDir(runtime, candidates);
        } else if (candidates.length === 0) {
          if (!canPrompt(runtime, ctx.options.json)) {
            throw cliError("CODEX_DIR_NOT_FOUND", "No Codex directory could be found.");
          }
          codexDir = await chooseCodexDir(runtime, candidates);
        } else {
          codexDir = candidates[0];
        }
      }
      setupPaths = createCodexPaths(codexDir);
      const overwrite = hasFlag(parsed.commandOptions, "--overwrite");
      const merge = hasFlag(parsed.commandOptions, "--merge");
      if (overwrite && merge) {
        throw cliError("INVALID_ARGUMENT", "migrate does not allow both --merge and --overwrite.");
      }

      const providersExists = fs.existsSync(setupPaths.providersPath);
      const document = readStructuredConfig(setupPaths.configPath);
      const currentProviders = providersExists ? validateProvidersShape(readProvidersFileIfExists(setupPaths.providersPath)) : null;
      const adoptability = collectMigrateAdoptability(document, currentProviders);
      if (adoptability.availableProfiles.length === 0) {
        throw cliError("PROFILE_NOT_FOUND", "No profiles were found in config.toml.", {
          file: setupPaths.configPath,
        });
      }
      if (adoptability.adoptableProfiles.length === 0) {
        throw cliError("MIGRATE_NO_ADOPTABLE_PROFILES", "No adoptable profiles were found for migrate.", {
          availableProfiles: adoptability.availableProfiles,
          adoptableProfiles: adoptability.adoptableProfiles,
          blockingReasonsByProfile: adoptability.blockingReasonsByProfile,
        });
      }

      let strategy: "merge" | "overwrite" | null = overwrite ? "overwrite" : merge ? "merge" : null;
      const registryIsEmpty = !currentProviders || Object.keys(currentProviders.providers).length === 0;
      if (providersExists && strategy === null && !registryIsEmpty) {
        if (!canPrompt(runtime, ctx.options.json)) {
          throw cliError("PROVIDERS_ALREADY_EXISTS", "providers.json already exists. Pass --merge or --overwrite.", {
            file: setupPaths.providersPath,
          });
        }

        const selected = await chooseSetupStrategy(runtime);
        if (selected === "cancel") {
          throw cliError("PROMPT_CANCELLED", "Setup cancelled.");
        }
        strategy = selected;
      }

      const adoptableProfiles = adoptability.adoptableProfileDetails;
      let adoptProfiles: string[] = [];
      let providerDetailsByProfile: Record<string, SetupProviderDetails> = {};

      if (canPrompt(runtime, ctx.options.json)) {
        adoptProfiles = await chooseSetupProfiles(runtime, adoptableProfiles);
        // Defaults are derived from config.toml so interactive setup only asks for missing provider metadata.
        const collectedDetails = await collectSetupProviderDetails(
          runtime,
          adoptProfiles,
          adoptableProfiles.reduce<Record<string, { providerName?: string; baseUrl?: string }>>((accumulator, profile) => {
            accumulator[profile.name] = {
              providerName: profile.name,
              baseUrl: profile.baseUrl,
            };
            return accumulator;
          }, {})
        );
        providerDetailsByProfile = Object.fromEntries(
          Object.entries(collectedDetails).map(([profile, detail]) => [
            profile,
            {
              providerName: detail.providerName,
              apiKey: detail.apiKey,
              baseUrl: detail.baseUrl,
              note: detail.note,
              tags: detail.tags,
            },
          ])
        );
      } else {
        throw cliError(
          "INVALID_ARGUMENT",
          "migrate currently requires an interactive TTY to choose adoptable profiles and collect provider details.",
          {
            availableProfiles: adoptability.availableProfiles,
            adoptableProfiles: adoptability.adoptableProfiles,
            blockingReasonsByProfile: adoptability.blockingReasonsByProfile,
            suggestion: "Run `codexs migrate` in an interactive terminal. Non-interactive migrate flags for profile selection and provider secrets are not available in this release.",
          }
        );
      }

      return migrateCodex({
        codexDirOption: ctx.options.codexDir,
        codexDir: setupPaths.codexDir,
        lockPath: setupPaths.lockPath,
        configPath: setupPaths.configPath,
        providersPath: setupPaths.providersPath,
        authPath: setupPaths.authPath,
        runtimeDir: setupPaths.runtimeDir,
        runtimesDir: setupPaths.runtimesDir,
        backupsDir: setupPaths.backupsDir,
        latestBackupPath: setupPaths.latestBackupPath,
        strategy: strategy ?? "overwrite",
        adoptProfiles,
        providerDetailsByProfile,
      });
    }
    case "setup":
      throw cliError("COMMAND_DEPRECATED", "setup has been split into init and migrate.", {
        replacements: ["init", "migrate"],
      });
    case "backups-list":
      return listBackupEntries(paths.backupsDir);
    case "rollback":
      if (parsed.positionals.length > 1) {
        throw cliError("INVALID_ARGUMENT", "rollback accepts at most one backup id.");
      }
      if (canPrompt(runtime, ctx.options.json)) {
        await confirmRollback(runtime, paths.latestBackupPath, paths.backupsDir, parsed.positionals[0] ?? null);
      }
      return rollbackBackup({
        latestBackupPath: paths.latestBackupPath,
        backupsDir: paths.backupsDir,
        backupId: parsed.positionals[0] ?? null,
      });
    default:
      throw cliError("UNKNOWN_COMMAND", `Unknown command: ${ctx.command}`);
  }
}
