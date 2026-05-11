export type GlobalOptions = {
  json: boolean;
  codexDir: string;
};

export type ParsedArgs = {
  command: string | null;
  positionals: string[];
  globalOptions: GlobalOptions;
  commandOptions: Map<string, string[]>;
};

export type CommandContext = {
  command: string;
  options: GlobalOptions;
};

export type CommandResult = {
  data: Record<string, unknown> | null;
  warnings?: string[];
};
