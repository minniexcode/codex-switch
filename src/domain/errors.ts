export type ErrorCode =
  | "INVALID_CONFIG"
  | "CONFIG_PARSE_ERROR"
  | "CONFIG_NOT_FOUND"
  | "PROVIDERS_NOT_FOUND"
  | "PROVIDERS_PARSE_ERROR"
  | "PROVIDER_NOT_FOUND"
  | "PROFILE_NOT_FOUND"
  | "PROFILE_IN_USE"
  | "BACKUP_FAILED"
  | "BACKUP_NOT_FOUND"
  | "CODEX_LOGIN_FAILED"
  | "CODEX_NOT_INSTALLED"
  | "CODEX_VERSION_UNSUPPORTED"
  | "CODEX_DIR_NOT_FOUND"
  | "CODEX_DIR_AMBIGUOUS"
  | "ROLLBACK_FAILED"
  | "LOCK_CONFLICT"
  | "LIVE_STATE_DRIFT"
  | "INVALID_IMPORT_FILE"
  | "INVALID_ARGUMENT"
  | "MANAGED_PROFILE_FIELDS_MISSING"
  | "MIGRATE_NO_ADOPTABLE_PROFILES"
  | "AUTH_JSON_INVALID"
  | "AUTH_JSON_SYNC_FAILED"
  | "ACTIVE_PROVIDER_UNRESOLVED"
  | "UNMANAGED_ACTIVE_PROFILE"
  | "UNKNOWN_COMMAND"
  | "PROMPT_CANCELLED"
  | "PROVIDERS_ALREADY_EXISTS"
  | "COMMAND_DEPRECATED"
  | "COPILOT_SDK_MISSING"
  | "COPILOT_SDK_INSTALL_FAILED"
  | "COPILOT_SDK_INSTALL_REQUIRES_TTY"
  | "COPILOT_SDK_UNSUPPORTED"
  | "COPILOT_SDK_API_UNSUPPORTED"
  | "COPILOT_SDK_VERSION_UNSUPPORTED"
  | "COPILOT_RUNTIME_NODE_UNSUPPORTED"
  | "COPILOT_AUTH_REQUIRED"
  | "COPILOT_LOGIN_REQUIRES_TTY"
  | "COPILOT_CLI_MISSING"
  | "COPILOT_LOGIN_LAUNCH_FAILED"
  | "COPILOT_LOGIN_RECHECK_FAILED"
  | "COPILOT_PREMIUM_UNAVAILABLE"
  | "BRIDGE_PORT_CONFLICT"
  | "BRIDGE_START_FAILED"
  | "BRIDGE_HEALTHCHECK_FAILED"
  | "BRIDGE_STATE_MISSING"
  | "BRIDGE_STATE_STALE"
  | "BRIDGE_TARGET_UNRESOLVED"
  | "BRIDGE_PROVIDER_MISMATCH"
  | "BRIDGE_UNSUPPORTED_REQUEST"
  | "BRIDGE_UPSTREAM_TIMEOUT"
  | "RUNTIME_PROVIDER_INVALID"
  | "PROVIDER_BASE_URL_MISMATCH"
  | "GITHUB_DEVICE_FLOW_FAILED"
  | "COPILOT_TOKEN_EXCHANGE_FAILED";

/**
 * Structured error payload shared by CLI rendering and domain services.
 */
export type CliErrorShape = {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

/**
 * Creates an Error instance enriched with a stable CLI error code and optional details.
 */
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

/**
 * Normalizes unknown thrown values into the shared CLI error shape.
 */
export function normalizeError(error: unknown): CliErrorShape {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    const candidate = error as Partial<CliErrorShape>;
    return {
      code: (candidate.code as ErrorCode) ?? "INVALID_ARGUMENT",
      message: candidate.message ?? "Unknown error.",
      details: candidate.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: "INVALID_ARGUMENT",
      message: error.message,
    };
  }

  return {
    code: "INVALID_ARGUMENT",
    message: String(error),
  };
}
