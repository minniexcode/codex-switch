import { cliError } from "../domain/errors";
import { resolveCodexDir } from "../infra/codex-paths";
import { ParsedArgs } from "../app/types";

/**
 * Parses argv into command positionals, global flags, and command-scoped options.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    return defaultParsed("help");
  }

  if (argv.includes("--version") || argv.includes("-v")) {
    return defaultParsed("version");
  }

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

  const command = remaining[0] ?? null;
  const positionals: string[] = [];
  const commandOptions = new Map<string, string[]>();

  for (let index = 1; index < remaining.length; index += 1) {
    const value = remaining[index];
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
  };
}

/**
 * Creates a parsed result for built-in synthetic commands such as help/version.
 */
function defaultParsed(command: string): ParsedArgs {
  return {
    command,
    positionals: [],
    globalOptions: {
      json: false,
      codexDir: resolveCodexDir(),
    },
    commandOptions: new Map<string, string[]>(),
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
