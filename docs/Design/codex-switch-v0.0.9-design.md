# codex-switch `0.0.9` Design

## 1. Purpose

This design turns the `0.0.9` PRD into an implementable CLI and runtime spec for the local Copilot bridge path.

The release goal is not to introduce a background service product. It is to make the existing local Copilot bridge safe to start, stop, inspect, and reuse from a single-process user-space workflow.

## 2. Scope

### In scope

- `codexs bridge start [provider]`
- `codexs bridge stop [provider]`
- `codexs bridge status [provider]`
- single-instance bridge reuse and replacement
- detached user-space bridge workers
- 5-digit default port selection with recovery when the preferred port is occupied
- runtime state persistence outside the managed backup transaction boundary
- Copilot-only target selection helpers
- switch-time bridge reuse through the same lifecycle code path

### Out of scope

- boot autostart
- login autostart
- Windows Service support
- multiple concurrent managed bridge instances
- non-Copilot runtime families
- any new auth storage scheme for upstream Copilot login state

## 3. Command Surface

### 3.1 New commands

- `codexs bridge start [provider]`
- `codexs bridge stop [provider]`
- `codexs bridge status [provider]`

The command registry must add nested tokens under the public `bridge` namespace, with the longest token sequence winning during argument resolution.

### 3.2 Command semantics

- `start` is a write command
- `stop` is an operational write/recovery command
- `status` is a read command

### 3.3 Target resolution

For `bridge start`, provider resolution proceeds in this order:

1. explicit provider argument
2. current active provider, if it is a Copilot bridge provider
3. sole configured Copilot bridge provider
4. interactive Copilot-only provider picker in a TTY

If none of those paths resolves a target, the command fails with a design-level bridge target error.

For `bridge stop` and `bridge status`, resolution prefers the current runtime-state instance when present. An explicit provider argument acts as a guard and must not silently target a different provider instance.

## 4. Runtime Model

### 4.1 Single-instance policy

The bridge runtime is a single detached user-space worker.

- If the bridge is already healthy for the same provider, `start` and `switch` reuse it.
- If the bridge is healthy for a different provider, the current managed instance is stopped before a new one is started.
- Runtime state is stored separately from the managed file backup transaction, so the bridge can survive or be inspected outside file rollbacks.

### 4.2 Health checks

Bridge startup must verify the worker by probing the local `/healthz` endpoint before the command reports success.

Bridge status must report:

- the last known runtime state
- whether the provider binding matches the expected provider
- whether the live worker is healthy
- the reason if the state is stale or mismatched

### 4.3 Stop behavior

`bridge stop` is protection-first.

- It stops the managed worker when one exists.
- It clears the runtime-state manifest.
- It must not mutate `providers.json`, `config.toml`, or `auth.json`.
- If the caller supplies a provider that does not match the tracked runtime state, the command fails rather than stopping the wrong instance.

## 5. Port Policy

- The default bridge host is `127.0.0.1`.
- The default bridge port is fixed at `41415`.
- The port must always remain in the 5-digit range.
- If the preferred port is occupied, the runtime must automatically select another free 5-digit port.
- Any recovered port must be persisted back into the provider record and the corresponding `config.toml` runtime projection before the command reports success.
- The persisted port must match the live worker port.

The key design constraint is that runtime state and managed config cannot diverge after a successful start.

## 6. Persistence Boundaries

`bridge start` may update:

- `providers.json`
- the matching `config.toml` bridge projection
- runtime state manifest

`bridge start` must not rewrite:

- `auth.json`
- active profile state except when invoked through the shared `switch` flow

`switch` keeps using the same bridge lifecycle path and performs its own auth/config transaction afterward.

Runtime state is explicitly outside backup transactions. If file persistence fails after the worker has started, the implementation must clean up the new worker unless it was reused from a previous healthy instance.

## 7. Error Model

The implementation should reuse existing error families where possible and add bridge-specific errors for unresolved target and provider mismatch cases.

Relevant bridge/runtime errors:

- `BRIDGE_TARGET_UNRESOLVED`
- `BRIDGE_PROVIDER_MISMATCH`
- `BRIDGE_PORT_CONFLICT`
- `BRIDGE_START_FAILED`
- `BRIDGE_HEALTHCHECK_FAILED`
- `RUNTIME_PROVIDER_INVALID`
- `PROVIDER_BASE_URL_MISMATCH`

The design intent is that the bridge commands fail clearly before mutating managed files when the provider cannot be resolved or the provider/runtime binding is inconsistent.

## 8. Implementation Shape

The implementation should be split into three layers:

- command wiring in `src/commands/`
- app use cases in `src/app/`
- worker and healthcheck code in `src/runtime/`

The bridge-specific app layer should own:

- target resolution
- port recovery
- provider/config projection updates
- runtime-state cleanup

The runtime layer should own:

- worker spawning
- healthcheck probing
- detached-process cleanup
- runtime-state manifest read/write

## 9. Tests

Minimum coverage for `0.0.9`:

- command parsing and help for `bridge start|stop|status`
- longest-token resolution for nested commands
- explicit provider, active-provider, sole-provider, and TTY fallback selection
- current-runtime-state preference for stop/status
- mismatch-guard behavior for stop/status
- single-instance reuse and replacement
- stale runtime-state cleanup
- port conflict recovery
- persisted port updates
- cleanup when file mutation fails after a successful bridge start
- direct-provider regressions

## 10. Release Criteria

`0.0.9` is complete when the following are true:

- Copilot bridge can be managed manually with `bridge start|stop|status`
- `switch` reuses the same lifecycle path
- the default bridge port is 5 digits and port conflicts recover automatically
- runtime state is durable enough for status and stop behavior, but remains outside managed backup transactions
- direct providers keep their existing behavior

