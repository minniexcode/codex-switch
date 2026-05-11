type CommandGroup = "read" | "write" | "recovery";

type CommandHelpDefinition = {
  name: string;
  group: CommandGroup;
  usage: string[];
  summary: string;
  details: string[];
  examples: string[];
};

const GROUP_TITLES: Record<CommandGroup, string> = {
  read: "Read Commands",
  write: "Change Commands",
  recovery: "Diagnostics And Recovery",
};

const COMMANDS: CommandHelpDefinition[] = [
  {
    name: "list",
    group: "read",
    summary: "List configured providers from providers.json.",
    usage: ["codexs list [--json] [--codex-dir <path>]"],
    details: [
      "Reads providers.json and prints provider-to-profile mappings.",
      "Use --json for machine-readable automation output.",
    ],
    examples: ["codexs list", "codexs list --json"],
  },
  {
    name: "current",
    group: "read",
    summary: "Show the active top-level profile from config.toml.",
    usage: ["codexs current [--json] [--codex-dir <path>]"],
    details: [
      "Reads the currently active top-level profile.",
      "Fails when config.toml is missing or has no top-level profile.",
    ],
    examples: ["codexs current", "codexs current --json"],
  },
  {
    name: "status",
    group: "read",
    summary: "Show a quick status summary for the local Codex directory.",
    usage: ["codexs status [--json] [--codex-dir <path>]"],
    details: [
      "Reports file presence, current profile, and whether the live profile is mapped.",
      "Use doctor for deeper diagnostics.",
    ],
    examples: ["codexs status", "codexs status --json --codex-dir ./.tmp-codex"],
  },
  {
    name: "add",
    group: "write",
    summary: "Add a provider with explicit flags or progressive TTY prompts.",
    usage: [
      "codexs add <provider> --profile <name> --api-key <key> [--base-url <url>] [--note <text>] [--tag <tag> ...]",
      "codexs add [--profile <name>] [--api-key <key>] [--base-url <url>] [--note <text>] [--tag <tag> ...]",
    ],
    details: [
      "Prompts only for missing required values when stdin/stdout are TTYs and --json is not set.",
      "Profile selection prefers existing config.toml profiles, then falls back to free-text input.",
      "Confirm API key when prompted interactively because the hidden prompt asks twice before writing.",
      "Automation and non-TTY environments must pass all required values explicitly.",
    ],
    examples: [
      "codexs add packycode --profile packycode --api-key sk-xxx",
      "codexs add packycode --profile packycode",
      "codexs add",
    ],
  },
  {
    name: "switch",
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
    name: "remove",
    group: "write",
    summary: "Remove a provider from providers.json.",
    usage: ["codexs remove <provider> [--force] [--json] [--codex-dir <path>]"],
    details: [
      "TTY mode can select a missing provider interactively and always asks for deletion confirmation.",
      "Non-TTY and --json automation still require both <provider> and --force.",
      "The confirmation prompt includes the provider name and cancels without writing when declined.",
      "Backs up providers.json before removing the record.",
    ],
    examples: ["codexs remove freemodel", "codexs remove freemodel --force --json"],
  },
  {
    name: "import",
    group: "write",
    summary: "Replace providers.json with an external JSON file.",
    usage: ["codexs import <file> [--json] [--codex-dir <path>]"],
    details: [
      "The file path is always explicit; there is no path wizard in this release.",
      "TTY mode asks for confirmation before replacing the current providers registry.",
      "Non-TTY and --json runs stay non-interactive and validate the file before writing.",
    ],
    examples: ["codexs import ./providers.json", "codexs import ./providers.json --json"],
  },
  {
    name: "export",
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
    name: "doctor",
    group: "recovery",
    summary: "Run configuration and environment diagnostics.",
    usage: ["codexs doctor [--json] [--codex-dir <path>]"],
    details: [
      "Checks the expected config files, provider/profile consistency, and Codex CLI availability.",
      "Returns structured issues so users and AI agents can act on them.",
    ],
    examples: ["codexs doctor", "codexs doctor --json"],
  },
  {
    name: "rollback",
    group: "recovery",
    summary: "Restore the latest managed backup.",
    usage: ["codexs rollback [--json] [--codex-dir <path>]"],
    details: [
      "TTY mode previews the latest backup path and affected files, then asks for confirmation.",
      "Non-TTY and --json runs stay non-interactive and execute immediately.",
      "Use after a failed or undesired managed mutation.",
    ],
    examples: ["codexs rollback", "codexs rollback --json"],
  },
];

const COMMAND_NAME_SET = new Set(COMMANDS.map((command) => command.name));

export function getKnownCommandNames(): string[] {
  return COMMANDS.map((command) => command.name);
}

export function isKnownCommandName(commandName: string): boolean {
  return COMMAND_NAME_SET.has(commandName);
}

export function buildHelpText(commandName?: string | null): string {
  if (!commandName) {
    return [
      "codex-switch",
      "",
      "Manage and switch local Codex provider/profile configuration safely.",
      "",
      "Usage:",
      "  codexs <command> [options]",
      "  codexs help <command>",
      "",
      ...renderGroupedCommands(),
      "",
      "Global options:",
      "  --json             Output the standard JSON envelope and disable all prompts.",
      "  --codex-dir <path> Target a specific Codex directory instead of ~/.codex.",
      "  --help             Show top-level or command-specific help.",
      "  --version          Print the current CLI version.",
      "",
      "Interactive rules:",
      "  Progressive prompts only run in a real TTY and never run under --json.",
      "  Human write commands may guide missing inputs or ask for dangerous-action confirmation.",
      "  Automation should pass explicit arguments and prefer --json for stable parsing.",
      "",
      "Dangerous commands:",
      "  remove deletes provider records.",
      "  import replaces providers.json.",
      "  export may overwrite a target file.",
      "  rollback restores files from the latest backup.",
      "",
      "Examples:",
      "  codexs list",
      "  codexs switch",
      "  codexs add packycode --profile packycode --api-key sk-xxx",
      "  codexs remove freemodel",
      "  codexs rollback",
      "  codexs help add",
    ].join("\n");
  }

  const command = COMMANDS.find((candidate) => candidate.name === commandName);
  if (!command) {
    return [
      `Unknown help topic: ${commandName}`,
      "",
      "Available commands:",
      ...getKnownCommandNames().map((name) => `  ${name}`),
    ].join("\n");
  }

  return [
    `codexs ${command.name}`,
    "",
    command.summary,
    "",
    "Usage:",
    ...command.usage.map((usage) => `  ${usage}`),
    "",
    "Details:",
    ...command.details.map((detail) => `  ${detail}`),
    "",
    "Examples:",
    ...command.examples.map((example) => `  ${example}`),
  ].join("\n");
}

function renderGroupedCommands(): string[] {
  const lines: string[] = [];
  for (const group of ["read", "write", "recovery"] as const) {
    lines.push(`${GROUP_TITLES[group]}:`);
    for (const command of COMMANDS.filter((candidate) => candidate.group === group)) {
      lines.push(`  ${command.name.padEnd(8, " ")} ${command.summary}`);
    }
    lines.push("");
  }

  lines.pop();
  return lines;
}
