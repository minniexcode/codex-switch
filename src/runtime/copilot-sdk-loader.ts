import * as path from "node:path";
import { cliError } from "../domain/errors";
import { getCopilotRuntimeInstallDir, probeCopilotSdkInstall } from "./copilot-installer";

/**
 * Dynamically resolves the lazily installed Copilot SDK entrypoint.
 */
export function getCopilotSdkEntrypoint(): string {
  return path.join(getCopilotRuntimeInstallDir(), "node_modules", "@github", "copilot-sdk");
}

/**
 * Loads the Copilot SDK only when a Copilot runtime path is exercised.
 */
export async function loadCopilotSdk(): Promise<unknown> {
  const status = probeCopilotSdkInstall();
  if (!status.installed) {
    throw cliError("COPILOT_SDK_MISSING", "The optional Copilot SDK runtime is not installed.", {
      installDir: status.installDir,
      packageName: status.packageName,
    });
  }
  return import(getCopilotSdkEntrypoint());
}
