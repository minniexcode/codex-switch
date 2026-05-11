import { CommandResult } from "./types";
import { readCurrentProfile } from "../infra/config-repo";

export function getCurrentProfile(configPath: string): CommandResult {
  return {
    data: {
      profile: readCurrentProfile(configPath),
    },
  };
}
