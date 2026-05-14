/**
 * Result of probing one external runtime dependency such as the codex CLI.
 */
export type RuntimeAvailability =
  | {
      ok: true;
      runtime: "codex" | "copilot-sdk" | "copilot-bridge";
      version?: string;
      details?: Record<string, unknown>;
    }
  | {
      ok: false;
      runtime: "codex" | "copilot-sdk" | "copilot-bridge";
      reason: "missing" | "unsupported" | "failed";
      cause: string;
      version?: string;
      details?: Record<string, unknown>;
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

/**
 * Result of probing whether the optional Copilot SDK runtime has been installed locally.
 */
export type OptionalRuntimeInstallStatus = {
  installed: boolean;
  installDir: string;
  packageName: string;
  packageVersion?: string | null;
};
