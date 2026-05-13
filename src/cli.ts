#!/usr/bin/env node
import * as fs from "node:fs";
import { addProvider } from "./app/add-provider";
import { editProvider } from "./app/edit-provider";
import { exportProviders } from "./app/export-providers";
import { getCurrentProfile } from "./app/get-current-profile";
import { getStatus } from "./app/get-status";
import { importProviders } from "./app/import-providers";
import { listConfigProfilesView } from "./app/list-config-profiles";
import { listBackupEntries } from "./app/list-backups";
import { listProviders } from "./app/list-providers";
import { removeProvider } from "./app/remove-provider";
import { rollbackBackup } from "./app/rollback-backup";
import { runDoctor } from "./app/run-doctor";
import { setupCodex } from "./app/setup-codex";
import { showConfig } from "./app/show-config";
import { showProvider } from "./app/show-provider";
import { switchProvider } from "./app/switch-provider";
import { CommandContext, CommandResult, ParsedArgs } from "./app/types";
import { buildManagedProfileViews } from "./domain/config";
import { cliError, normalizeError } from "./domain/errors";
import { validateProvidersShape } from "./domain/providers";
import { findCodexDirCandidates, listConfigProfiles } from "./infra/config-repo";
import { readStructuredConfig } from "./infra/config-repo";
import { mergeProviders, readProvidersFileIfExists } from "./infra/providers-repo";
import { createCodexPaths } from "./infra/codex-paths";
import { parseArgs, getSingleOption, hasFlag } from "./cli/args";
import { collectAddInput, createNonInteractiveAddError } from "./cli/add-interactive";
import { buildHelpText, isKnownCommandName } from "./cli/help";
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
} from "./cli/interactive";
import { outputFailure, outputSuccess } from "./cli/output";
import { CliPromptRuntime, createPromptRuntime } from "./cli/prompt";

const VERSION = "0.0.5";

/**
 * Prints the command help text to stdout.
 */
export function printHelp(commandName?: string | null): void {
  process.stdout.write(`${buildHelpText(commandName)}\n`);
}

/**
 * Prints the current CLI version to stdout.
 */
export function printVersion(): void {
  process.stdout.write(`${VERSION}\n`);
}

/**
 * Parses arguments, dispatches the selected command, and renders the final output.
 */
function main(): void {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.versionRequested) {
    printVersion();
    process.exit(0);
  }

  if (parsed.helpRequested) {
    if (parsed.helpTarget && !isKnownCommandName(parsed.helpTarget)) {
      outputFailure(
        { command: "help", options: parsed.globalOptions },
        cliError("INVALID_ARGUMENT", `Unknown help topic: ${parsed.helpTarget}`, {
          availableCommands: buildHelpText(parsed.helpTarget).split("\n").slice(2),
        })
      );
      return;
    }

    printHelp(parsed.helpTarget);
    process.exit(0);
  }

  if (!parsed.command) {
    printHelp();
    process.exit(0);
  }

  const ctx: CommandContext = {
    command: parsed.command,
    options: parsed.globalOptions,
  };

  executeCommand(ctx, parsed)
    .then((result) => {
      outputSuccess(ctx, result);
    })
    .catch((error: unknown) => {
      outputFailure(ctx, normalizeError(error));
    });
}

/**
 * Dispatches a parsed CLI command into the application layer.
 */
