#!/usr/bin/env node
import { CommandExecutionContext } from "./commands/types";
import { parseArgs } from "./commands/args";
import { buildHelpText, getKnownCommandNames, isKnownCommandNameForHelp } from "./commands/help";
import { cliError, normalizeError } from "./domain/errors";
import { RenderedOutput, renderFailure, renderSuccess } from "./cli/output";

const VERSION = (require("../package.json") as { version?: string }).version ?? "0.0.0";

/**
 * Line-oriented output sinks. Injected so tests drive the real dispatch ladder instead of
 * re-implementing it (P1-3).
 */
export type CliIo = {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
};

const processIo: CliIo = {
  stdout: (line) => {
    process.stdout.write(`${line}\n`);
  },
  stderr: (line) => {
    process.stderr.write(`${line}\n`);
  },
};

/**
 * Writes rendered output through the injected sinks and reports its exit code.
 */
function emit(rendered: RenderedOutput, io: CliIo): number {
  for (const line of rendered.stdout) {
    io.stdout(line);
  }
  for (const line of rendered.stderr) {
    io.stderr(line);
  }
  return rendered.exitCode;
}

/**
 * Runs one CLI invocation and returns its exit code rather than exiting, so exit codes are
 * observable from tests (P1-3). `renderSuccess`/`renderFailure` always populate exactly one
 * stream, so emitting both preserves the original ordering.
 */
export async function runCli(argv: string[], io: CliIo = processIo): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.versionRequested) {
    io.stdout(VERSION);
    return 0;
  }

  if (parsed.helpRequested) {
    if (parsed.helpTarget && !isKnownCommandNameForHelp(parsed.helpTarget)) {
      return emit(
        renderFailure(
          { command: "help", options: parsed.globalOptions },
          normalizeError(
            cliError("INVALID_ARGUMENT", `Unknown help topic: ${parsed.helpTarget}`, {
              availableCommands: getKnownCommandNames(),
            })
          )
        ),
        io
      );
    }

    io.stdout(buildHelpText(parsed.helpTarget));
    return 0;
  }

  if (!parsed.command) {
    io.stdout(buildHelpText());
    return 0;
  }

  const ctx: CommandExecutionContext = {
    command: parsed.command,
    options: parsed.globalOptions,
  };

  try {
    const { executeCommand } = await import("./commands/dispatch");
    const result = await executeCommand(ctx, parsed);
    return emit(renderSuccess(ctx, result), io);
  } catch (error: unknown) {
    return emit(renderFailure(ctx, normalizeError(error)), io);
  }
}

if (require.main === module) {
  // `process.exitCode` rather than `process.exit`: exiting right after a write to a pipe can
  // truncate stdout on POSIX, and the resulting exit code is identical either way.
  void runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
