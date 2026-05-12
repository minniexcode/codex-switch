import * as os from "node:os";
import * as path from "node:path";

export const CODEX_DIR_ENV_NAME = "CODEXS_CODEX_DIR";
const DEVELOPMENT_DEFAULT_CODEX_DIR = path.resolve(process.cwd(), "test-fixtures", "sample-codex");

/**
 * Absolute paths used by codex-switch inside the Codex home directory.
 */
export type CodexPaths = {
  codexDir: string;
  configPath: string;
  providersPath: string;
  authPath: string;
  backupsDir: string;
  latestBackupPath: string;
};

/**
 * Resolves the working Codex directory, defaulting to `~/.codex`.
 */
export function resolveCodexDir(codexDir?: string): string {
  if (codexDir) {
    return path.resolve(codexDir);
  }

  const envCodexDir = process.env[CODEX_DIR_ENV_NAME];
  if (envCodexDir) {
    return path.resolve(envCodexDir);
  }

  if (process.env.NODE_ENV === "development") {
    return DEVELOPMENT_DEFAULT_CODEX_DIR;
  }

  return path.join(os.homedir(), ".codex");
}

/**
 * Expands a Codex home directory into the file paths used by the CLI.
 */
export function createCodexPaths(codexDir: string): CodexPaths {
  return {
    codexDir,
    configPath: path.join(codexDir, "config.toml"),
    providersPath: path.join(codexDir, "providers.json"),
    authPath: path.join(codexDir, "auth.json"),
    backupsDir: path.join(codexDir, "backups"),
    latestBackupPath: path.join(codexDir, "backups", "latest.json"),
  };
}
