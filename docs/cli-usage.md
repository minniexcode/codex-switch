# CLI Usage

This document describes the current `0.2.1` repository development-line CLI contract for `@minniexcode/codex-switch`.

`codex-switch` is a local-first provider/model-provider management CLI for Codex. It manages local provider records and projects the active Codex route into `config.toml` and `auth.json`.

## Version

Current package version: `0.2.1`

This line targets Codex `0.134.0+`, where the active route is selected by top-level `model` plus `model_provider`. Legacy top-level `profile` and `[profiles.*]` sections may still be inspected for migration/adoption, but they are not the recommended managed route.

## Primary Workflow

```bash
codexs init
codexs add packycode --profile packycode --model gpt-5 --api-key sk-xxx --base-url https://api.example/v1
codexs switch packycode
codexs status
codexs doctor
```

`--profile` is a CLI alias for the managed `model_provider` id.

## Commands

### `init`

Initializes the `codex-switch` tool home. It creates `codex-switch.json` and `providers.json` when missing. It does not require a target Codex `config.toml`.

### `migrate`

Advanced adopt helper for existing Codex config. Use it only when existing route/profile state should be copied into managed `providers.json`.

### `list`

Lists managed providers with their model-provider ids, model hints, tags, notes, and current-state mapping. Human output does not expose a provider-type column because `0.2.1` has only the provider-management path.

### `show <provider>`

Shows one provider record. Human output masks the API key; JSON output returns the local provider payload.

### `current`

Reads the current top-level `model` and `model_provider` from `config.toml` and maps it back to a managed provider when possible.

### `status`

Reports target Codex directory, tool-home root, current model route, mapping state, auth projection state, warnings, and next step. It does not report bridge runtime health.

### `config show`

Shows the current route summary and recognizable legacy profile view.

### `config list-profiles`

Lists recognizable legacy config profiles with managed-state hints for adoption and diagnostics.

### `add`

```bash
codexs add <provider> --profile <model-provider-id> --model <model> --api-key <key> [--base-url <url>] [--note <text>] [--tag <tag> ...]
```

Adds a provider to `providers.json`, creates or updates the matching `[model_providers.<id>]` section, and backs up managed files before writing.

### `edit`

Updates selected fields on a provider record and repairs the matching model-provider projection when needed.

### `switch`

Switches the active Codex route to a managed provider by writing top-level `model` and `model_provider`, updating the matching model-provider section, and projecting API-key auth.

### `remove`

Removes a provider from `providers.json`. Non-interactive and JSON runs require `--force`. Removing a provider that owns the active route may require `--switch-to` first.

### `import`

Replaces or merges `providers.json` from an explicit JSON file under backup flow.

### `export`

Exports current `providers.json` to an explicit file. Use `--force` to overwrite in automation.

### `backups list`

Lists managed backup manifests newest first.

### `rollback`

Restores the latest managed backup or a specific backup id.

### `doctor`

Runs issue-first diagnostics across config, providers, auth projection, route drift, and Codex CLI availability.

### `setup`

Deprecated. It exists only to point users to `init` for fresh state or `migrate` for adoption.

## Current Non-Goals

`0.2.1` does not provide `login copilot`, `add --copilot`, `bridge start`, `bridge status`, `bridge stop`, Copilot SDK integration, GitHub device-flow login, HTTP proxy bridge, local bridge workers, background runtime services, bridge logs, or automatic migration of old bridge state.

## JSON Contract

`--json` renders the standard envelope:

```json
{
  "ok": true,
  "command": "status",
  "data": {},
  "warnings": [],
  "error": null
}
```

Failures render the same envelope to stderr with `ok: false` and a structured error.

## Fact Sources

Current:

- [PRD 0.2.1](./PRD/codex-switch-prd-v0.2.1.md)
- [Design 0.2.1](./Design/codex-switch-v0.2.1-design.md)

Historical `0.1.x` and `0.2.0` docs remain archived for context only.
