/**
 * Global flags that apply to every CLI command.
 */
export type GlobalOptions = {
  json: boolean;
  codexDir: string;
};

/**
 * Parsed CLI input split into command, positional arguments, and options.
 */
export type ParsedArgs = {
  command: string | null;
  positionals: string[];
  globalOptions: GlobalOptions;
  commandOptions: Map<string, string[]>;
  helpRequested: boolean;
  helpTarget: string | null;
  versionRequested: boolean;
};

/**
 * Execution context shared between parsing and rendering.
 */
export type CommandContext = {
  command: string;
  options: GlobalOptions;
};

/**
 * Standard command payload returned by application services.
 */
export type CommandResult = {
  data: Record<string, unknown> | null;
  warnings?: string[];
};
