import { CliErrorShape } from "../domain/errors";
import { printErrorDetails } from "../storage/fs-utils";
import { CommandResult } from "../app/types";
import { CommandExecutionContext } from "../commands/types";

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
export function renderSuccess(ctx: CommandExecutionContext, result: CommandResult): RenderedOutput {
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
export function renderFailure(ctx: CommandExecutionContext, error: CliErrorShape): RenderedOutput {
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
export function outputSuccess(ctx: CommandExecutionContext, result: CommandResult): void {
  const rendered = renderSuccess(ctx, result);
  for (const line of rendered.stdout) {
    printText(line);
  }
}

/**
 * Writes failure output to stderr and exits with the rendered status code.
 */
export function outputFailure(ctx: CommandExecutionContext, error: CliErrorShape): void {
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
          const envKey = provider.envKey ? ` envKey=${provider.envKey}` : "";
          lines.push(`${provider.name} -> ${provider.profile}${envKey}${tags}${note}`);
        }
      }
      break;
    }
    case "show": {
      const provider = (data?.provider as Record<string, unknown>) ?? {};
      lines.push(`Provider: ${String(data?.providerName ?? "")}`);
      lines.push(`profile: ${String(provider.profile ?? "")}`);
      lines.push(`apiKey: ${String(provider.apiKey ?? "")}`);
      lines.push(`envKey: ${String(provider.envKey ?? "")}`);
      if (provider.baseUrl) {
        lines.push(`baseUrl: ${String(provider.baseUrl)}`);
      }
      if (provider.note) {
        lines.push(`note: ${String(provider.note)}`);
      }
      if (Array.isArray(provider.tags) && provider.tags.length > 0) {
        lines.push(`tags: ${(provider.tags as string[]).join(", ")}`);
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
      lines.push(`activeProviderResolvable: ${String(data?.activeProviderResolvable ?? false)}`);
      const auth = (data?.auth as Record<string, unknown>) ?? {};
      lines.push(`authExists: ${String(auth.exists ?? false)}`);
      lines.push(`authManagedKeys: ${Array.isArray(auth.managedSecretKeys) ? (auth.managedSecretKeys as string[]).join(",") : ""}`);
      lines.push(`issues: ${Array.isArray(data?.issues) ? (data?.issues as Array<unknown>).length : 0}`);
      break;
    case "config-show": {
      lines.push(`activeProfile: ${String(data?.activeProfile ?? "")}`);
      const profiles = (data?.profiles as Array<Record<string, unknown>>) ?? [];
        for (const profile of profiles) {
          lines.push(
          `${String(profile.name)} managed=${String(profile.managed)} active=${String(profile.isActive)} source=${String(profile.source)} model=${String(profile.model ?? "")} modelProvider=${String(profile.modelProvider ?? "")} baseUrl=${String(profile.baseUrl ?? "")} envKey=${String(profile.envKey ?? "")}`
          );
        }
      break;
    }
    case "config-list-profiles": {
      const profiles = (data?.profiles as Array<Record<string, unknown>>) ?? [];
      for (const profile of profiles) {
        lines.push(
          `${String(profile.name)} managed=${String(profile.managed)} active=${String(profile.isActive)} source=${String(profile.source)}`
        );
      }
      break;
    }
    case "switch":
      lines.push(`Switched to provider ${String(data?.provider ?? "")} using profile ${String(data?.profile ?? "")}.`);
      lines.push(`envKey: ${String(data?.envKey ?? "")}`);
      lines.push(`Backup: ${String(data?.backupPath ?? "")}`);
      break;
    case "import":
      lines.push(`Imported providers from file using mode ${String(data?.mode ?? "replace")}. Backup: ${String(data?.backupPath ?? "")}`);
      break;
    case "export":
      lines.push(`Exported providers to ${String(data?.exportedTo ?? "")}.`);
      break;
    case "init":
      lines.push(`Initialized Codex directory ${String(data?.codexDir ?? "")}.`);
      lines.push(`Created codexDir: ${String(data?.createdCodexDir ?? false)}`);
      lines.push(`Created providers.json: ${String(data?.createdProvidersFile ?? false)}`);
      lines.push(`providersAlreadyExisted: ${String(data?.providersAlreadyExisted ?? false)}`);
      break;
    case "migrate":
      lines.push(`Migrated providers in ${String(data?.codexDir ?? "")} using ${String(data?.strategy ?? "")}.`);
      lines.push(`Providers initialized: ${String(data?.providersInitialized ?? 0)}`);
      lines.push(`Doctor healthy: ${String((data?.doctor as Record<string, unknown> | undefined)?.healthy ?? false)}`);
      lines.push(`Backup: ${String(data?.backupPath ?? "")}`);
      break;
    case "setup":
      lines.push("setup is deprecated. Use `codexs init` or `codexs migrate`.");
      break;
    case "edit":
      lines.push(`Updated provider ${String(data?.provider ?? "")}. Backup: ${String(data?.backupPath ?? "")}`);
      lines.push(`Updated fields: ${Array.isArray(data?.updatedFields) ? (data?.updatedFields as string[]).join(", ") : ""}`);
      break;
    case "add":
      lines.push(`Added provider ${String(data?.provider ?? "")}. Backup: ${String(data?.backupPath ?? "")}`);
      if (Array.isArray(data?.createdProfileSections) && (data?.createdProfileSections as string[]).length > 0) {
        lines.push(`Created profiles: ${(data?.createdProfileSections as string[]).join(", ")}`);
      }
      break;
    case "remove":
      lines.push(`Removed provider ${String(data?.provider ?? "")}. Backup: ${String(data?.backupPath ?? "")}`);
      if (Array.isArray(data?.deletedProfileSections) && (data?.deletedProfileSections as string[]).length > 0) {
        lines.push(`Deleted profiles: ${(data?.deletedProfileSections as string[]).join(", ")}`);
      }
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
    case "backups-list": {
      const backups = (data?.backups as Array<Record<string, unknown>>) ?? [];
      for (const backup of backups) {
        lines.push(`${backup.backupId} ${backup.reason} ${backup.createdAt}`);
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
