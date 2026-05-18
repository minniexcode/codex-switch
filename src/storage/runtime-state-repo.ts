import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { normalizeError } from "../domain/errors";
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
};

export type CopilotBridgeStateInspection = {
  exists: boolean;
  valid: boolean;
  parseError: string | null;
  state: CopilotBridgeState | null;
};

/**
 * Returns the user-level runtime state file used by Copilot bridge helpers.
 */
export function getCopilotBridgeStatePath(): string {
  const override = process.env.CODEX_SWITCH_RUNTIME_STATE_DIR;
  if (override && override.trim() !== "") {
    return path.join(path.resolve(override), "copilot-bridge-state.json");
  }
  return path.join(os.homedir(), ".codex-switch", "runtime", "copilot-bridge-state.json");
}

/**
 * Reads the Copilot bridge state manifest when present.
 */
export function readCopilotBridgeState(): CopilotBridgeState | null {
  const statePath = getCopilotBridgeStatePath();
  if (!fs.existsSync(statePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(statePath, "utf8")) as CopilotBridgeState;
}

/**
 * Safely inspects the runtime-state file for status/doctor style read paths.
 */
export function inspectCopilotBridgeState(): CopilotBridgeStateInspection {
  const statePath = getCopilotBridgeStatePath();
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
      state: readCopilotBridgeState(),
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
export function writeCopilotBridgeState(state: CopilotBridgeState): void {
  const statePath = getCopilotBridgeStatePath();
  ensureDir(path.dirname(statePath));
  writeTextFileAtomic(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Deletes the Copilot bridge state manifest when present.
 */
export function clearCopilotBridgeState(): void {
  const statePath = getCopilotBridgeStatePath();
  if (fs.existsSync(statePath)) {
    fs.rmSync(statePath, { force: true });
  }
}
