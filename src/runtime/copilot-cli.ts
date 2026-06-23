import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { getCopilotRuntimeInstallDir } from "./copilot-installer";

type SpawnLike = typeof spawnSync;
export type CopilotCliInvocation = {
  command: string;
  args: string[];
  source: "bundled" | "path";
  shell: boolean;
};

export type CopilotSdkRuntimeInvocation = {
  path: string;
  args: string[];
};

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
 * Checks whether the GitHub Copilot CLI is available either from the bundled runtime or on PATH.
 */
export function checkCopilotCliAvailable(runtimesDir?: string): {
  ok: boolean;
  cause?: string;
  source?: "bundled" | "path";
  command?: string;
} {
  const invocation = getCopilotInvocation(["--help"], runtimesDir);
  const result = spawnImplementation(invocation.command, invocation.args, {
    stdio: "pipe",
    encoding: "utf8",
    shell: invocation.shell,
  });

  if (result.error || result.status !== 0) {
    return {
      ok: false,
      cause: result.error?.message ?? (result.stderr.trim() || "Unknown failure"),
      source: invocation.source,
      command: formatInvocation(invocation),
    };
  }

  return {
    ok: true,
    source: invocation.source,
    command: formatInvocation(invocation),
  };
}

/**
 * Resolves the Copilot CLI invocation used by SDK clients and command probes.
 */
export function resolveCopilotCliInvocation(args: string[] = [], runtimesDir?: string): CopilotCliInvocation {
  return getCopilotInvocation(args, runtimesDir);
}

/**
 * Resolves the explicit runtime entrypoint required by the Copilot SDK.
 */
export function resolveCopilotSdkRuntimeInvocation(runtimesDir?: string): CopilotSdkRuntimeInvocation | null {
  const installDir = getCopilotRuntimeInstallDir(runtimesDir);
  const loaderPath = path.join(installDir, "node_modules", "@github", "copilot", "npm-loader.js");
  if (!fs.existsSync(loaderPath)) {
    return null;
  }
  return {
    path: loaderPath,
    args: [],
  };
}

/**
 * Launches the official `copilot login` flow in the current terminal.
 */
export function runCopilotLogin(options?: { host?: string; runtimesDir?: string }): void {
  const args = ["login"];
  if (options?.host) {
    args.push("--hostname", options.host);
  }
  const invocation = getCopilotInvocation(args, options?.runtimesDir);
  const result = spawnImplementation(invocation.command, invocation.args, {
    stdio: "inherit",
    shell: invocation.shell,
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      result.error?.message ??
        `${formatInvocation(invocation)} exited with status ${String(result.status)}`
    );
  }
}

/**
 * Resolves a cross-platform invocation for the Copilot CLI.
 */
function getCopilotInvocation(
  args: string[],
  runtimesDir?: string
): CopilotCliInvocation {
  const bundledCommand = resolveBundledCopilotCommand(runtimesDir);
  const executable = bundledCommand ?? "copilot";
  if (process.platform === "win32") {
    return {
      command: executable,
      args,
      source: bundledCommand ? "bundled" : "path",
      shell: true,
    };
  }

  return {
    command: executable,
    args,
    source: bundledCommand ? "bundled" : "path",
    shell: false,
  };
}

/**
 * Resolves the bundled Copilot CLI shim installed alongside the optional runtime.
 */
function resolveBundledCopilotCommand(runtimesDir?: string): string | null {
  const installDir = getCopilotRuntimeInstallDir(runtimesDir);
  const candidates =
    process.platform === "win32"
      ? [path.join(installDir, "node_modules", ".bin", "copilot.cmd")]
      : [path.join(installDir, "node_modules", ".bin", "copilot")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Renders the invocation into a short human-readable string for diagnostics.
 */
function formatInvocation(invocation: {
  command: string;
  args: string[];
  source: "bundled" | "path";
  shell: boolean;
}): string {
  return invocation.command === "copilot"
    ? ["copilot", ...invocation.args].join(" ")
    : [invocation.command, ...invocation.args].join(" ");
}
