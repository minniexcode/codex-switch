import { cliError } from "../domain/errors";
import { resolveCodexDir } from "../infra/codex-paths";
import { ParsedArgs } from "../app/types";

/**
 * Parses argv into command positionals, global flags, and command-scoped options.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  let json = false;
  let codexDir = resolveCodexDir();
  const remaining: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") {
      json = true;
      continue;
    }

    if (value === "--codex-dir") {
      const next = argv[index + 1];
      if (!next) {
        throw cliError("INVALID_IMPORT_FILE", "--codex-dir requires a path value.");
      }
      codexDir = resolveCodexDir(next);
      index += 1;
      continue;
    }

    remaining.push(value);
  }

  if (remaining[0] === "help") {
    return {
      command: null,
      positionals: [],
      globalOptions: {
        json,
        codexDir,
      },
      commandOptions: new Map<string, string[]>(),
      helpRequested: true,
      helpTarget: remaining[1] ?? null,
      versionRequested: false,
    };
  }

  const versionRequested = remaining.includes("--version") || remaining.includes("-v");
  if (versionRequested) {
    return defaultParsed(null, {
      json,
      codexDir,
      versionRequested: true,
    });
  }

  const command = remaining[0] ?? null;
  const positionals: string[] = [];
  const commandOptions = new Map<string, string[]>();
  let helpRequested = false;

  for (let index = 1; index < remaining.length; index += 1) {
    const value = remaining[index];
    if (value === "--help" || value === "-h") {
      helpRequested = true;
      continue;
    }

    if (value.startsWith("--")) {
      const optionName = value;
      const next = remaining[index + 1];
      if (!next || next.startsWith("--")) {
        // Boolean flags are stored as "true" so later access uses one uniform map shape.
        commandOptions.set(optionName, ["true"]);
        continue;
      }

      const existing = commandOptions.get(optionName) ?? [];
      existing.push(next);
      commandOptions.set(optionName, existing);
      index += 1;
      continue;
    }

    positionals.push(value);
  }

  return {
    command,
    positionals,
    globalOptions: {
      json,
      codexDir,
    },
    commandOptions,
    helpRequested,
    helpTarget: helpRequested ? command : null,
    versionRequested: false,
  };
}

/**
 * Creates a parsed result for built-in synthetic commands such as help/version.
 */
function defaultParsed(
  command: string | null,
  overrides?: {
    json?: boolean;
    codexDir?: string;
    helpRequested?: boolean;
    helpTarget?: string | null;
    versionRequested?: boolean;
  }
): ParsedArgs {
  return {
    command,
    positionals: [],
    globalOptions: {
      json: overrides?.json ?? false,
      codexDir: overrides?.codexDir ?? resolveCodexDir(),
    },
    commandOptions: new Map<string, string[]>(),
    helpRequested: overrides?.helpRequested ?? false,
    helpTarget: overrides?.helpTarget ?? null,
    versionRequested: overrides?.versionRequested ?? false,
  };
}

/**
 * Checks whether a boolean-style option was supplied.
 */
export function hasFlag(options: Map<string, string[]>, name: string): boolean {
  return options.has(name);
}

/**
 * Returns the last supplied value for a single-valued command option.
 */
export function getSingleOption(
  options: Map<string, string[]>,
  name: string,
  required = true
): string | null {
  const values = options.get(name) ?? [];
  if (values.length === 0) {
    return required ? null : null;
  }

  return values[values.length - 1];
}
