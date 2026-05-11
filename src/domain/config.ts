import * as os from "node:os";

/**
 * Reads the active top-level profile from config.toml content.
 */
export function parseTopLevelProfile(configContent: string): string | null {
  let inRoot = true;
  for (const line of configContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      inRoot = false;
      continue;
    }
    if (!inRoot || trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^profile\s*=\s*["']([^"']+)["']/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Collects all named profile sections declared in config.toml content.
 */
export function parseProfileNames(configContent: string): Set<string> {
  const result = new Set<string>();
  for (const line of configContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = trimmed.match(/^\[profiles\.([^\]]+)\]$/);
    if (match) {
      result.add(match[1]);
    }
  }

  return result;
}

/**
 * Replaces or inserts the top-level profile assignment while preserving the rest of the file.
 */
export function replaceTopLevelProfile(configContent: string, profile: string): string {
  const lines = configContent.split(/\r?\n/);
  let inRoot = true;
  let replaced = false;
  const nextLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      // Only the root section may contain the active `profile = ...` switch.
      inRoot = false;
      return line;
    }

    if (!replaced && inRoot && /^profile\s*=/.test(trimmed)) {
      replaced = true;
      return `profile = "${profile}"`;
    }

    return line;
  });

  if (!replaced) {
    // When no root-level profile exists yet, insert it before the first section header.
    const insertAt = nextLines.findIndex((line) => line.trim().startsWith("["));
    if (insertAt === -1) {
      nextLines.push(`profile = "${profile}"`);
    } else {
      nextLines.splice(insertAt, 0, `profile = "${profile}"`);
    }
  }

  return nextLines.join(os.EOL);
}
