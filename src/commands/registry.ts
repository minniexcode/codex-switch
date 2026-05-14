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
    id: "setup",
    tokens: ["setup"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Initialize providers.json from an existing Codex directory.",
    usage: ["codexs setup [--json] [--codex-dir <path>] [--merge|--overwrite]"],
    details: [
      "Reads config.toml profiles, collects complete provider records, then writes providers.json under managed backup flow.",
      "TTY mode can collect missing provider details and choose merge or overwrite when providers.json already exists.",
      "In 0.0.6, setup adopt initialization requires a real TTY because profile selection and provider details are collected interactively.",
      "Non-TTY and --json runs fail fast with a structured error instead of entering partial setup behavior.",
    ],
    examples: ["codexs setup", "codexs setup --overwrite --json --codex-dir ~/.codex"],
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
    summary: "Show a quick status summary for the local Codex directory.",
    usage: ["codexs status [--json] [--codex-dir <path>]"],
    details: [
      "Reports file presence, current profile, and whether the live profile is mapped.",
      "Surfaces config consistency signals without mutating any files.",
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
    summary: "Add a provider with explicit flags or progressive TTY prompts.",
    usage: [
      "codexs add <provider> --profile <name> --api-key <key> [--base-url <url>] [--note <text>] [--tag <tag> ...]",
      "codexs add <provider> --profile <name> --api-key <key> --create-profile --model <name> --base-url <url>",
      "codexs add [--profile <name>] [--api-key <key>] [--base-url <url>] [--note <text>] [--tag <tag> ...]",
    ],
    details: [
      "Prompts only for missing required values when stdin/stdout are TTYs and --json is not set.",
      "Interactive add collects provider name, profile, and apiKey progressively as plain text inputs.",
      "Confirm API key when prompted interactively because the hidden prompt asks twice before writing.",
      "Interactive tags use preset multi-select only.",
      "Automation and non-TTY environments must pass all required values explicitly.",
      "Creating a missing profile section requires --create-profile together with --model and --base-url.",
    ],
    examples: ["codexs add packycode --profile packycode --api-key sk-xxx", "codexs add packycode --profile packycode", "codexs add"],
  },
  {
    id: "switch",
    tokens: ["switch"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Switch to a provider and optionally refresh Codex login.",
    usage: ["codexs switch <provider> [--no-login] [--json] [--codex-dir <path>]"],
    details: [
      "When <provider> is omitted in a TTY, an interactive provider selector is shown.",
      "When <provider> is passed explicitly, switch proceeds directly without extra confirmation.",
      "--no-login remains explicit and is never prompted interactively.",
      "Backs up config.toml and auth.json, then rolls back on failure.",
    ],
    examples: ["codexs switch freemodel", "codexs switch --no-login", "codexs switch freemodel --no-login --json"],
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
    summary: "Run configuration and environment diagnostics.",
    usage: ["codexs doctor [--json] [--codex-dir <path>]"],
    details: ["Checks the expected config files, provider/profile consistency, and Codex CLI availability.", "Returns structured issues so users and AI agents can act on them."],
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
