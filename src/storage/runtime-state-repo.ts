import * as fs from "node:fs";
import * as path from "node:path";
import { normalizeError } from "../domain/errors";
import { resolveCodexSwitchHome } from "./codex-paths";
import { ensureDir, writeTextFileAtomic } from "./fs-utils";

/**
 * Manifest describing the last known local Copilot bridge runtime.
 */
export type CopilotBridgeState = {
  provider: string;
  pid: number | null;
  host: string;
  port: number;
  baseUrl: string;
  startedAt: string;
  lastHealthcheckAt: string;
  workerBuildId?: string;
  logPath?: string;
  lastProbeAt?: string;
  lastRestartReason?: string;
};

export type CopilotBridgeStateInspection = {
  exists: boolean;
  valid: boolean;
  parseError: string | null;
  state: CopilotBridgeState | null;
};

/**
 * Returns the tool-home runtime state file used by Copilot bridge helpers.
 */
export function getCopilotBridgeStatePath(runtimeDir?: string): string {
  const override = process.env.CODEX_SWITCH_RUNTIME_STATE_DIR;
  if (override && override.trim() !== "") {
    return path.join(path.resolve(override), "copilot-bridge-state.json");
  }
  const baseRuntimeDir = runtimeDir ? path.resolve(runtimeDir) : path.join(resolveCodexSwitchHome(), "runtime");
  return path.join(baseRuntimeDir, "copilot-bridge-state.json");
}

/**
 * Returns the persisted bridge runtime log path colocated with the bridge state manifest.
 */
export function getCopilotBridgeLogPath(runtimeDir?: string): string {
  const statePath = getCopilotBridgeStatePath(runtimeDir);
  return path.join(path.dirname(statePath), "copilot-bridge.log");
}

/**
 * Reads the Copilot bridge state manifest when present.
 */
export function readCopilotBridgeState(runtimeDir?: string): CopilotBridgeState | null {
  const statePath = getCopilotBridgeStatePath(runtimeDir);
  if (!fs.existsSync(statePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(statePath, "utf8")) as CopilotBridgeState;
}

/**
 * Safely inspects the runtime-state file for status/doctor style read paths.
 */
export function inspectCopilotBridgeState(runtimeDir?: string): CopilotBridgeStateInspection {
  const statePath = getCopilotBridgeStatePath(runtimeDir);
  if (!fs.existsSync(statePath)) {
    return {
      exists: false,
      valid: false,
      parseError: null,
      state: null,
    };
  }

  try {
    return {
      exists: true,
      valid: true,
      parseError: null,
      state: readCopilotBridgeState(runtimeDir),
    };
  } catch (error: unknown) {
    return {
      exists: true,
      valid: false,
      parseError: normalizeError(error).message,
      state: null,
    };
  }
}

/**
 * Persists the Copilot bridge state manifest.
 */
export function writeCopilotBridgeState(state: CopilotBridgeState, runtimeDir?: string): void {
  const statePath = getCopilotBridgeStatePath(runtimeDir);
  ensureDir(path.dirname(statePath));
  writeTextFileAtomic(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Deletes the Copilot bridge state manifest when present.
 */
export function clearCopilotBridgeState(runtimeDir?: string): void {
  const statePath = getCopilotBridgeStatePath(runtimeDir);
  if (fs.existsSync(statePath)) {
    fs.rmSync(statePath, { force: true });
  }
}
