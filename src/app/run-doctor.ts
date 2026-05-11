import * as fs from "node:fs";
import { parseProfileNames, parseTopLevelProfile } from "../domain/config";
import { checkCodexAvailable } from "../infra/codex-cli";
import { readProvidersFile } from "../infra/providers-repo";
import { normalizeError } from "../domain/errors";
import { CommandResult } from "./types";

export function runDoctor(args: {
  codexDir: string;
  configPath: string;
  providersPath: string;
}): CommandResult {
  const issues: Array<Record<string, unknown>> = [];
  let configProfiles: Set<string> = new Set();

  if (!fs.existsSync(args.configPath)) {
    issues.push({
      code: "CONFIG_NOT_FOUND",
      message: "config.toml does not exist.",
      file: args.configPath,
    });
  } else {
    const configContent = fs.readFileSync(args.configPath, "utf8");
    configProfiles = parseProfileNames(configContent);
    if (!parseTopLevelProfile(configContent)) {
      issues.push({
        code: "PROFILE_NOT_FOUND",
        message: "config.toml has no top-level profile.",
        file: args.configPath,
      });
    }
  }

  if (!fs.existsSync(args.providersPath)) {
    issues.push({
      code: "PROVIDERS_NOT_FOUND",
      message: "providers.json does not exist.",
      file: args.providersPath,
    });
  } else {
    try {
      const providers = readProvidersFile(args.providersPath);
      for (const [name, provider] of Object.entries(providers.providers)) {
        if (!configProfiles.has(provider.profile)) {
          issues.push({
            code: "PROFILE_NOT_FOUND",
            message: `Provider "${name}" maps to missing profile "${provider.profile}".`,
            provider: name,
            profile: provider.profile,
          });
        }
      }
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      issues.push({
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details ?? {}),
      });
    }
  }

  const codexCheck = checkCodexAvailable();
  if (!codexCheck.ok) {
    issues.push({
      code: "CODEX_LOGIN_FAILED",
      message: "codex CLI is not available.",
      cause: codexCheck.cause,
    });
  }

  return {
    data: {
      healthy: issues.length === 0,
      issues,
      codexDir: args.codexDir,
    },
    warnings: issues.length === 0 ? [] : [`doctor found ${issues.length} issue(s)`],
  };
}
