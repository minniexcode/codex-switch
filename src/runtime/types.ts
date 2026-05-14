/**
 * Result of probing one external runtime dependency such as the codex CLI.
 */
export type RuntimeAvailability =
  | {
      ok: true;
      runtime: "codex";
      version?: string;
    }
  | {
      ok: false;
      runtime: "codex";
      reason: "missing" | "unsupported" | "failed";
      cause: string;
      version?: string;
    };

/**
 * Minimal interface for probing runtime availability with optional version requirements.
 */
export type RuntimeDependencyProbe = {
  probe: (options?: { minVersion?: string }) => RuntimeAvailability;
};

/**
 * Adapter contract for authentication-oriented runtime integrations.
 */
export type AuthRuntimeAdapter = {
  probe: (options?: { minVersion?: string }) => RuntimeAvailability;
  readState?: () => Promise<unknown>;
  acquire?: () => Promise<unknown>;
};

/**
 * Adapter contract for proxy/runtime helpers that only expose status checks.
 */
export type ProxyRuntimeAdapter = {
  probe: () => RuntimeAvailability;
  getStatus?: () => Promise<unknown>;
};
