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

export type RuntimeDependencyProbe = {
  probe: (options?: { minVersion?: string }) => RuntimeAvailability;
};

export type AuthRuntimeAdapter = {
  probe: (options?: { minVersion?: string }) => RuntimeAvailability;
  readState?: () => Promise<unknown>;
  acquire?: () => Promise<unknown>;
};

export type ProxyRuntimeAdapter = {
  probe: () => RuntimeAvailability;
  getStatus?: () => Promise<unknown>;
};
