export type ErrorCode =
  | "CONFIG_NOT_FOUND"
  | "PROVIDERS_NOT_FOUND"
  | "PROVIDERS_PARSE_ERROR"
  | "PROVIDER_NOT_FOUND"
  | "PROFILE_NOT_FOUND"
  | "BACKUP_FAILED"
  | "CODEX_LOGIN_FAILED"
  | "ROLLBACK_FAILED"
  | "INVALID_IMPORT_FILE";

export type CliErrorShape = {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export function cliError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): Error & CliErrorShape {
  const error = new Error(message) as Error & CliErrorShape;
  error.code = code;
  error.details = details;
  return error;
}

export function normalizeError(error: unknown): CliErrorShape {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    const candidate = error as Partial<CliErrorShape>;
    return {
      code: (candidate.code as ErrorCode) ?? "INVALID_IMPORT_FILE",
      message: candidate.message ?? "Unknown error.",
      details: candidate.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: "INVALID_IMPORT_FILE",
      message: error.message,
    };
  }

  return {
    code: "INVALID_IMPORT_FILE",
    message: String(error),
  };
}
