import { CommandResult } from "./types";
import { readCurrentProfile } from "../storage/config-repo";

/**
 * Returns the currently active top-level Codex profile.
 */
export function getCurrentProfile(configPath: string): CommandResult {
  return {
    data: {
      profile: readCurrentProfile(configPath),
    },
  };
}
