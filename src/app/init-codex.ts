import * as fs from "node:fs";
import { cliError } from "../domain/errors";
import { ensureDir } from "../storage/fs-utils";
import { writeProvidersFile } from "../storage/providers-repo";
import { CommandResult } from "./types";

/**
 * Initializes a Codex directory for managed providers.json usage without requiring live Codex state.
 */
export function initCodex(args: {
  codexDir: string;
  providersPath: string;
  configPath: string;
  authPath: string;
  createCodexDir: boolean;
}): CommandResult {
  const codexDirExists = fs.existsSync(args.codexDir);
  if (!codexDirExists && !args.createCodexDir) {
    throw cliError("CODEX_DIR_NOT_FOUND", "The requested Codex directory does not exist.", {
      codexDir: args.codexDir,
    });
  }

  if (!codexDirExists) {
    ensureDir(args.codexDir);
  }

  const providersExists = fs.existsSync(args.providersPath);
  if (!providersExists) {
    writeProvidersFile(args.providersPath, { providers: {} });
  }

  return {
    data: {
      codexDir: args.codexDir,
      createdCodexDir: !codexDirExists,
      createdProvidersFile: !providersExists,
      providersAlreadyExisted: providersExists,
      configExists: fs.existsSync(args.configPath),
      authExists: fs.existsSync(args.authPath),
    },
  };
}
