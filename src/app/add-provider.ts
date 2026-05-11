import { cleanProviderRecord } from "../domain/providers";
import { cliError } from "../domain/errors";
import { ensureDir } from "../infra/fs-utils";
import { readProvidersFileIfExists, writeProvidersFile } from "../infra/providers-repo";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Adds a new provider record to the managed providers registry.
 */
export function addProvider(args: {
  codexDir: string;
  backupsDir: string;
  latestBackupPath: string;
  providersPath: string;
  providerName: string;
  profile: string;
  apiKey: string;
  baseUrl?: string | null;
  note?: string | null;
  tags: string[];
}): CommandResult {
  ensureDir(args.codexDir);
  const providers = readProvidersFileIfExists(args.providersPath);
  if (providers.providers[args.providerName]) {
    throw cliError("INVALID_IMPORT_FILE", `Provider "${args.providerName}" already exists.`);
  }

  const next = {
    providers: {
      ...providers.providers,
      [args.providerName]: cleanProviderRecord({
        profile: args.profile,
        apiKey: args.apiKey,
        baseUrl: args.baseUrl ?? undefined,
        note: args.note ?? undefined,
        tags: args.tags,
      }),
    },
  };

  return runMutation({
    codexDir: args.codexDir,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "add",
    files: [{ absolutePath: args.providersPath, relativePath: "providers.json" }],
    mutate: () => {
      // Persist only the normalized provider payload so later reads are deterministic.
      writeProvidersFile(args.providersPath, next);
      return {
        provider: args.providerName,
        profile: args.profile,
      };
    },
  });
}
