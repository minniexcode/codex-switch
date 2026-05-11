import * as fs from "node:fs";
import { cliError, normalizeError } from "../domain/errors";
import { ProvidersFile, sortProviders, validateProvidersShape } from "../domain/providers";
import { readRequiredFile, writeTextFileAtomic } from "./fs-utils";

export function readProvidersFile(providersPath: string): ProvidersFile {
  const raw = readRequiredFile(providersPath, "PROVIDERS_NOT_FOUND", "providers.json");
  try {
    return validateProvidersShape(JSON.parse(raw));
  } catch (error: unknown) {
    throw cliError("PROVIDERS_PARSE_ERROR", "Failed to parse providers.json.", {
      file: providersPath,
      cause: normalizeError(error).message,
    });
  }
}

export function readProvidersFileIfExists(providersPath: string): ProvidersFile {
  return fs.existsSync(providersPath) ? readProvidersFile(providersPath) : { providers: {} };
}

export function writeProvidersFile(providersPath: string, providers: ProvidersFile): void {
  writeTextFileAtomic(providersPath, `${JSON.stringify(sortProviders(providers), null, 2)}\n`);
}
