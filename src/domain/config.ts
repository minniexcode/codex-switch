import * as os from "node:os";

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

export function replaceTopLevelProfile(configContent: string, profile: string): string {
  const lines = configContent.split(/\r?\n/);
  let inRoot = true;
  let replaced = false;
  const nextLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
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
    const insertAt = nextLines.findIndex((line) => line.trim().startsWith("["));
    if (insertAt === -1) {
      nextLines.push(`profile = "${profile}"`);
    } else {
      nextLines.splice(insertAt, 0, `profile = "${profile}"`);
    }
  }

  return nextLines.join(os.EOL);
}
