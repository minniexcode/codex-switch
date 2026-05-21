# codex-switch CLI Usage

This document describes the current CLI contract for `@minniexcode/codex-switch` at version `0.0.12`.

Executable command name:

```bash
codexs
```

## 1. Version Context

The current package version in this repository is `0.0.12`.

This is still a development-version release. The command surface already exists, but this version mainly focuses on keeping workflow guidance, help text, and implementation behavior aligned.

## 2. Primary Workflows

### 2.1 Direct Providers

```bash
codexs init
codexs add <provider> --profile <name> --api-key <key>
codexs switch <provider>
codexs status
codexs doctor
```

Intent:

- `init` prepares the `codex-switch` tool home.
- `add` creates a managed provider record.
- `switch` projects the selected provider into the target Codex runtime.
- `status` summarizes tool-home, runtime, provider, and health state.
- `doctor` gives deeper repair-oriented diagnostics.

### 2.2 GitHub Copilot

```bash
codexs init
codexs login copilot
codexs add <provider> --copilot --profile <name>
codexs switch <provider>
codexs status
codexs doctor
```

Important notes:

- `login copilot` is the upstream onboarding command.
- The current implementation prefers the bundled Copilot CLI from the managed runtime and falls back to `PATH` when needed.
- `login copilot` succeeds only after auth readiness is rechecked.
- `add --copilot` does not install or log in to Copilot for you.

## 3. Advanced Adopt Workflow

Use `migrate` only when you already have Codex runtime state that should be adopted into managed `providers.json` state.

```bash
codexs init
codexs migrate
```

`migrate` is an advanced adopt helper. It is not the default first step for fresh installs.

Current behavior:

- It reads `config.toml` profiles from the target Codex runtime.
- It can collect missing provider details in TTY mode.
- It can merge into or overwrite existing managed provider state.
- It still fails fast in non-TTY and `--json` runs when interactive input would be required.

## 4. Deprecated Entry

```bash
codexs setup
```

`setup` is deprecated. It is kept only to direct callers toward `init` or `migrate`, and it no longer performs initialization or migration work.

## 5. Global Contract

### 5.1 Global Flags

```bash
--json
--codex-dir <path>
--help
--version
```

### 5.2 Environment Variables

```bash
CODEXS_HOME
CODEXS_CODEX_DIR
```

### 5.3 Runtime Model

Tool home:

```text
~/.config/codex-switch/
  codex-switch.json
  providers.json
  backups/
  runtime/
  runtimes/
```

Target Codex runtime:

```text
~/.codex/
  config.toml
  auth.json
```

Meaning:

- `providers.json` is the managed provider registry.
- `codex-switch.json` stores tool-level metadata such as `defaultCodexDir`.
- `config.toml` remains the active runtime routing file.
- `auth.json` remains the active auth projection file.

## 6. Command Categories

Read commands:

```bash
codexs list
codexs show <provider>
codexs current
codexs status
codexs config show [profile]
codexs config list-profiles
codexs bridge status [provider]
codexs backups list
codexs doctor
```

Change commands:

```bash
codexs init
codexs login copilot
codexs migrate
codexs add <provider>
codexs edit <provider>
codexs switch <provider>
codexs remove <provider>
codexs import <file>
codexs export <file>
codexs bridge start [provider]
codexs bridge stop [provider]
codexs rollback [backup-id]
```

## 7. Selected Command Semantics

### `init`

- Creates `codex-switch.json` and `providers.json` under the tool home when they do not exist yet.
- Does not create or validate `config.toml`, `auth.json`, or the target Codex directory.
- When `--codex-dir` is passed explicitly during first-time initialization, it can persist `defaultCodexDir`.

### `login copilot`

- Supports `copilot` and `github-copilot` as the current upstream name.
- Installs the local Copilot SDK under the tool home when needed.
- Invokes the official Copilot CLI for login when readiness is not already present.
- Requires a real TTY and does not support `--json`.

### `status`

- Reports the target Codex runtime and the tool-home root.
- Reports the current profile and whether it maps to a managed provider.
- Adds bridge, Copilot SDK, and upstream auth signals when the active provider uses a local runtime bridge.
- Does not mutate any files.

### `list`

- Lists managed providers together with their linked profile.
- Distinguishes provider type using the public values `direct` and `copilot`.
- Marks the current provider only when the active runtime can be mapped back to one unique managed provider.
- When the active profile is shared by multiple providers, it does not invent a single current provider and should instead surface the ambiguity.
- TTY provider pickers used by commands such as `switch` and `show` follow the same visibility rules for profile, provider type, and current-state hints.

### `doctor`

- Checks expected config files, provider/profile consistency, and Codex CLI availability.
- Adds bridge and Copilot dependency diagnostics for Copilot-backed providers.
- Returns repair-oriented issues intended for both human users and AI agents.

### `switch`

- Direct providers rewrite `auth.json` as an API-key projection and update the active runtime profile.
- Copilot bridge providers also project the local bridge secret into the runtime while managing bridge routing.
- Managed writes are backed up and rolled back on failure.
- When `<provider>` is omitted in a TTY, the interactive provider selector should show profile, provider type, and current-state hints using the same rules as `list`.

### `migrate`

- Adopts unmanaged runtime profiles into managed `providers.json` state.
- Still relies on interactive profile selection and provider-detail collection in this release.
- Should be treated as an advanced adopt tool, not as the normal onboarding path.

## 8. Automation Boundaries

- Progressive prompts run only in a real TTY and never under `--json`.
- Human write commands may prompt for missing inputs or dangerous-action confirmation.
- Automation should pass explicit arguments and prefer `--json`.
- `login copilot` is TTY-only.
- `migrate` is not yet a complete non-interactive workflow.

## 9. Related Docs

- [README](../README.md)
- [Chinese README](../README.CN.md)
- [AI README](../README.AI.md)
- [Product Overview](./codex-switch-product-overview.md)
- [PRD 0.0.12](./PRD/codex-switch-prd-v0.0.12.md)
