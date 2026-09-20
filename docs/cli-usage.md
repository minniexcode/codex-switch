# CLI Usage

This document describes the current `0.3.1` repository development-line CLI contract for `@minniexcode/codex-switch`.

`codex-switch` is a local-first CLI for managing and switching Codex and Claude Code provider routing. It manages local provider records, projects the active Codex route into `config.toml` and `auth.json`, and switches Claude Code `settings.json` profiles.

## Version

Current package version: `0.3.1`

This line targets Codex `0.134.0+`, where the active route is selected by top-level `model` plus `model_provider`. Legacy top-level `profile` and `[profiles.*]` sections may still be inspected for migration/adoption, but they are not the recommended managed route.

`0.3.1` is a security patch over `0.3.0`. It adds the global `--reveal` flag and changes what `show --claude` returns; no other command contract changes.

## Global Options

| Flag | Meaning |
|---|---|
| `--json` | Render the standard JSON envelope and disable all prompts. |
| `--reveal` | Print secret values instead of masking them. Affects `show --claude` only. |
| `--codex-dir <path>` | Target a specific Codex directory instead of `~/.codex`. |
| `--claude` | Target the Claude Code path on the commands that support it. |
| `--help` | Show top-level or command-specific help. |
| `--version` | Print the current CLI version. |

`--reveal` is parsed as a **global** flag, not a per-command option. The command-option pass treats any `--flag <non-flag>` pair as a valued option, so a per-command `--reveal` would swallow the provider name that follows it. As a global flag it is matched by exact token, and both `show --claude --reveal <name>` and `show --claude <name> --reveal` work.

## Primary Workflow (Codex)

```bash
codexs init
codexs add packycode --profile packycode --model gpt-5 --api-key sk-xxx --base-url https://api.example/v1
codexs switch packycode
codexs status
codexs doctor
```

`--profile` is a CLI alias for the managed `model_provider` id.

## Claude Code Workflow

```bash
codexs add --claude copilot --from-file ~/.claude/settings-copilot.json
codexs switch --claude copilot
codexs current --claude
codexs list --claude
codexs show --claude copilot
codexs show --claude copilot --reveal
```

Claude providers store the full `settings.json` content as an opaque blob; switching replaces the entire file.

## Commands

### `init`

Initializes the `codex-switch` tool home. It creates `codex-switch.json` and `providers.json` when missing. It does not require a target Codex `config.toml`.

### `migrate`

Advanced adopt helper for existing Codex config. Use it only when existing route/profile state should be copied into managed `providers.json`.

### `list [--claude]`

Lists managed providers with their model-provider ids, model hints, tags, notes, and current-state mapping. With `--claude`, lists Claude profiles with model and active indicator instead.

Human output does not expose a provider-type column; the `--claude` flag selects the registry.

### `show <provider> [--claude] [--reveal]`

Shows one provider record.

- Codex path: human output masks the API key; `--json` returns the full local provider payload including `apiKey`. That is a documented automation contract and is unchanged in `0.3.1`. `--reveal` does not affect this path.
- Claude path: `env` values whose key looks like a credential are masked, and the raw `settings` blob is omitted. `--reveal` prints the real values and includes `settings`.

### `current [--claude]`

Reads the current top-level `model` and `model_provider` from `config.toml` and maps it back to a managed provider when possible. With `--claude`, compares the active `~/.claude/settings.json` identity fields against registered profiles.

### `status`

Reports target Codex directory, tool-home root, current model route, mapping state, auth projection state, warnings, and next step. It does not report bridge runtime health.

### `config show`

Shows the current route summary and recognizable legacy profile view.

### `config list-profiles`

Lists recognizable legacy config profiles with managed-state hints for adoption and diagnostics.

### `add`

```bash
codexs add <provider> --profile <model-provider-id> --model <model> --api-key <key> [--base-url <url>] [--note <text>] [--tag <tag> ...]
codexs add --claude <name> --from-file <settings.json>
```

Adds a provider to `providers.json`, creates or updates the matching `[model_providers.<id>]` section, and backs up managed files before writing. The `--claude` form imports a complete `settings.json` into `claude-providers.json`; field-based Claude provider creation is not supported.

### `edit`

