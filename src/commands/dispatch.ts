import { cliError } from "../domain/errors";
import { createPromptRuntime, CliPromptRuntime } from "../interaction/prompt";
import { findCommandDefinition } from "./registry";
import { CommandExecutionContext, ParsedCommand } from "./types";

/**
 * Resolves the shared command definition and executes its registered handler.
 */
export async function executeCommand(
  ctx: CommandExecutionContext,
  parsed: ParsedCommand,
  runtime: CliPromptRuntime = createPromptRuntime()
) {
  const definition = findCommandDefinition(ctx.command);
  if (!definition) {
    throw cliError("UNKNOWN_COMMAND", `Unknown command: ${ctx.command}`);
  }

  return definition.handler(ctx, parsed, runtime);
}
