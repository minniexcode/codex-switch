# `0.0.9` Bridge Automated Testing Guide

This document defines the automated test strategy for the `0.0.9` Copilot bridge release.

## Goal

The release must prove that the managed Copilot bridge can:

- resolve the correct provider target
- start, stop, and report status through the public CLI surface
- reuse one healthy instance for the same provider
- replace an existing managed instance for a different provider
- recover from preferred-port conflicts using another 5-digit port
- persist recovered ports into `providers.json` and `config.toml`
- clean up newly started workers when persistence fails
- surface stale runtime-state diagnostics through `status` and `doctor`

## Test Layers

Bridge coverage is intentionally split across four layers.

### 1. Runtime Layer

File: `tests/runtime.spec.js`

Use this layer for low-level worker/runtime behaviors:

- bridge HTTP health endpoint behavior
- worker fallback defaults
- port conflict recovery
- single-instance replacement at the runtime-state layer
- direct `probeCopilotBridgeRuntime()` status behavior

### 2. Workflow Layer

File: `tests/workflows.spec.js`

Use this layer for app use cases and filesystem side effects:

- `startBridge`
- `stopBridge`
- `statusBridge`
- `switchProvider`
- `runDoctor`
- persistence and rollback behavior

### 3. Command Layer

File: `tests/commands.spec.js`

Use this layer for registry, argument parsing, and dispatch wiring:

- nested command parsing
- help text
- `executeCommand()` dispatch for `bridge start|stop|status`
- mismatch-guard and unresolved-target error contracts

### 4. Built CLI Layer

File: `tests/cli-e2e.spec.js`

Use this layer only for a small number of user-visible end-to-end checks:

- `bridge start --json`
- `bridge status --json`
- `bridge stop --json`
- stable JSON error envelopes for bridge failures

## Shared Fixtures And Helpers

### Existing helpers

- `tests/helpers.js`
  - `makeSandboxCopy()`
  - `makeEmptyCodexDir()`
  - `runBuiltCli()`
  - `runJsonCli()`
- `tests/workflows.spec.js`
  - `makeFixture()`
  - `withCodexAvailable()`
  - `withFakeCopilotSdk()`
  - `getFreePort()`
  - `requestJson()`
- `tests/commands.spec.js`
  - `makeTempCodexDir()`
  - `writeBridgeFixture()`
  - `withFakeCopilotSdk()`

### Environment hooks

Mock bridge-oriented tests should continue to use:

- `CODEX_SWITCH_COPILOT_RUNTIME_DIR`
- `CODEX_SWITCH_RUNTIME_STATE_DIR`

These keep SDK loading and runtime-state persistence isolated inside temporary directories.

## Required Automated Coverage

### Runtime tests

Required scenarios:

- healthy in-process bridge serves `/healthz`
- worker fallback port remains `41415`
- `ensureCopilotBridge()` reuses a healthy worker for the same provider
- `ensureCopilotBridge()` replaces a different managed provider instance
- `ensureCopilotBridge()` recovers from preferred-port conflicts
- `ensureCopilotBridge()` reports startup failures with `BRIDGE_START_FAILED`

Recommended additions when extending runtime coverage:

- `probeCopilotBridgeRuntime()` with missing state
- `probeCopilotBridgeRuntime()` with stale state and no active Copilot provider
- `probeCopilotBridgeRuntime()` with base URL mismatch
- `probeCopilotBridgeRuntime()` with failed healthcheck

### Workflow tests

Required scenarios:

- explicit `bridge start|status|stop`
- `bridge stop` idempotency without runtime state
- recovered-port persistence into `providers.json` and `config.toml`
- cleanup when recovered-port persistence fails for a newly started worker
- cleanup when recovered-port persistence fails after replacing a previous worker
- providers rollback when config projection update fails
- stale runtime-state surfaced by `status` and `doctor` while a direct provider is active
- `switchProvider()` keeps bridge cleanup semantics on failure

Recommended additions when extending workflow coverage:

- active-provider bridge target resolution without explicit provider argument
- sole Copilot provider resolution without explicit provider argument
- explicit mismatch guard for `bridge stop`
- explicit mismatch guard for `bridge status`
- `BRIDGE_TARGET_UNRESOLVED` for non-interactive multi-provider ambiguity

### Command tests

Required scenarios:

- nested `bridge` command parsing
- bridge help text rendering
- `executeCommand()` dispatches `bridge start|status|stop`

Recommended additions when extending command coverage:

- `executeCommand()` mismatch guard for `bridge stop`
- `executeCommand()` mismatch guard for `bridge status`
- `executeCommand()` unresolved target failures

### Built CLI tests

Required scenarios:

- `bridge start|status|stop` through the built CLI entrypoint
- read-command JSON envelope remains stable while `doctor` now may report multiple issue codes

Recommended additions when extending CLI coverage:

- `bridge status` stale runtime-state envelope
- `bridge start` unresolved-target envelope

## Fast Execution Order

When time is limited, implement and verify tests in this order:

