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
        const currentProfile = typeof data?.currentProfile === "string" ? data.currentProfile : null;
        const activeProviderResolvable = data?.activeProviderResolvable !== false;
        const activeCandidates = Array.isArray(data?.activeProviderCandidates) ? (data?.activeProviderCandidates as string[]) : [];
        if (currentProfile) {
          lines.push(`Current profile: ${currentProfile}`);
          if (!activeProviderResolvable && activeCandidates.length > 1) {
            lines.push(`Current provider: ambiguous (${activeCandidates.join(", ")})`);
          } else if (!activeProviderResolvable) {
            lines.push("Current provider: unmanaged or unresolved");
          }
        }
        for (const provider of providers) {
          const tags = Array.isArray(provider.tags) && provider.tags.length > 0
            ? ` tags=${(provider.tags as string[]).join(",")}`
            : "";
          const note = provider.note ? ` note=${provider.note}` : "";
          const current = provider.isActive ? " current" : "";
          lines.push(
            `${provider.name} [${String(provider.providerType ?? "direct")}]${current} -> ${provider.profile}${tags}${note}`
          );
        }
      }
      break;
    }
    case "show": {
      const provider = (data?.provider as Record<string, unknown>) ?? {};
      lines.push(`Provider: ${String(data?.providerName ?? "")}`);
      lines.push(`profile: ${String(provider.profile ?? "")}`);
      lines.push(`apiKey: ${String(provider.apiKey ?? "")}`);
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
      lines.push("Status summary:");
      lines.push(`  target runtime: ${String(data?.codexDir ?? "")}`);
      lines.push(`  tool home: ${String(((data?.storage as Record<string, unknown> | undefined)?.toolHome as Record<string, unknown> | undefined)?.root ?? "")}`);
      lines.push(`  current profile: ${String(data?.currentProfile ?? "(none)")}`);
      lines.push(`  mapped provider: ${renderStatusMappedProvider(data)}`);
      lines.push(`  provider path: ${renderStatusProviderPath(data)}`);
      lines.push(`  runtime health: ${renderStatusHealth(data)}`);
      lines.push(`  warnings: ${warnings.length}`);
      lines.push(`  next step: ${renderStatusNextStep(data, warnings)}`);
      break;
    case "config-show": {
      lines.push(`activeProfile: ${String(data?.activeProfile ?? "")}`);
      const profiles = (data?.profiles as Array<Record<string, unknown>>) ?? [];
        for (const profile of profiles) {
          lines.push(
          `${String(profile.name)} managed=${String(profile.managed)} active=${String(profile.isActive)} source=${String(profile.source)} model=${String(profile.model ?? "")} modelProvider=${String(profile.modelProvider ?? "")} baseUrl=${String(profile.baseUrl ?? "")}`
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
      lines.push(`Backup: ${String(data?.backupPath ?? "")}`);
      break;
    case "import":
      lines.push(`Imported providers from file using mode ${String(data?.mode ?? "replace")}. Backup: ${String(data?.backupPath ?? "")}`);
      break;
    case "export":
      lines.push(`Exported providers to ${String(data?.exportedTo ?? "")}.`);
      break;
    case "init":
      lines.push("Initialized codex-switch tool home.");
      lines.push(`tool home: ${String(data?.toolHomeDir ?? "")}`);
      lines.push(`tool config: ${String(data?.toolConfigPath ?? "")}`);
      lines.push(`providers registry: ${String(data?.providersPath ?? "")}`);
      lines.push(`tool home created: ${String(data?.createdToolHomeDir ?? false)}`);
      lines.push(`tool config created: ${String(data?.createdToolConfigFile ?? false)}`);
      lines.push(`providers registry created: ${String(data?.createdProvidersFile ?? false)}`);
      lines.push("next step: run `codexs add ...` for a direct provider, or `codexs login copilot` before `add --copilot`.");
      break;
    case "login":
      lines.push(`Copilot login ready: ${String(data?.authReady ?? false)}`);
      lines.push(`upstream: ${String(data?.upstream ?? "")}`);
      lines.push(`sdk installed: ${String(data?.sdkInstalled ?? false)}${data?.sdkInstalledNow ? " (installed now)" : ""}`);
      lines.push(`copilot cli source: ${String(data?.cliSource ?? "not-needed")}`);
      if (data?.cliCommand) {
        lines.push(`copilot cli command: ${String(data?.cliCommand)}`);
      }
      lines.push(`login launched: ${String(data?.loginLaunched ?? false)}`);
      lines.push(`auth ready: ${String(data?.authReady ?? false)}`);
      lines.push("next step: run `codexs add <provider> --copilot --profile <name>` and then `codexs switch <provider>`.");
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
      const issues = (data?.issues as Array<Record<string, unknown>>) ?? [];
      lines.push(healthy ? "Doctor summary: healthy. No action required." : `Doctor summary: ${issues.length} issue(s) need attention.`);
      lines.push(`target runtime: ${String(data?.codexDir ?? "")}`);
      for (const issue of issues) {
        lines.push(`- ${String(issue.code)}: ${String(issue.message)}`);
        lines.push(`  next step: ${renderDoctorIssueNextStep(issue)}`);
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
 * Summarizes runtime health for the human-readable status output.
 */
function renderStatusHealth(data: Record<string, unknown> | null): string {
  const configExists = Boolean(data?.configExists);
  const providersExists = Boolean(data?.providersExists);
  const auth = (data?.auth as Record<string, unknown> | undefined) ?? {};
  const bridge = (data?.copilotBridge as Record<string, unknown> | null | undefined) ?? null;
  const issues = Array.isArray(data?.issues) ? (data?.issues as Array<Record<string, unknown>>) : [];
  const activeProviderResolvable = data?.activeProviderResolvable !== false;
  const liveState = (data?.liveState as Record<string, unknown> | undefined) ?? {};
  const copilotSdk = (data?.copilotSdk as Record<string, unknown> | undefined) ?? {};
  const copilotAuth = (data?.copilotAuth as Record<string, unknown> | null | undefined) ?? null;
  const runtimeProvider = typeof data?.runtimeProvider === "string" ? data.runtimeProvider : null;
  const activePathUsesCopilot = runtimeProvider === "copilot-sdk-bridge";
  if (!configExists || !providersExists) {
    return "incomplete local state";
  }
  if (!activeProviderResolvable || liveState.reason === "shared-profile") {
    return "active provider ambiguous";
  }
  if (issues.some((issue) => issue.code === "UNMANAGED_ACTIVE_PROFILE")) {
    return "active profile unmanaged";
  }
  if (issues.some((issue) => issue.code === "ACTIVE_PROVIDER_UNRESOLVED")) {
    return "active provider ambiguous";
  }
  if (issues.some((issue) => issue.code === "PROVIDER_BASE_URL_MISMATCH")) {
    return "provider projection drift";
  }
  if (activePathUsesCopilot && copilotSdk.installed === false) {
    return "copilot sdk missing";
  }
  if (activePathUsesCopilot && copilotAuth && copilotAuth.ready === false) {
    return "copilot auth required";
  }
  if (activePathUsesCopilot && bridge && bridge.ok === false) {
    return "copilot runtime needs repair";
  }
  if (auth.exists === false) {
    return "auth projection missing";
  }
  if (auth.valid === false) {
    return "auth projection invalid";
  }
  return "ok";
}

/**
 * Renders the mapped provider line without claiming a unique winner for shared profiles.
 */
function renderStatusMappedProvider(data: Record<string, unknown> | null): string {
  if (typeof data?.provider === "string" && data.provider.length > 0) {
    return data.provider;
  }
  const candidates = Array.isArray(data?.activeProviderCandidates) ? (data?.activeProviderCandidates as string[]) : [];
  if (candidates.length > 1) {
    return `(ambiguous: ${candidates.join(", ")})`;
  }
  return "(unmanaged or unresolved)";
}

/**
 * Renders the active workflow path in status output.
 */
function renderStatusProviderPath(data: Record<string, unknown> | null): string {
  return typeof data?.runtimeProvider === "string" && data.runtimeProvider === "copilot-sdk-bridge" ? "copilot" : "direct";
}

/**
 * Suggests the next operator action for the human-readable status output.
 */
function renderStatusNextStep(data: Record<string, unknown> | null, warnings: string[]): string {
  if (warnings.length > 0) {
    return "run `codexs doctor` to inspect warnings before the next write command";
  }
  if (!data?.provider) {
    return "run `codexs switch <provider>` after adding or adopting a managed provider";
  }
  return "run `codexs doctor` if you need a deeper diagnostic pass";
}

/**
 * Turns structured doctor issue codes into repair-oriented next steps.
 */
function renderDoctorIssueNextStep(issue: Record<string, unknown>): string {
  switch (issue.code) {
    case "CONFIG_NOT_FOUND":
      return "restore or create config.toml before switching providers";
    case "PROVIDERS_NOT_FOUND":
      return "run `codexs init` and then add or migrate providers";
    case "COPILOT_SDK_MISSING":
      return "run `codexs login copilot` to install the optional Copilot runtime";
    case "COPILOT_AUTH_REQUIRED":
      return "run `codexs login copilot` to complete upstream authentication";
    case "BRIDGE_STATE_STALE":
    case "BRIDGE_STATE_MISSING":
    case "BRIDGE_HEALTHCHECK_FAILED":
      return "reselect the provider with `codexs switch <provider>` or inspect bridge state";
    case "UNMANAGED_ACTIVE_PROFILE":
      return "switch to a managed provider or adopt the active profile with `codexs migrate`";
    case "ACTIVE_PROVIDER_UNRESOLVED":
    case "SHARED_PROFILE_REFERENCE":
      return "make provider-to-profile mappings unique before relying on current-provider detection";
    case "PROVIDER_BASE_URL_MISMATCH":
      return "rerun `codexs edit <provider> --base-url <url>` or `codexs switch <provider>` to repair the runtime projection";
    default:
      return "inspect the issue details and rerun `codexs doctor` after fixing the state";
  }
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
