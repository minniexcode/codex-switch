import { summarizeClaudeSettings } from "../domain/claude-providers";
import { maskSecretValues } from "../domain/secrets";
import { readClaudeProviderRecord } from "../storage/claude-providers-repo";
import { CommandResult } from "./types";

/**
 * Shows details of a single Claude provider profile.
 *
 * Secrets are masked unless the caller passes `reveal`. The raw `settings` blob is
 * withheld entirely in the default case rather than masked: it is opaque and can nest
 * arbitrarily, so there is no reliable rule for which of its values are credentials.
 */
export async function claudeShowProvider(args: {
  claudeProvidersPath: string;
  providerName: string;
  reveal: boolean;
}): Promise<CommandResult> {
  const record = readClaudeProviderRecord(args.claudeProvidersPath, args.providerName);
  const summary = summarizeClaudeSettings(record.settings);
  const env = (record.settings.env as Record<string, string> | undefined) ?? {};

  const data: Record<string, unknown> = {
    target: "claude",
    provider: args.providerName,
    model: summary.model,
    baseUrl: summary.baseUrl,
    theme: summary.theme,
    note: record.note ?? null,
    tags: record.tags ?? [],
    env: args.reveal ? env : maskSecretValues(env),
    revealed: args.reveal,
  };

  if (args.reveal) {
    data.settings = record.settings;
  }

  return { data };
}
