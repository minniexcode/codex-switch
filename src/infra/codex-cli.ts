import { spawnSync } from "node:child_process";
import { cliError } from "../domain/errors";

type SpawnLike = typeof spawnSync;

let spawnImplementation: SpawnLike = spawnSync;

/**
 * Overrides the spawn implementation for tests.
 */
export function setCodexSpawnImplementation(spawnLike: SpawnLike): void {
  spawnImplementation = spawnLike;
}

/**
 * Restores the default Node spawn implementation after tests.
 */
export function resetCodexSpawnImplementation(): void {
  spawnImplementation = spawnSync;
}

/**
 * Runs `codex login --with-api-key` in the target Codex directory.
 */
export function runCodexLogin(apiKey: string, workingDir: string): void {
  const result = spawnImplementation("codex", ["login", "--with-api-key"], {
    cwd: workingDir,
    input: `${apiKey}\n`,
    stdio: "pipe",
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    throw cliError("CODEX_LOGIN_FAILED", "codex login --with-api-key failed.", {
      cause: result.error?.message ?? (result.stderr.trim() || "Unknown codex login failure"),
    });
  }
}

/**
 * Checks whether the Codex CLI is available on PATH.
 */
export function checkCodexAvailable(): { ok: boolean; cause?: string } {
  const result = spawnImplementation("codex", ["--version"], {
    stdio: "pipe",
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    return {
      ok: false,
      cause: result.error?.message ?? (result.stderr.trim() || "Unknown failure"),
    };
  }

  return { ok: true };
}
