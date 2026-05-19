import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { cliError } from "../domain/errors";
import { resolveCodexSwitchHome } from "../storage/codex-paths";
import { OptionalRuntimeInstallStatus } from "./types";

const COPILOT_SDK_PACKAGE = "@github/copilot-sdk";
const COPILOT_SDK_VERSION = "latest";

type SpawnLike = typeof spawnSync;

let spawnImplementation: SpawnLike = spawnSync;

/**
 * Overrides the spawn implementation for runtime installer tests.
 */
export function setCopilotInstallerSpawnImplementation(spawnLike: SpawnLike): void {
  spawnImplementation = spawnLike;
}

/**
 * Restores the default spawn implementation after tests.
 */
export function resetCopilotInstallerSpawnImplementation(): void {
  spawnImplementation = spawnSync;
}

/**
 * Returns the tool-home runtime directory used to lazily install the Copilot SDK.
 */
export function getCopilotRuntimeInstallDir(runtimesDir?: string): string {
  const override = process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
  if (override && override.trim() !== "") {
    return path.resolve(override);
  }
  const baseRuntimesDir = runtimesDir ? path.resolve(runtimesDir) : path.join(resolveCodexSwitchHome(), "runtimes");
  return path.join(baseRuntimesDir, "copilot");
}

/**
 * Returns the package name used by the Copilot runtime installer.
 */
export function getCopilotSdkPackageName(): string {
  return COPILOT_SDK_PACKAGE;
}

/**
 * Reports whether the optional Copilot SDK runtime is currently installed.
 */
export function probeCopilotSdkInstall(runtimesDir?: string): OptionalRuntimeInstallStatus {
  const installDir = getCopilotRuntimeInstallDir(runtimesDir);
  const packageJsonPath = path.join(installDir, "node_modules", "@github", "copilot-sdk", "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return {
      installed: false,
      installDir,
      packageName: COPILOT_SDK_PACKAGE,
      packageVersion: null,
    };
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version?: string };
  return {
    installed: true,
    installDir,
    packageName: COPILOT_SDK_PACKAGE,
    packageVersion: packageJson.version ?? null,
  };
}

/**
 * Installs the optional Copilot SDK into the user-level runtime directory.
 */
export function installCopilotSdk(runtimesDir?: string): OptionalRuntimeInstallStatus {
  const installDir = getCopilotRuntimeInstallDir(runtimesDir);
  fs.mkdirSync(installDir, { recursive: true });
  const packageJsonPath = path.join(installDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    fs.writeFileSync(
      packageJsonPath,
      `${JSON.stringify({ name: "codex-switch-copilot-runtime", private: true, version: "0.0.0" }, null, 2)}\n`,
      "utf8"
    );
  }

  const installCommand = resolveNpmInstallCommand();
  const result = spawnImplementation(installCommand.command, installCommand.args, {
    cwd: installDir,
    stdio: "pipe",
    encoding: "utf8",
    shell: false,
  });

  if (result.error) {
    throw cliError("COPILOT_SDK_INSTALL_FAILED", "Failed to install the optional Copilot SDK runtime.", {
      installDir,
      packageName: COPILOT_SDK_PACKAGE,
      cause: result.error.message,
      errorCode: (result.error as NodeJS.ErrnoException).code ?? null,
      command: installCommand.command,
      args: installCommand.args,
    });
  }

  if (result.status !== 0) {
    throw cliError("COPILOT_SDK_INSTALL_FAILED", "Failed to install the optional Copilot SDK runtime.", {
      installDir,
      packageName: COPILOT_SDK_PACKAGE,
      cause: result.stderr || result.stdout || `npm exited with status ${String(result.status)}`,
      command: installCommand.command,
      args: installCommand.args,
    });
  }

  return probeCopilotSdkInstall(runtimesDir);
}

/**
 * Resolves a stable npm install invocation for the optional Copilot SDK runtime.
 */
function resolveNpmInstallCommand(): { command: string; args: string[] } {
  const installArgs = ["install", "--no-save", `${COPILOT_SDK_PACKAGE}@${COPILOT_SDK_VERSION}`];
  const npmCliPath = resolveNpmCliPath();
  if (npmCliPath) {
    return {
      command: process.execPath,
      args: [npmCliPath, ...installArgs],
    };
  }
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: installArgs,
  };
}

/**
 * Finds a locally available npm CLI script near the active Node runtime.
 */
function resolveNpmCliPath(): string | null {
  const execDir = path.dirname(process.execPath);
  const candidates = [
    process.env.npm_execpath,
    path.join(execDir, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(execDir, "..", "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(execDir, "..", "..", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return path.resolve(candidate);
    }
  }
  return null;
}
