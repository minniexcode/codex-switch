import * as fs from "node:fs";
import { resolveCodexDir } from "./codex-paths";

/**
 * Finds candidate Codex home directories. v0.0.4 only supports explicit and default locations.
 */
export function findCodexDirCandidates(explicitCodexDir?: string | null): string[] {
  if (explicitCodexDir) {
    return [resolveCodexDir(explicitCodexDir)];
  }

  const defaultDir = resolveCodexDir();
  return fs.existsSync(defaultDir) ? [defaultDir] : [];
}
