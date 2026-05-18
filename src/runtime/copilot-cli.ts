import { spawnSync } from "node:child_process";

type SpawnLike = typeof spawnSync;

let spawnImplementation: SpawnLike = spawnSync;

/**
 * Overrides the spawn implementation for Copilot CLI tests.
 */
export function setCopilotCliSpawnImplementation(spawnLike: SpawnLike): void {
  spawnImplementation = spawnLike;
}

/**
 * Restores the default spawn implementation after tests.
 */
export function resetCopilotCliSpawnImplementation(): void {
  spawnImplementation = spawnSync;
}

/**
 * Checks whether the GitHub Copilot CLI is available on PATH.
 */
export function checkCopilotCliAvailable(): { ok: boolean; cause?: string } {
  const invocation = getCopilotInvocation(["--help"]);
  const result = spawnImplementation(invocation.command, invocation.args, {
    stdio: "pipe",
    encoding: "utf8",
    shell: false,
  });

  if (result.error || result.status !== 0) {
    return {
      ok: false,
      cause: result.error?.message ?? (result.stderr.trim() || "Unknown failure"),
    };
  }

  return { ok: true };
}

/**
 * Launches the official `copilot login` flow in the current terminal.
 */
export function runCopilotLogin(options?: { host?: string }): void {
  const args = ["login"];
  if (options?.host) {
    args.push("--hostname", options.host);
  }
  const invocation = getCopilotInvocation(args);
  const result = spawnImplementation(invocation.command, invocation.args, {
    stdio: "inherit",
    shell: false,
  });

  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? `copilot login exited with status ${String(result.status)}`);
  }
}

/**
 * Resolves a cross-platform invocation for the Copilot CLI.
 */
function getCopilotInvocation(args: string[]): { command: string; args: string[] } {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", ["copilot", ...args].join(" ")],
    };
  }

  return {
    command: "copilot",
    args,
  };
}