1. `tests/commands.spec.js`
2. `tests/workflows.spec.js`
3. `tests/cli-e2e.spec.js`
4. `tests/runtime.spec.js`

This order catches the highest-value regressions first:

- wiring regressions
- persistence/cleanup regressions
- user-visible CLI regressions
- low-level runtime regressions

## Running The Suite

Build and run all tests:

```bash
npm test
```

This runs:

```bash
npm run build
node tests/run-tests.js
```

## Release Gate For `0.0.9`

Treat bridge automation as release-ready only when all of the following are true:

- `commands`, `runtime`, `workflows`, and `cli-e2e` all pass
- `bridge start|stop|status` are covered at both app and CLI layers
- single-instance reuse and replacement are covered
- recovered-port persistence and cleanup failure paths are covered
- stale runtime-state diagnostics are covered in both `status` and `doctor`

## Remaining Manual Smoke Checks

Automated coverage does not replace a final real-environment smoke pass.

Before shipping, still run a logged-in Copilot smoke check for:

- real `bridge start`
- real `bridge status`
- one real request through `/v1/chat/completions`
- real `bridge stop`
- real `switch <copilot-provider>` reuse/replacement behavior

## Minimal Manual Smoke Checklist

Use this short checklist after the automated suite passes and after you have logged into Copilot in the real target environment.

### Preconditions

- run from the repository root
- use the real Codex directory you intend to validate
- ensure the target Copilot provider already exists in `providers.json`
- ensure the optional Copilot SDK is installed
- ensure you are logged into Copilot before starting the live smoke pass

Suggested placeholder values:

- `<CODEX_DIR>`: your real Codex directory
- `<COPILOT_PROVIDER>`: the Copilot-backed provider name you want to validate

### 1. Confirm the automated gate is still green

```bash
npm test
```

Expected result:

- build succeeds
- all automated suites pass

### 2. Start the real managed bridge

```bash
node dist/cli.js bridge start <COPILOT_PROVIDER> --json --codex-dir <CODEX_DIR>
```

Expected result:

- command exits successfully
- JSON payload reports the requested provider
- payload includes `host`, `port`, and `baseUrl`
- `reused` is `false` on the first successful start unless a healthy matching bridge is already running

### 3. Confirm bridge status

```bash
node dist/cli.js bridge status <COPILOT_PROVIDER> --json --codex-dir <CODEX_DIR>
```

Expected result:

- command exits successfully
- `health.ok` is `true`
- `active` is `true`
- `matches` is `true`

### 4. Send one real request through the bridge

Use the `baseUrl` and API key from the selected provider record. Replace `<BRIDGE_BASE_URL>` and `<BRIDGE_API_KEY>` with real values from your environment.

```bash
curl -sS <BRIDGE_BASE_URL>/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <BRIDGE_API_KEY>" \
  -d "{\"model\":\"gpt-4o-mini\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word OK.\"}]}"
```

Expected result:

- HTTP request succeeds
- response contains a completion payload
- model output proves the request reached the live bridge successfully

If your shell or environment prefers the OpenAI-style path, validate the same request against:

```text
<BRIDGE_BASE_URL>/chat/completions
```

### 5. Verify same-provider reuse

Run the start command again:

```bash
node dist/cli.js bridge start <COPILOT_PROVIDER> --json --codex-dir <CODEX_DIR>
```

Expected result:

- command exits successfully
- `reused` is `true`
- reported `port` remains stable

### 6. Verify switch reuse or replacement behavior

Run a real switch into the Copilot provider:

```bash
node dist/cli.js switch <COPILOT_PROVIDER> --json --codex-dir <CODEX_DIR>
```

Expected result:

- command exits successfully
- provider/profile switch succeeds
- if the same healthy bridge is already running, it is reused
- if another managed bridge instance was active, it is replaced cleanly

If you have a second Copilot provider available, also validate explicit replacement:

```bash
node dist/cli.js bridge start <SECOND_COPILOT_PROVIDER> --json --codex-dir <CODEX_DIR>
```

Expected result:

- previous managed instance is replaced
- status for the new provider is healthy
- no stale runtime-state mismatch is left behind

### 7. Stop the managed bridge

```bash
node dist/cli.js bridge stop <COPILOT_PROVIDER> --json --codex-dir <CODEX_DIR>
```

Expected result:

- command exits successfully
- payload reports `stopped: true`

### 8. Confirm shutdown state

```bash
node dist/cli.js bridge status <COPILOT_PROVIDER> --json --codex-dir <CODEX_DIR>
```

Expected result:

- command may either report inactive bridge health or a missing runtime state, depending on the exact environment state
- it must not falsely report a healthy active managed bridge after stop

### Manual Pass Criteria

Treat the live smoke pass as complete only when all of the following are true:

- `bridge start` succeeds in a logged-in real environment
- `bridge status` reports a healthy active bridge
- one real request succeeds through the bridge
- repeated `bridge start` reuses the same healthy instance
- `switch <copilot-provider>` preserves expected reuse/replacement behavior
- `bridge stop` shuts the managed instance down cleanly
