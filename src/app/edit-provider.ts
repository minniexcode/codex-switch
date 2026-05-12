import { cliError } from "../domain/errors";
import { cleanProviderRecord } from "../domain/providers";
import { ensureDir } from "../infra/fs-utils";
import { readProvidersFile, writeProvidersFile } from "../infra/providers-repo";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Updates selected fields on a single managed provider.
 */
export function editProvider(args: {
  codexDir: string;
  backupsDir: string;
  latestBackupPath: string;
  providersPath: string;
  providerName: string;
  profile?: string | null;
  apiKey?: string | null;
  baseUrl?: string | null;
  note?: string | null;
  tags?: string[] | null;
}): CommandResult {
  ensureDir(args.codexDir);
  const providers = readProvidersFile(args.providersPath);
  const current = providers.providers[args.providerName];
  if (!current) {
    throw cliError("PROVIDER_NOT_FOUND", `Provider "${args.providerName}" was not found.`, {
      provider: args.providerName,
      file: args.providersPath,
    });
  }

  const updatedFields: string[] = [];
  const nextRecord = cleanProviderRecord({
    profile: args.profile ?? current.profile,
    apiKey: args.apiKey ?? current.apiKey,
    baseUrl: args.baseUrl === null ? undefined : args.baseUrl ?? current.baseUrl,
    note: args.note === null ? undefined : args.note ?? current.note,
    tags: args.tags ?? current.tags,
  });

  if (args.profile !== undefined && args.profile !== current.profile) {
    updatedFields.push("profile");
  }
  if (args.apiKey !== undefined && args.apiKey !== current.apiKey) {
    updatedFields.push("apiKey");
  }
  if (args.baseUrl !== undefined && (args.baseUrl ?? undefined) !== current.baseUrl) {
    updatedFields.push("baseUrl");
  }
  if (args.note !== undefined && (args.note ?? undefined) !== current.note) {
    updatedFields.push("note");
  }
  if (args.tags !== undefined) {
    updatedFields.push("tags");
  }

  return runMutation({
    codexDir: args.codexDir,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "edit",
    files: [{ absolutePath: args.providersPath, relativePath: "providers.json" }],
    mutate: () => {
      writeProvidersFile(args.providersPath, {
        providers: {
          ...providers.providers,
          [args.providerName]: nextRecord,
        },
      });

      return {
        provider: args.providerName,
        updatedFields,
      };
    },
  });
}
