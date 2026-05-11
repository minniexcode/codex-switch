import { spawnSync } from "node:child_process";
import { cliError } from "../domain/errors";

type SpawnLike = typeof spawnSync;

let spawnImplementation: SpawnLike = spawnSync;

export function setCodexSpawnImplementation(spawnLike: SpawnLike): void {
  spawnImplementation = spawnLike;
}

export function resetCodexSpawnImplementation(): void {
  spawnImplementation = spawnSync;
}

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
