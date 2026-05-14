import * as fs from "node:fs";
import { cliError, normalizeError } from "../domain/errors";
import { ProviderRecord } from "../domain/providers";
import { writeTextFileAtomic } from "./fs-utils";

export type ManagedAuthState = {
  exists: boolean;
  valid: boolean;
  parseError: string | null;
  authMode: string | null;
  managedSecretKeys: string[];
  payload: Record<string, unknown> | null;
};

const LEGACY_MANAGED_SECRET_KEYS = new Set(["api_key"]);

/**
 * Reads auth.json when it exists and returns null otherwise.
 */
export function readAuthFileIfExists(authPath: string): unknown | null {
  if (!fs.existsSync(authPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(authPath, "utf8"));
  } catch (error: unknown) {
    throw cliError("AUTH_JSON_INVALID", "Failed to parse auth.json.", {
      file: authPath,
      cause: normalizeError(error).message,
    });
  }
}

/**
 * Builds the stable managed auth payload for one provider.
 */
export function buildManagedAuthPayload(provider: ProviderRecord): { auth_mode: "apikey"; [key: string]: string } {
  return {
    auth_mode: "apikey",
    [provider.envKey]: provider.apiKey,
  };
}

/**
 * Builds the next auth.json object while preserving unmanaged metadata.
 */
export function buildManagedAuthJson(provider: ProviderRecord, existingAuthJson?: unknown): Record<string, unknown> {
  const nextManaged = buildManagedAuthPayload(provider);
  const result: Record<string, unknown> = {};

  if (existingAuthJson && typeof existingAuthJson === "object" && !Array.isArray(existingAuthJson)) {
    for (const [key, value] of Object.entries(existingAuthJson as Record<string, unknown>)) {
      if (key === "auth_mode" || LEGACY_MANAGED_SECRET_KEYS.has(key) || looksLikeManagedSecretKey(key)) {
        continue;
      }
      result[key] = value;
    }
  }

  result.auth_mode = nextManaged.auth_mode;
  result[provider.envKey] = provider.apiKey;
  return result;
}

/**
 * Writes auth.json atomically using the managed mirror strategy.
 */
export function writeAuthFile(authPath: string, provider: ProviderRecord, existingAuthJson?: unknown): void {
  writeTextFileAtomic(authPath, `${JSON.stringify(buildManagedAuthJson(provider, existingAuthJson), null, 2)}\n`);
}

/**
 * Extracts a lightweight fingerprint used by doctor/status.
 */
export function extractManagedAuthFingerprint(input: unknown): {
  authMode: string | null;
  managedSecretKeys: string[];
  payload: Record<string, unknown> | null;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      authMode: null,
      managedSecretKeys: [],
      payload: null,
    };
  }

  const payload = input as Record<string, unknown>;
  const authMode = typeof payload.auth_mode === "string" ? payload.auth_mode : null;
  const managedSecretKeys = Object.keys(payload)
    .filter((key) => key !== "auth_mode" && looksLikeManagedSecretKey(key))
    .sort();

  return {
    authMode,
    managedSecretKeys,
    payload,
  };
}

/**
 * Reads auth.json into a doctor-friendly managed state summary.
 */
export function readManagedAuthState(authPath: string): ManagedAuthState {
  if (!fs.existsSync(authPath)) {
    return {
      exists: false,
      valid: false,
      parseError: null,
      authMode: null,
      managedSecretKeys: [],
      payload: null,
    };
  }

  try {
    const payload = readAuthFileIfExists(authPath);
    const fingerprint = extractManagedAuthFingerprint(payload);
    return {
      exists: true,
      valid: Boolean(fingerprint.payload),
      parseError: null,
      authMode: fingerprint.authMode,
      managedSecretKeys: fingerprint.managedSecretKeys,
      payload: fingerprint.payload,
    };
  } catch (error: unknown) {
    return {
      exists: true,
      valid: false,
      parseError: normalizeError(error).message,
      authMode: null,
      managedSecretKeys: [],
      payload: null,
    };
  }
}

function looksLikeManagedSecretKey(key: string): boolean {
  if (LEGACY_MANAGED_SECRET_KEYS.has(key)) {
    return true;
  }
  return /^[A-Z0-9_]+$/.test(key);
}
