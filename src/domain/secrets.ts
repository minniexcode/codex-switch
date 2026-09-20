/**
 * Key-name pattern for values that must never be rendered, exported, or logged verbatim.
 *
 * Tuned against the Claude Code env keys this tool stores: it catches
 * `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_API_KEY` while leaving neighbouring
 * configuration such as `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_ATTRIBUTION_HEADER`,
 * and the `CLAUDE_CODE_*` feature flags untouched.
 */
export const SECRET_KEY_PATTERN = /(api[_-]?key|token|secret|password|credential|auth)/i;

/**
 * Placeholder used when a secret-bearing key holds a non-string value.
 */
export const REDACTED_PLACEHOLDER = "[redacted]";

/**
 * Returns true when a key name indicates its value is a credential.
 */
export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

/**
 * Masks a secret for human-readable output while preserving a short fingerprint.
 */
export function maskSecret(value: string): string {
  if (value.length <= 5) {
    return "*".repeat(Math.max(value.length, 1));
  }

  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

/**
 * Masks the values of secret-named entries in a flat string map.
 */
export function maskSecretValues(values: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    masked[key] = isSecretKey(key) ? maskSecret(String(value)) : value;
  }
  return masked;
}

/**
 * Recursively replaces secret-named values anywhere in an arbitrary structure.
 *
 * Used for error details, where the shape is caller-defined and cannot be
 * enumerated ahead of time.
 */
export function redactSecretValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSecretValues(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        isSecretKey(key)
          ? typeof entry === "string"
            ? maskSecret(entry)
            : REDACTED_PLACEHOLDER
          : redactSecretValues(entry),
      ])
    );
  }

  return value;
}