Updates selected fields on a provider record and repairs the matching model-provider projection when needed.

### `switch [--claude]`

Codex path: switches the active route to a managed provider by writing top-level `model` and `model_provider`, updating the matching model-provider section, and projecting API-key auth. Claude path: atomically replaces `~/.claude/settings.json` with the stored profile.

### `remove [--claude]`

Removes a provider from the selected registry. Non-interactive and JSON runs require `--force`. Removing a provider that owns the active route may require `--switch-to` first.

### `import`

Replaces or merges `providers.json` from an explicit JSON file under backup flow.

### `export`

Exports current `providers.json` to an explicit file. Use `--force` to overwrite in automation.

The payload reports `count`, `secretCount` (records with a non-empty `apiKey`), and `containsSecrets`. When `containsSecrets` is true, the command emits a warning that the export contains API keys in plaintext and must not be committed. There is no automatic redaction mode.

### `backups list`

Lists managed backup manifests newest first.

### `rollback [backup-id]`

Restores the latest managed backup or a specific backup id.

Every restore path must resolve inside the managed roots supplied by the caller — the tool home, the Codex directory, and the Claude directory. A manifest naming a path outside those roots is rejected with `ROLLBACK_PATH_REJECTED` and nothing is written. Both targets share one `backups/` directory and one `latest.json`, so a Codex `rollback` may legitimately restore a Claude settings file.

### `doctor`

Runs issue-first diagnostics across config, providers, auth projection, route drift, and Codex CLI availability.

### `setup`

Deprecated. It exists only to point users to `init` for fresh state or `migrate` for adoption.

## Secret Handling

`show --claude` masks env values whose key matches the shared secret pattern (`*_TOKEN`, `*_API_KEY`, `*_SECRET`, `*_PASSWORD`, `*_CREDENTIAL`, and anything containing `auth`) in both human and `--json` output. Non-secret neighbours such as `ANTHROPIC_BASE_URL` print normally.

The raw `settings` blob is omitted rather than masked: it is opaque and can nest arbitrarily, so there is no reliable rule for which of its values are credentials. The identity fields the command exists to display are extracted into `model`, `baseUrl`, and `theme`.

The payload carries `revealed` so a renderer can tell masked from unmasked without re-deriving it. `--reveal` is the only way to see real values, and it is never applied by default.

Error details are redacted by walking the whole detail tree against the same pattern, so a nested secret is masked regardless of the key name that holds it.

`list --claude` and `current --claude` return only name, model, and base URL — no secret is reachable there.

## File Permissions

Files this tool writes are created `0600` and directories it creates are `0700`, on **macOS and Linux** only.

- `chmod` is applied after the atomic rename, because the mode passed at write time is masked by the process umask and is a floor rather than an exact value.
- Directory mode applies only to directories that do not already exist, so a pre-existing `~/.codex` or `~/.claude` is never re-permissioned.
- On Windows this is skipped: NTFS has no group/other bits for `chmod` to set, and access there is decided by ACLs, which this tool does not modify.
- Reading a file does not re-permission it. Files written by an earlier version keep their previous mode until the next write touches them. To remediate immediately on macOS or Linux:

```bash
chmod -R go-rwx ~/.config/codex-switch ~/.codex/config.toml ~/.codex/auth.json ~/.claude/settings.json
```

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

## Current Non-Goals

`0.3.1` does not provide `login copilot`, `add --copilot`, `bridge start`, `bridge status`, `bridge stop`, Copilot SDK integration, GitHub device-flow login, HTTP proxy bridge, local bridge workers, background runtime services, bridge logs, or automatic migration of old bridge state.

It also does not provide a redacted export mode, a fixed boolean-flag parser, backup retention policy, lock recovery, Claude Code plugin marketplace management, or a generic target abstraction.

## Fact Sources

Current:

- [PRD 0.3.1](./PRD/codex-switch-prd-v0.3.1.md)
- [Design 0.3.1](./Design/codex-switch-v0.3.1-design.md)
- [PRD 0.3.0](./PRD/codex-switch-prd-v0.3.0.md)
- [Design 0.3.0](./Design/codex-switch-v0.3.0-design.md)

Historical `0.1.x` and `0.2.x` docs remain archived for context only.
