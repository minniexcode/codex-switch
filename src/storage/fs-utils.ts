import * as fs from "node:fs";
import * as path from "node:path";
import { CliErrorShape, ErrorCode, cliError } from "../domain/errors";
import { redactSecretValues } from "../domain/secrets";

/**
 * Permission bits for managed files. Enforced on POSIX only; see writeTextFileAtomic.
 */
const SECURE_FILE_MODE = 0o600;

/**
 * Permission bits for directories this tool creates. Applied only to directories
 * that do not already exist, so a pre-existing `~/.codex` or `~/.claude` is never
 * re-permissioned.
 */
const SECURE_DIR_MODE = 0o700;

/**
 * Creates a directory tree when it does not already exist.
 */
export function ensureDir(directoryPath: string): void {
  fs.mkdirSync(directoryPath, { recursive: true, mode: SECURE_DIR_MODE });
}

/**
 * Writes a text file via a temporary sibling file and atomic rename.
 *
 * The rename is the only step that touches the destination, so a concurrent reader
 * sees either the old contents or the new ones, never a missing file. That requires
 * the temp file to be a sibling: a cross-filesystem rename is not atomic.
 */
export function writeTextFileAtomic(filePath: string, contents: string): void {
  ensureDir(path.dirname(filePath));
  // Use the current process id in the temp name to reduce collision risk.
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, contents, { encoding: "utf8", mode: SECURE_FILE_MODE });
  fs.renameSync(tempPath, filePath);
  if (process.platform !== "win32") {
    // The mode passed to writeFileSync is masked by the umask, so it is a floor
    // rather than an exact value. chmod is exact. On Windows chmod only toggles
    // the read-only bit, so it is skipped rather than pretended to be security.
    fs.chmodSync(filePath, SECURE_FILE_MODE);
  }
}

/**
 * Reads a required text file and throws a typed error when it is missing.
 */
export function readRequiredFile(filePath: string, code: ErrorCode, label: string): string {
  if (!fs.existsSync(filePath)) {
    throw cliError(code, `${label} does not exist.`, { file: filePath });
  }
  return fs.readFileSync(filePath, "utf8");
}

/**
 * Formats arbitrary error detail values for human-readable output.
 */
export function formatDetail(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Renders structured error details while suppressing secret-shaped values.
 *
 * Details are caller-defined and can nest arbitrarily, so the whole tree is
 * redacted once up front rather than filtering known key names at this layer.
 */
export function printErrorDetails(error: CliErrorShape): string[] {
  if (!error.details) {
    return [];
  }

  const details = redactSecretValues(error.details) as Record<string, unknown>;
  const lines: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    lines.push(`  ${key}: ${formatDetail(value)}`);
  }
  return lines;
}
