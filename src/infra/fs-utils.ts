import * as fs from "node:fs";
import * as path from "node:path";
import { CliErrorShape, ErrorCode, cliError } from "../domain/errors";

export function ensureDir(directoryPath: string): void {
  fs.mkdirSync(directoryPath, { recursive: true });
}

export function writeTextFileAtomic(filePath: string, contents: string): void {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, contents, "utf8");
  fs.renameSync(tempPath, filePath);
}

export function readRequiredFile(filePath: string, code: ErrorCode, label: string): string {
  if (!fs.existsSync(filePath)) {
    throw cliError(code, `${label} does not exist.`, { file: filePath });
  }
  return fs.readFileSync(filePath, "utf8");
}

export function formatDetail(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function printErrorDetails(error: CliErrorShape): string[] {
  if (!error.details) {
    return [];
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(error.details)) {
    if (typeof value === "string" && key.toLowerCase().includes("apikey")) {
      continue;
    }
    lines.push(`  ${key}: ${formatDetail(value)}`);
  }
  return lines;
}