export async function executeCommand(
  ctx: CommandContext,
  parsed: ParsedArgs,
  runtime: CliPromptRuntime = createPromptRuntime()
): Promise<CommandResult> {
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
      return getStatus(paths.codexDir, paths.configPath, paths.providersPath);
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

        return switchProvider({
        codexDir: paths.codexDir,
        backupsDir: paths.backupsDir,
        latestBackupPath: paths.latestBackupPath,
        configPath: paths.configPath,
        providersPath: paths.providersPath,
        authPath: paths.authPath,
        providerName,
        noLogin: hasFlag(parsed.commandOptions, "--no-login"),
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
        buildManagedProfileViews(document, next)
          .filter((view) => view.source === "orphaned-reference")
          .map((view) => view.name)
          .sort();
      }

      return importProviders({
        codexDir: paths.codexDir,
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
      const createProfile = hasFlag(parsed.commandOptions, "--create-profile");

      if (!providerName || !profile || !apiKey) {
        if (ctx.options.json || !runtime.isInteractive()) {
          throw createNonInteractiveAddError();
        }

        const prompted = await collectAddInput(
          runtime,
          {
            providerName,
            profile,
            apiKey,
            baseUrl,
            note,
            tags,
          },
          (candidate) => Boolean(readProvidersFileIfExists(paths.providersPath).providers[candidate])
        );

        providerName = prompted.providerName;
        profile = prompted.profile;
        apiKey = prompted.apiKey;
        baseUrl = prompted.baseUrl ?? null;
        note = prompted.note ?? null;
        tags = prompted.tags;
      }

      return addProvider({
        codexDir: paths.codexDir,
        backupsDir: paths.backupsDir,
        latestBackupPath: paths.latestBackupPath,
        providersPath: paths.providersPath,
        configPath: paths.configPath,
        providerName,
        profile,
        apiKey,
        baseUrl,
        model,
        note,
        tags,
        createProfile,
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
      let tags: string[] | undefined = parsed.commandOptions.has("--tag")
        ? parsed.commandOptions.get("--tag") ?? []
        : undefined;
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
        const prompted = await collectEditInput(runtime, provider);
        profile = prompted.profile;
        apiKey = prompted.apiKey;
        baseUrl = prompted.baseUrl;
        note = prompted.note;
        tags = prompted.tags;
      }

      if (
        profile === undefined &&
        apiKey === undefined &&
        baseUrl === undefined &&
        model === undefined &&
        note === undefined &&
        tags === undefined
      ) {
        throw cliError("INVALID_ARGUMENT", "edit requires at least one field to update.");
      }

      return editProvider({
        codexDir: paths.codexDir,
        backupsDir: paths.backupsDir,
        latestBackupPath: paths.latestBackupPath,
        providersPath: paths.providersPath,
        configPath: paths.configPath,
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
      });
    case "setup": {
      let codexDir = ctx.options.codexDir;
      const candidates = findCodexDirCandidates(ctx.options.codexDirExplicit ? ctx.options.codexDir : null);
      if (!ctx.options.codexDirExplicit) {
        if (candidates.length > 1) {
          if (!canPrompt(runtime, ctx.options.json)) {
            throw cliError("CODEX_DIR_AMBIGUOUS", "Multiple Codex directories were found.", {
              candidates,
            });
          }
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
        throw cliError("INVALID_ARGUMENT", "setup does not allow both --merge and --overwrite.");
      }

      let strategy: "merge" | "overwrite" | null = overwrite ? "overwrite" : merge ? "merge" : null;
      const providersExists = fs.existsSync(setupPaths.providersPath);
      if (providersExists && strategy === null) {
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

      const document = readStructuredConfig(setupPaths.configPath);
      const adoptableProfiles = buildManagedProfileViews(document, null)
        .filter((view) => view.source === "unmanaged" && view.model && view.modelProvider === view.name && view.baseUrl)
        .map((view) => ({
          name: view.name,
          model: view.model as string,
          baseUrl: view.baseUrl as string,
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
      const selectedProfiles = Array.from(listConfigProfiles(setupPaths.configPath)).sort();
      let adoptProfiles: string[] = [];
      let providerDetailsByProfile: Record<
        string,
        { providerName?: string; apiKey?: string; baseUrl?: string; note?: string; tags?: string[] }
      > = {};

      if (canPrompt(runtime, ctx.options.json)) {
        adoptProfiles = await chooseSetupProfiles(runtime, adoptableProfiles);
        providerDetailsByProfile = await collectSetupProviderDetails(runtime, adoptProfiles);
      } else {
        adoptProfiles = selectedProfiles.filter((profile) => Object.prototype.hasOwnProperty.call(providerDetailsByProfile, profile));
      }

      return setupCodex({
        codexDirOption: ctx.options.codexDir,
        codexDir: setupPaths.codexDir,
        configPath: setupPaths.configPath,
        providersPath: setupPaths.providersPath,
        backupsDir: setupPaths.backupsDir,
        latestBackupPath: setupPaths.latestBackupPath,
        strategy: strategy ?? "overwrite",
        adoptProfiles,
        providerDetailsByProfile,
      });
    }
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

if (require.main === module) {
  main();
}
