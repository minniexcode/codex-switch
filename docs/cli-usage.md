# codex-switch CLI Usage

This document describes the current `0.1.3` CLI contract for `@minniexcode/codex-switch`, including the Copilot login hotfix boundary.

Executable command name:

```bash
codexs
```

## 1. Version Context

The current package version in this repository is `0.1.3`.

This release line targets Codex `0.134.0+`. The public contract assumes runtime routing is selected by top-level `model` plus `model_provider`, while legacy `profile` and `[profiles.*]` remain inspect-and-adopt inputs instead of the recommended runtime path.

## 2. Primary Workflows

### 2.1 Direct Providers

```bash
codexs init
codexs add <provider> --model <model> --api-key <key> [--base-url <url>]
codexs switch <provider>
codexs status
codexs doctor
```

Intent:

- `init` prepares the `codex-switch` tool home.
- `add` creates a managed provider record with a target model and provider route identity.
- `switch` projects the selected provider into the target Codex runtime.
- `status` summarizes tool-home, runtime, provider, and health state.
- `doctor` gives deeper repair-oriented diagnostics.

### 2.2 GitHub Copilot

```bash
codexs init
codexs login copilot
codexs add <provider> --copilot --model <model>
codexs switch <provider>
codexs status
codexs doctor
```

Important notes:

- `login copilot` is the upstream onboarding command.
- The current implementation prefers the bundled Copilot CLI from the managed runtime and falls back to `PATH` when needed.
- `login copilot` succeeds only after auth readiness is rechecked.
- `add --copilot` does not install or log in to Copilot for you.
- Copilot runtime paths require Node.js `>=20`; direct providers remain supported on Node.js `>=18`.
- The Copilot bridge is experimental and targets simple text-oriented turns through the local OpenAI-compatible bridge.

## 3. Runtime Route Contract

For Codex `0.134.0+`, the active runtime route is selected through top-level `model` and `model_provider` in `config.toml`.

`codex-switch` writes that route as its primary runtime projection:

- top-level `model`
- top-level `model_provider`
- `[model_providers.<id>]`
- `auth.json` when direct auth projection is required

Managed provider projection intentionally avoids these legacy fields:

- `model_providers.<id>.env_key`
- `model_providers.<id>.env_key_instructions`

Managed provider projection fixes these fields for OpenAI-compatible direct routes:

- `wire_api = "responses"`
- `requires_openai_auth = true`

Copilot bridge projection also writes:

- `stream_idle_timeout_ms = 300000`

Compatibility notes:

- `--profile` is accepted as an alias for the managed `model_provider` id.
- legacy top-level `profile` and `[profiles.*]` may still appear in existing runtime state
- `migrate`, `config show`, `config list-profiles`, and `doctor` can still inspect those legacy structures
- new managed runtime projection should be described as route-first, not profile-first

Example managed direct-provider projection:

```toml
model = "gpt-5.5"
model_provider = "proxy"

[model_providers.proxy]
name = "proxy"
base_url = "https://proxy.example.com/v1"
wire_api = "responses"
requires_openai_auth = true
```

Authentication projection for the direct path remains:

```json
{
  "OPENAI_API_KEY": "sk-xxx"
}
```

## 4. Advanced Adopt Workflow

Use `migrate` only when you already have Codex runtime state that should be adopted into managed `providers.json` state.

```bash
codexs init
codexs migrate
```

`migrate` is an advanced adopt helper. It is not the default first step for fresh installs.

Current behavior:

- It can inspect legacy runtime `profile` and `[profiles.*]` state from the target Codex runtime.
- It can collect missing provider details in TTY mode.
- It can merge into or overwrite existing managed provider state.
- It still fails fast in non-TTY and `--json` runs when interactive input would be required.

## 5. Deprecated Entry

```bash
codexs setup
```

`setup` is deprecated. It is kept only to direct callers toward `init` or `migrate`, and it no longer performs initialization or migration work.

## 6. Global Contract

### 6.1 Global Flags

```bash
--json
--codex-dir <path>
--help
--version
```

### 6.2 Environment Variables

```bash
CODEXS_HOME
CODEXS_CODEX_DIR
```

### 6.3 Runtime Model

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

## 7. Command Categories

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

## 8. Selected Command Semantics

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
- Reports the active model and active `model_provider` route.
- Can still surface legacy profile-derived observations when inspecting older runtime state.
- Adds bridge, Copilot SDK, and upstream auth signals when the active provider uses a local runtime bridge.
- Does not mutate any files.

### `list`

- Lists managed providers together with their linked route identity.
- Distinguishes provider type using the public values `direct` and `copilot`.
- Marks the current provider only when the active runtime can be mapped back to one unique managed provider.
- When the active route is shared by multiple providers, it does not invent a single current provider and should instead surface the ambiguity.
- TTY provider pickers used by commands such as `switch` and `show` follow the same visibility rules for route, provider type, and current-state hints.

### `doctor`

- Checks expected config files, managed-provider consistency, and Codex CLI availability.
- Inspects both route-first runtime state and legacy profile state when needed.
- Adds bridge and Copilot dependency diagnostics for Copilot-backed providers.
- Returns repair-oriented issues intended for both human users and AI agents.

### `switch`

- Projects direct providers by rewriting top-level `model`, top-level `model_provider`, the managed `[model_providers.<id>]` block, and `auth.json`.
- Cleans legacy projected `env_key` and `env_key_instructions` fields before writing the managed provider route.
- Copilot bridge providers also project the local bridge secret into the runtime while managing bridge routing.
- Managed writes are backed up and rolled back on failure.
- When `<provider>` is omitted in a TTY, the interactive provider selector should show route, provider type, and current-state hints using the same rules as `list`.

### `add` and `edit`

- Create or update managed provider records rather than editing runtime files directly.
- Treat `--profile` only as an alias for the managed `model_provider` id.
- Clean old `env_key` and `env_key_instructions` fields from managed projection during subsequent switching.

### `migrate`

- Adopts unmanaged runtime route or legacy profile state into managed `providers.json` state.
- Still relies on interactive route/profile selection and provider-detail collection in this release.
- Should be treated as an advanced adopt tool, not as the normal onboarding path.

## 9. Automation Boundaries

- Progressive prompts run only in a real TTY and never under `--json`.
- Human write commands may prompt for missing inputs or dangerous-action confirmation.
- Automation should pass explicit arguments and prefer `--json`.
- `login copilot` is TTY-only.
- `migrate` is not yet a complete non-interactive workflow.

## 10. Related Docs

- [README](../README.md)
- [Chinese README](../README.CN.md)
- [AI README](../README.AI.md)
- [Product Overview](./codex-switch-product-overview.md)
- [PRD 0.1.0](./PRD/codex-switch-prd-v0.1.0.md)
- [PRD 0.1.1](./PRD/codex-switch-prd-v0.1.1.md)
- [PRD 0.1.2](./PRD/codex-switch-prd-v0.1.2.md)
- [PRD 0.1.3](./PRD/codex-switch-prd-v0.1.3.md)
- [Design 0.1.2](./Design/codex-switch-v0.1.2-design.md)
- [Design 0.1.3](./Design/codex-switch-v0.1.3-design.md)
