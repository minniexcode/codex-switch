import * as os from "node:os";
import * as path from "node:path";

export type CodexPaths = {
  codexDir: string;
  configPath: string;
  providersPath: string;
  authPath: string;
  backupsDir: string;
  latestBackupPath: string;
};

export function resolveCodexDir(codexDir?: string): string {
  return codexDir ? path.resolve(codexDir) : path.join(os.homedir(), ".codex");
}

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
