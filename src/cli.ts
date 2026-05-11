#!/usr/bin/env node
import { addProvider } from "./app/add-provider";
import { exportProviders } from "./app/export-providers";
import { getCurrentProfile } from "./app/get-current-profile";
import { getStatus } from "./app/get-status";
import { importProviders } from "./app/import-providers";
import { listProviders } from "./app/list-providers";
import { removeProvider } from "./app/remove-provider";
import { rollbackLatest } from "./app/rollback-latest";
import { runDoctor } from "./app/run-doctor";
import { switchProvider } from "./app/switch-provider";
import { CommandContext, CommandResult, ParsedArgs } from "./app/types";
import { cliError, normalizeError } from "./domain/errors";
import { readProvidersFileIfExists } from "./infra/providers-repo";
import { createCodexPaths } from "./infra/codex-paths";
import { parseArgs, getSingleOption, hasFlag } from "./cli/args";
import { collectAddInput, createNonInteractiveAddError } from "./cli/add-interactive";
import { buildHelpText, isKnownCommandName } from "./cli/help";
import {
  canPrompt,
  confirmExportOverwrite,
  confirmImport,
  confirmProviderRemoval,
  confirmRollback,
  exportTargetExists,
  promptForProviderSelection,
} from "./cli/interactive";
import { outputFailure, outputSuccess } from "./cli/output";
import { CliPromptRuntime, createPromptRuntime } from "./cli/prompt";

const VERSION = "0.0.3";

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
        cliError("INVALID_IMPORT_FILE", `Unknown help topic: ${parsed.helpTarget}`, {
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
  const paths = createCodexPaths(ctx.options.codexDir);

  switch (ctx.command) {
    case "list":
      return listProviders(paths.providersPath);
    case "current":
      return getCurrentProfile(paths.configPath);
    case "status":
      return getStatus(paths.codexDir, paths.configPath, paths.providersPath);
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
        throw cliError("INVALID_IMPORT_FILE", "Missing import file path.");
      }

      if (canPrompt(runtime, ctx.options.json)) {
        await confirmImport(runtime, sourceFile);
      }

      return importProviders({
        codexDir: paths.codexDir,
        backupsDir: paths.backupsDir,
        latestBackupPath: paths.latestBackupPath,
        providersPath: paths.providersPath,
        sourceFile,
      });
    }
    case "export": {
      const targetFile = parsed.positionals[0];
      if (!targetFile) {
        throw cliError("INVALID_IMPORT_FILE", "Missing export file path.");
      }

      let force = hasFlag(parsed.commandOptions, "--force");
      if (!force && canPrompt(runtime, ctx.options.json) && exportTargetExists(targetFile)) {
        const confirmed = await confirmExportOverwrite(runtime, targetFile);
        if (!confirmed) {
          throw cliError("INVALID_IMPORT_FILE", "Export cancelled.");
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
      let note = getSingleOption(parsed.commandOptions, "--note", false);
      let tags = parsed.commandOptions.get("--tag") ?? [];

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
          (candidate) => Boolean(readProvidersFileIfExists(paths.providersPath).providers[candidate]),
          paths.configPath
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
        providerName,
        profile,
        apiKey,
        baseUrl,
        note,
        tags,
      });
    }
    case "remove": {
      let providerName = parsed.positionals[0] ?? null;
      const force = hasFlag(parsed.commandOptions, "--force");

      if (!providerName && canPrompt(runtime, ctx.options.json)) {
        providerName = await promptForProviderSelection(runtime, paths.providersPath, "Choose a provider to remove");
      }

      if (!providerName) {
        throw cliError("PROVIDER_NOT_FOUND", "Missing provider name for remove command.");
      }

      if (!force && !canPrompt(runtime, ctx.options.json)) {
        throw cliError("INVALID_IMPORT_FILE", "remove requires --force.");
      }

      if (canPrompt(runtime, ctx.options.json)) {
        await confirmProviderRemoval(runtime, providerName);
      }

      return removeProvider({
        codexDir: paths.codexDir,
        backupsDir: paths.backupsDir,
        latestBackupPath: paths.latestBackupPath,
        providersPath: paths.providersPath,
        providerName,
      });
    }
    case "doctor":
      return runDoctor({
        codexDir: paths.codexDir,
        configPath: paths.configPath,
        providersPath: paths.providersPath,
      });
    case "rollback":
      if (canPrompt(runtime, ctx.options.json)) {
        await confirmRollback(runtime, paths.latestBackupPath);
      }
      return rollbackLatest(paths.latestBackupPath);
    default:
      throw cliError("INVALID_IMPORT_FILE", `Unknown command: ${ctx.command}`);
  }
}

if (require.main === module) {
  main();
}
