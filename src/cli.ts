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
import { createCodexPaths } from "./infra/codex-paths";
import { parseArgs, getSingleOption, hasFlag } from "./cli/args";
import { outputFailure, outputSuccess } from "./cli/output";

const VERSION = "0.0.2";

const HELP_TEXT = `codex-switch

Usage:
  codexs <command> [options]

Commands:
  codexs list
  codexs current
  codexs switch <provider> [--no-login]
  codexs status
  codexs import <file>
  codexs export <file> [--force]
  codexs add <provider> --profile <name> --api-key <key> [--base-url <url>] [--note <text>] [--tag <tag> ...]
  codexs remove <provider> --force
  codexs doctor
  codexs rollback

Global options:
  --json
  --codex-dir <path>
  --help
  --version`;

/**
 * Prints the command help text to stdout.
 */
export function printHelp(): void {
  process.stdout.write(`${HELP_TEXT}\n`);
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

  if (!parsed.command) {
    printHelp();
    process.exit(0);
  }

  if (parsed.command === "help") {
    printHelp();
    process.exit(0);
  }

  if (parsed.command === "version") {
    printVersion();
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
export async function executeCommand(ctx: CommandContext, parsed: ParsedArgs): Promise<CommandResult> {
  const paths = createCodexPaths(ctx.options.codexDir);

  switch (ctx.command) {
    case "list":
      return listProviders(paths.providersPath);
    case "current":
      return getCurrentProfile(paths.configPath);
    case "status":
      return getStatus(paths.codexDir, paths.configPath, paths.providersPath);
    case "switch": {
      const providerName = parsed.positionals[0];
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

      return exportProviders({
        providersPath: paths.providersPath,
        targetFile,
        force: hasFlag(parsed.commandOptions, "--force"),
      });
    }
    case "add": {
      const providerName = parsed.positionals[0];
      if (!providerName) {
        throw cliError("INVALID_IMPORT_FILE", "Missing provider name for add command.");
      }

      const profile = getSingleOption(parsed.commandOptions, "--profile");
      const apiKey = getSingleOption(parsed.commandOptions, "--api-key");
      if (!profile || !apiKey) {
        throw cliError("INVALID_IMPORT_FILE", "add requires --profile and --api-key.");
      }

      return addProvider({
        codexDir: paths.codexDir,
        backupsDir: paths.backupsDir,
        latestBackupPath: paths.latestBackupPath,
        providersPath: paths.providersPath,
        providerName,
        profile,
        apiKey,
        baseUrl: getSingleOption(parsed.commandOptions, "--base-url", false),
        note: getSingleOption(parsed.commandOptions, "--note", false),
        tags: parsed.commandOptions.get("--tag") ?? [],
      });
    }
    case "remove": {
      const providerName = parsed.positionals[0];
      if (!providerName) {
        throw cliError("PROVIDER_NOT_FOUND", "Missing provider name for remove command.");
      }

      if (!hasFlag(parsed.commandOptions, "--force")) {
        throw cliError("INVALID_IMPORT_FILE", "remove requires --force.");
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
      return rollbackLatest(paths.latestBackupPath);
    default:
      throw cliError("INVALID_IMPORT_FILE", `Unknown command: ${ctx.command}`);
  }
}

if (require.main === module) {
  main();
}
