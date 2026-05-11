import { CliErrorShape } from "../domain/errors";
import { printErrorDetails } from "../infra/fs-utils";
import { CommandContext, CommandResult } from "../app/types";

export type JsonEnvelope = {
  ok: boolean;
  command: string;
  data: Record<string, unknown> | null;
  warnings: string[];
  error: CliErrorShape | null;
};

export type RenderedOutput = {
  stdout: string[];
  stderr: string[];
  exitCode: number;
};

/**
 * Renders a successful command result for either JSON or human-readable output.
 */
export function renderSuccess(ctx: CommandContext, result: CommandResult): RenderedOutput {
  const warnings = result.warnings ?? [];
  if (ctx.options.json) {
    const payload: JsonEnvelope = {
      ok: true,
      command: ctx.command,
      data: result.data,
      warnings,
      error: null,
    };

    return {
      stdout: [JSON.stringify(payload, null, 2)],
      stderr: [],
      exitCode: 0,
    };
  }

  return {
    stdout: renderHumanSuccess(ctx.command, result.data, warnings),
    stderr: [],
    exitCode: 0,
  };
}

/**
 * Renders a failed command result for either JSON or human-readable output.
 */
export function renderFailure(ctx: CommandContext, error: CliErrorShape): RenderedOutput {
  if (ctx.options.json) {
    const payload: JsonEnvelope = {
      ok: false,
      command: ctx.command,
      data: null,
      warnings: [],
      error,
    };

    return {
      stdout: [],
      stderr: [JSON.stringify(payload, null, 2)],
      exitCode: 1,
    };
  }

  return {
    stdout: [],
    stderr: [`${error.code}: ${error.message}`, ...printErrorDetails(error)],
    exitCode: 1,
  };
}

/**
 * Writes successful command output to stdout.
 */
export function outputSuccess(ctx: CommandContext, result: CommandResult): void {
  const rendered = renderSuccess(ctx, result);
  for (const line of rendered.stdout) {
    printText(line);
  }
}

/**
 * Writes failure output to stderr and exits with the rendered status code.
 */
export function outputFailure(ctx: CommandContext, error: CliErrorShape): void {
  const rendered = renderFailure(ctx, error);
  for (const line of rendered.stderr) {
    printText(line, true);
  }
  process.exit(rendered.exitCode);
}

/**
 * Builds the plain-text success view for interactive terminal usage.
 */
function renderHumanSuccess(command: string, data: Record<string, unknown> | null, warnings: string[]): string[] {
  const lines: string[] = [];
  switch (command) {
    case "list": {
      const providers = (data?.providers as Array<Record<string, unknown>>) ?? [];
      if (providers.length === 0) {
        lines.push("No providers configured.");
      } else {
        for (const provider of providers) {
          const tags = Array.isArray(provider.tags) && provider.tags.length > 0
            ? ` tags=${(provider.tags as string[]).join(",")}`
            : "";
          const note = provider.note ? ` note=${provider.note}` : "";
          lines.push(`${provider.name} -> ${provider.profile}${tags}${note}`);
        }
      }
      break;
    }
    case "current":
      lines.push(`Current profile: ${String(data?.profile ?? "")}`);
      break;
    case "status":
      lines.push(`codexDir: ${String(data?.codexDir ?? "")}`);
      lines.push(`configExists: ${String(data?.configExists ?? false)}`);
      lines.push(`providersExists: ${String(data?.providersExists ?? false)}`);
      lines.push(`currentProfile: ${String(data?.currentProfile ?? "")}`);
      lines.push(`mappedProvider: ${String(data?.provider ?? "")}`);
      break;
    case "switch":
      lines.push(`Switched to provider ${String(data?.provider ?? "")} using profile ${String(data?.profile ?? "")}.`);
      lines.push(`Backup: ${String(data?.backupPath ?? "")}`);
      lines.push(`Login performed: ${String(data?.loginPerformed ?? false)}`);
      break;
    case "import":
      lines.push(`Imported providers from file. Backup: ${String(data?.backupPath ?? "")}`);
      break;
    case "export":
      lines.push(`Exported providers to ${String(data?.exportedTo ?? "")}.`);
      break;
    case "add":
      lines.push(`Added provider ${String(data?.provider ?? "")}. Backup: ${String(data?.backupPath ?? "")}`);
      break;
    case "remove":
      lines.push(`Removed provider ${String(data?.provider ?? "")}. Backup: ${String(data?.backupPath ?? "")}`);
      break;
    case "doctor": {
      const healthy = Boolean(data?.healthy);
      lines.push(healthy ? "No issues found." : "Issues found:");
      const issues = (data?.issues as Array<Record<string, unknown>>) ?? [];
      for (const issue of issues) {
        lines.push(`${issue.code}: ${issue.message}`);
      }
      break;
    }
    case "rollback":
      lines.push(`Rollback restored files from ${String(data?.backupPath ?? "")}.`);
      break;
    default:
      lines.push(JSON.stringify(data, null, 2));
      break;
  }

  // Emit warnings after the primary payload so the main outcome remains easy to scan.
  for (const warning of warnings) {
    lines.push(`Warning: ${warning}`);
  }

  return lines;
}

/**
 * Writes one rendered line to either stdout or stderr.
 */
function printText(message: string, toStderr = false): void {
  if (toStderr) {
    process.stderr.write(`${message}\n`);
    return;
  }

  process.stdout.write(`${message}\n`);
}
