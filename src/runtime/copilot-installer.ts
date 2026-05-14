import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { cliError } from "../domain/errors";
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
 * Returns the user-level runtime directory used to lazily install the Copilot SDK.
 */
export function getCopilotRuntimeInstallDir(): string {
  const override = process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
  if (override && override.trim() !== "") {
    return path.resolve(override);
  }
  return path.join(os.homedir(), ".codex-switch", "runtimes", "copilot");
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
export function probeCopilotSdkInstall(): OptionalRuntimeInstallStatus {
  const installDir = getCopilotRuntimeInstallDir();
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
export function installCopilotSdk(): OptionalRuntimeInstallStatus {
  const installDir = getCopilotRuntimeInstallDir();
  fs.mkdirSync(installDir, { recursive: true });
  const packageJsonPath = path.join(installDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    fs.writeFileSync(
      packageJsonPath,
      `${JSON.stringify({ name: "codex-switch-copilot-runtime", private: true, version: "0.0.0" }, null, 2)}\n`,
      "utf8"
    );
  }

  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnImplementation(command, ["install", "--no-save", `${COPILOT_SDK_PACKAGE}@${COPILOT_SDK_VERSION}`], {
    cwd: installDir,
    stdio: "pipe",
    encoding: "utf8",
    shell: false,
  });

  if (result.status !== 0) {
    throw cliError("COPILOT_SDK_INSTALL_FAILED", "Failed to install the optional Copilot SDK runtime.", {
      installDir,
      packageName: COPILOT_SDK_PACKAGE,
      cause: result.stderr || result.stdout || `npm exited with status ${String(result.status)}`,
    });
  }

  return probeCopilotSdkInstall();
}
