import { cliError } from "../domain/errors";
import { readProvidersFile, writeProvidersFile } from "../infra/providers-repo";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Removes a provider from the managed providers registry.
 */
export function removeProvider(args: {
  codexDir: string;
  backupsDir: string;
  latestBackupPath: string;
  providersPath: string;
  providerName: string;
}): CommandResult {
  const providers = readProvidersFile(args.providersPath);
  if (!providers.providers[args.providerName]) {
    throw cliError("PROVIDER_NOT_FOUND", `Provider "${args.providerName}" was not found.`);
  }

  const nextProviders = { ...providers.providers };
  // Delete against a copied object so the original parsed state stays untouched.
  delete nextProviders[args.providerName];

  return runMutation({
    codexDir: args.codexDir,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "remove",
    files: [{ absolutePath: args.providersPath, relativePath: "providers.json" }],
    mutate: () => {
      writeProvidersFile(args.providersPath, { providers: nextProviders });
      return {
        provider: args.providerName,
      };
    },
  });
}
