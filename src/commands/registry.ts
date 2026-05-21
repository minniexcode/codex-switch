import { handleRegisteredCommand } from "./handlers";
import { CommandDefinition, CommandId } from "./types";

/**
 * Canonical command registry used by parsing, help rendering, and dispatch.
 */
export const COMMANDS: CommandDefinition[] = [
  {
    id: "config-show",
    tokens: ["config", "show"],
    handler: handleRegisteredCommand,
    group: "read",
    summary: "Show the structured config profile view.",
    usage: ["codexs config show [profile] [--json] [--codex-dir <path>]"],
    details: [
      "Returns all recognizable config profiles by default, including unmanaged and orphaned references.",
      "Passing [profile] narrows the response to one profile while preserving the same shape.",
    ],
    examples: ["codexs config show", "codexs config show packycode --json"],
  },
  {
    id: "config-list-profiles",
    tokens: ["config", "list-profiles"],
    handler: handleRegisteredCommand,
    group: "read",
    summary: "List recognizable config profiles with managed-state hints.",
    usage: ["codexs config list-profiles [--json] [--codex-dir <path>]"],
    details: [
      "Lists managed, unmanaged, and orphaned config profiles in one stable view.",
      "Use config show for richer single-profile details.",
    ],
    examples: ["codexs config list-profiles", "codexs config list-profiles --json"],
  },
  {
    id: "bridge-start",
    tokens: ["bridge", "start"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Start or reuse the managed Copilot bridge.",
    usage: ["codexs bridge start [provider] [--json] [--codex-dir <path>]"],
    details: [
      "Resolves a Copilot bridge provider by explicit name, active provider, sole provider, or TTY selection.",
      "Reuses a healthy bridge for the same provider and replaces a different managed provider when needed.",
      "If the preferred port is occupied, automatically selects another free 5-digit port and persists it.",
    ],
    examples: ["codexs bridge start", "codexs bridge start copilot-main"],
  },
  {
    id: "bridge-stop",
    tokens: ["bridge", "stop"],
    handler: handleRegisteredCommand,
    group: "recovery",
    summary: "Stop the managed Copilot bridge.",
    usage: ["codexs bridge stop [provider] [--json] [--codex-dir <path>]"],
    details: [
      "Prefers the runtime-state instance when present and uses an explicit provider as a guard.",
      "Clears the runtime-state manifest without mutating providers.json or Codex auth state.",
      "Is idempotent when no managed bridge is currently running.",
    ],
    examples: ["codexs bridge stop", "codexs bridge stop copilot-main"],
  },
  {
    id: "bridge-status",
    tokens: ["bridge", "status"],
    handler: handleRegisteredCommand,
    group: "read",
    summary: "Inspect the managed Copilot bridge.",
    usage: ["codexs bridge status [provider] [--json] [--codex-dir <path>]"],
    details: [
      "Reports runtime-state, provider binding, and whether the live worker matches the expected provider.",
      "Prefers the runtime-state instance when one is present.",
      "Uses an explicit provider as a guard instead of silently switching targets.",
    ],
    examples: ["codexs bridge status", "codexs bridge status copilot-main"],
  },
  {
    id: "init",
    tokens: ["init"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Initialize the codex-switch tool home for the primary workflow.",
    usage: ["codexs init [--json] [--codex-dir <path>]"],
    details: [
      "Creates codex-switch.json and providers.json under the tool home when they do not exist yet.",
      "Does not create or validate config.toml, auth.json, or the target Codex directory.",
      "When --codex-dir is passed explicitly and codex-switch.json does not exist yet, init persists it as defaultCodexDir.",
      "Otherwise init stays scoped to tool-home state and does not persist fallback Codex directory resolution.",
      "Use init first for fresh direct-provider or Copilot setups.",
    ],
    examples: ["codexs init", "codexs init --json --codex-dir ~/.codex"],
  },
  {
    id: "login",
    tokens: ["login"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Complete upstream onboarding for interactive providers such as GitHub Copilot.",
    usage: ["codexs login <upstream>"],
    details: [
      "Currently supports copilot and github-copilot as the same upstream.",
      "Installs the local Copilot SDK under the tool home when needed, then checks login readiness.",
      "When login is not ready, launches the bundled Copilot CLI from the runtime when available, otherwise falls back to PATH, then rechecks before succeeding.",
      "Copilot login is shared across the local Copilot runtime, so logging into a different GitHub account replaces the upstream auth used by all Copilot providers.",
      "Requires an interactive TTY and does not support --json.",
    ],
    examples: ["codexs login copilot", "codexs login github-copilot"],
  },
  {
    id: "migrate",
    tokens: ["migrate"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Adopt existing Codex runtime profiles into managed providers.json state.",
    usage: ["codexs migrate [--json] [--codex-dir <path>] [--merge|--overwrite]"],
    details: [
      "Reads config.toml profiles, collects complete provider records, then writes providers.json under managed backup flow.",
      "TTY mode can collect missing provider details and choose merge or overwrite when providers.json already exists.",
      "Migrate adopts only runtime profiles that already expose model, model_provider, and matching base_url.",
      "Non-TTY and --json runs still fail fast because migrate profile selection and provider details remain interactive in this release.",
      "Treat migrate as an advanced adopt helper for existing runtime state, not the default first step for fresh installs.",
    ],
    examples: ["codexs migrate", "codexs migrate --overwrite --json --codex-dir ~/.codex"],
  },
  {
    id: "setup",
    tokens: ["setup"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Deprecated. Kept only to point callers to init or migrate.",
    usage: ["codexs setup"],
    details: [
      "setup no longer performs initialization or migration work.",
      "Use init for the primary fresh-install workflow.",
      "Use migrate only when adopting from existing config.toml profiles.",
    ],
    examples: ["codexs help init", "codexs help migrate"],
  },
  {
    id: "list",
    tokens: ["list"],
    handler: handleRegisteredCommand,
    group: "read",
    summary: "List configured providers from providers.json.",
    usage: ["codexs list [--json] [--codex-dir <path>]"],
    details: ["Reads providers.json and prints provider-to-profile mappings.", "Use --json for machine-readable automation output."],
    examples: ["codexs list", "codexs list --json"],
  },
  {
    id: "show",
    tokens: ["show"],
    handler: handleRegisteredCommand,
    group: "read",
    summary: "Show one provider record from providers.json.",
    usage: ["codexs show <provider> [--json] [--codex-dir <path>]"],
    details: [
      "Human-readable output masks apiKey by default.",
      "TTY mode can select a missing provider interactively before showing its record.",
      "JSON mode returns the full provider payload for local automation.",
    ],
    examples: ["codexs show packycode", "codexs show packycode --json"],
  },
  {
    id: "current",
    tokens: ["current"],
    handler: handleRegisteredCommand,
    group: "read",
    summary: "Show the active top-level profile from config.toml.",
    usage: ["codexs current [--json] [--codex-dir <path>]"],
    details: ["Reads the currently active top-level profile.", "Fails when config.toml is missing or has no top-level profile."],
    examples: ["codexs current", "codexs current --json"],
  },
  {
    id: "status",
    tokens: ["status"],
    handler: handleRegisteredCommand,
    group: "read",
    summary: "Show tool-home, target-runtime, provider, and runtime-health status.",
    usage: ["codexs status [--json] [--codex-dir <path>]"],
    details: [
      "Reports the target Codex runtime, tool-home storage roles, current profile, and whether the live profile is mapped.",
      "When the active provider uses a local runtime bridge, status also reports bridge, Copilot SDK, and upstream auth state.",
      "Surfaces dual-path config consistency signals without mutating any files.",
      "Use doctor for deeper diagnostics.",
    ],
    examples: ["codexs status", "codexs status --json --codex-dir ./.tmp-codex"],
  },
  {
    id: "edit",
    tokens: ["edit"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Update fields on a single provider record.",
    usage: [
      "codexs edit <provider> [--profile <name>] [--api-key <key>] [--base-url <url>] [--note <text>] [--tag <tag> ...] [--json] [--codex-dir <path>]",
      "codexs edit <provider> --profile <name> --create-profile --model <name> --base-url <url>",
    ],
    details: [
      "Passed flags replace only the selected fields and keep the rest unchanged.",
      "TTY mode can first select a provider, then prompt for fields when no editable options were provided.",
      "Interactive tags use preset multi-select only.",
      "When rebinding to a missing profile, --create-profile requires both --model and --base-url.",
      "Backs up providers.json and config.toml before writing.",
    ],
    examples: ["codexs edit packycode --note primary", "codexs edit packycode --tag daily --tag paid --json"],
  },
  {
    id: "add",
    tokens: ["add"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Add a managed provider for the primary direct or Copilot workflows.",
    usage: [
      "codexs add <provider> --profile <name> --api-key <key> [--base-url <url>] [--note <text>] [--tag <tag> ...]",
      "codexs add <provider> --copilot --profile <name> [--bridge-host <host>] [--bridge-port <port>] [--bridge-api-key <secret>] [--install-copilot-sdk]",
      "codexs add <provider> --profile <name> --api-key <key> --create-profile --model <name> --base-url <url>",
      "codexs add [--profile <name>] [--api-key <key>] [--base-url <url>] [--note <text>] [--tag <tag> ...]",
    ],
    details: [
      "Prompts only for missing required values when stdin/stdout are TTYs and --json is not set.",
      "Interactive add collects provider name, profile, and apiKey progressively as plain text inputs.",
      "Confirm API key when prompted interactively because the hidden prompt asks twice before writing.",
      "Interactive tags use preset multi-select only.",
      "Automation and non-TTY environments must pass all required values explicitly.",
      "Creating a missing direct-provider profile section requires --create-profile together with --model and --base-url.",
      "Creating a missing Copilot profile section requires --create-profile together with --model; the local bridge base_url is derived automatically.",
      "Use --copilot to create a GitHub Copilot bridge provider backed by the official SDK.",
      "Copilot providers require SDK install and login readiness to already be satisfied via codexs login copilot.",
      "For Copilot providers, provider apiKey stores only the local bridge secret; upstream GitHub Copilot auth stays shared in the official runtime login.",
      "--install-copilot-sdk is kept only as a rejected compatibility flag that points to codexs login copilot.",
    ],
    examples: [
      "codexs add packycode --profile packycode --api-key sk-xxx",
      "codexs add copilot-main --copilot --profile copilot-main",
      "codexs add",
    ],
  },
  {
    id: "switch",
    tokens: ["switch"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Switch the active runtime to a managed provider.",
    usage: ["codexs switch <provider> [--json] [--codex-dir <path>]"],
    details: [
      "When <provider> is omitted in a TTY, an interactive provider selector is shown.",
      "When <provider> is passed explicitly, switch proceeds directly without extra confirmation.",
      "Direct providers update the active config profile and rewrite auth.json with auth_mode=apikey plus OPENAI_API_KEY.",
      "Copilot bridge providers also rewrite OPENAI_API_KEY to the local bridge secret while managing runtime routing and bridge state.",
      "Copilot bridge providers probe the optional official SDK before switching and fail fast if it is missing.",
      "Switch succeeds only after the managed profile projection is written to the target runtime.",
      "Backs up config.toml and auth.json and rolls back on failure.",
    ],
    examples: ["codexs switch freemodel", "codexs switch packycode --json"],
  },
  {
    id: "remove",
    tokens: ["remove"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Remove a provider from providers.json.",
    usage: ["codexs remove <provider> [--force] [--switch-to <profile>] [--json] [--codex-dir <path>]"],
    details: [
      "TTY mode can select a missing provider interactively and always asks for deletion confirmation.",
      "Non-TTY and --json automation still require both <provider> and --force.",
      "The confirmation prompt includes the provider name and cancels without writing when declined.",
      "When removing the last provider linked to the active profile, pass --switch-to first.",
      "Backs up providers.json and config.toml before removing the record.",
    ],
    examples: ["codexs remove freemodel", "codexs remove freemodel --force --json"],
  },
  {
    id: "import",
    tokens: ["import"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Replace providers.json with an external JSON file.",
    usage: ["codexs import <file> [--json] [--codex-dir <path>]"],
    details: [
      "The file path is always explicit; there is no path wizard in this release.",
      "TTY mode asks for confirmation before replacing or merging into the current providers registry.",
      "Non-TTY and --json runs stay non-interactive and validate the file before writing.",
    ],
    examples: ["codexs import ./providers.json", "codexs import ./providers.json --merge --json"],
  },
  {
    id: "export",
    tokens: ["export"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Export the current providers.json to another file.",
    usage: ["codexs export <file> [--force] [--json] [--codex-dir <path>]"],
    details: [
      "The file path is always explicit; there is no path wizard in this release.",
      "TTY mode asks before overwriting an existing target when --force is not supplied.",
      "Non-TTY and --json automation require --force to overwrite an existing file.",
    ],
    examples: ["codexs export ./providers-backup.json", "codexs export ./providers-backup.json --force"],
  },
  {
    id: "backups-list",
    tokens: ["backups", "list"],
    handler: handleRegisteredCommand,
    group: "recovery",
    summary: "List historical backup entries.",
    usage: ["codexs backups list [--json] [--codex-dir <path>]"],
    details: [
      "Enumerates backups/ manifests and returns them newest first.",
      "Corrupt backup manifests are skipped with warnings instead of failing the whole command.",
    ],
    examples: ["codexs backups list", "codexs backups list --json"],
  },
  {
    id: "doctor",
    tokens: ["doctor"],
    handler: handleRegisteredCommand,
    group: "recovery",
    summary: "Run repair-oriented diagnostics across tool-home and target-runtime state.",
    usage: ["codexs doctor [--json] [--codex-dir <path>]"],
    details: [
      "Checks the expected config files, provider/profile consistency, and Codex CLI availability.",
      "Copilot bridge providers add runtime dependency, auth, and bridge health diagnostics.",
      "Returns structured issues so users and AI agents can act on them.",
    ],
    examples: ["codexs doctor", "codexs doctor --json"],
  },
  {
    id: "rollback",
    tokens: ["rollback"],
    handler: handleRegisteredCommand,
    group: "recovery",
    summary: "Restore the latest managed backup or a specific backup id.",
    usage: ["codexs rollback [<backup-id>] [--json] [--codex-dir <path>]"],
    details: [
      "TTY mode previews the target backup path and affected files, then asks for confirmation.",
      "Non-TTY and --json runs stay non-interactive and execute immediately.",
      "Use after a failed or undesired managed mutation.",
    ],
    examples: ["codexs rollback", "codexs rollback 20260511-221457-switch --json"],
  },
];

const COMMAND_NAME_SET = new Set(COMMANDS.flatMap((command) => [command.id, command.tokens.join(" ")]));
const HELP_TOPIC_SET = new Set([
  ...COMMANDS.map((command) => command.tokens.join(" ")),
  ...new Set(COMMANDS.filter((command) => command.tokens.length > 1).map((command) => command.tokens[0])),
]);

/**
 * Returns a defensive copy of the public command registry.
 */
export function getCommandDefinitions(): CommandDefinition[] {
  return COMMANDS.slice();
}

/**
 * Returns stable internal command ids in registry order.
 */
export function getKnownCommandIds(): CommandId[] {
  return COMMANDS.map((command) => command.id);
}

/**
 * Resolves one command definition by its canonical internal id.
 */
export function findCommandDefinition(commandId: CommandId | "help" | "version"): CommandDefinition | null {
  if (commandId === "help" || commandId === "version") {
    return null;
  }
  return COMMANDS.find((command) => command.id === commandId) ?? null;
}

/**
 * Resolves a command definition from its tokenized CLI spelling.
 */
export function findCommandDefinitionByTokens(tokens: string[]): CommandDefinition | null {
  return COMMANDS.find((command) => command.tokens.join(" ") === tokens.join(" ")) ?? null;
}

/**
 * Matches argv against the longest registered token sequence first.
 */
export function resolveCommandFromArgv(argv: string[]): {
  definition: CommandDefinition | null;
  consumedTokens: number;
} {
  // Nested commands such as "config show" must win over their shorter root tokens.
  for (const command of COMMANDS
    .slice()
    .sort((left, right) => right.tokens.length - left.tokens.length)) {
    const candidate = argv.slice(0, command.tokens.length);
    if (candidate.length === command.tokens.length && candidate.join(" ") === command.tokens.join(" ")) {
      return {
        definition: command,
        consumedTokens: command.tokens.length,
      };
    }
  }

  return {
    definition: null,
    consumedTokens: 0,
  };
}

/**
 * Reports whether a name is reserved by either a command id or its public token form.
 */
export function isKnownCommandName(commandName: string): boolean {
  return COMMAND_NAME_SET.has(commandName);
}

/**
 * Reports whether a help topic is recognized by the help renderer.
 */
export function isKnownHelpTopic(topic: string): boolean {
  return HELP_TOPIC_SET.has(topic);
}

/**
 * Returns public command names exactly as they appear in help and examples.
 */
export function getPublicCommandNames(): string[] {
  return COMMANDS.map((command) => command.tokens.join(" "));
}

/**
 * Returns nested command spellings for one root token such as "config" or "backups".
 */
export function getNestedCommandTokens(rootToken: string): string[] {
  return COMMANDS
    .filter((command) => command.tokens.length > 1 && command.tokens[0] === rootToken)
    .map((command) => command.tokens.join(" "));
}
