# AI README

This file summarizes the current operational contract for AI agents, automation scripts, and contributors.

## Package Context

- Package: `@minniexcode/codex-switch`
- CLI name: `codexs`
- Current repository version: `0.1.1`
- Version status: stable release line
- Runtime contract target: Codex `0.134.0+`

## Product Role

`codex-switch` is a local-first TypeScript CLI that manages provider and model-provider routing state for Codex while keeping tool-managed state separate from the target Codex runtime.

The managed source of truth is the tool home. Runtime files under the target Codex directory are projected outputs, not the main registry.

## Primary Workflows

Direct provider workflow:

```bash
codexs init
codexs add <provider> --model <model> --api-key <key> [--base-url <url>]
codexs switch <provider>
codexs status
codexs doctor
```

GitHub Copilot workflow:

```bash
codexs init
codexs login copilot
codexs add <provider> --copilot --model <model>
codexs switch <provider>
codexs status
codexs doctor
```

Advanced adopt workflow:

```bash
codexs init
codexs migrate
```

`migrate` is not a fresh-install default. It is an advanced adopt helper for existing runtime state.

## Runtime Route Contract

For Codex `0.134.0+`, the live route is selected by:

- top-level `model`
- top-level `model_provider`

Important implications for automation:

- treat `model_provider` as the active provider selector
- treat `--profile` as an alias for a managed `model_provider` id
- do not describe top-level `profile` or `[profiles.*]` as the primary runtime path
- managed direct-provider projection does not keep `env_key` or `env_key_instructions`
- managed provider projection fixes `wire_api = "responses"` and `requires_openai_auth = true`

Expected managed direct-provider projection:

```toml
model = "gpt-5.5"
model_provider = "proxy"

[model_providers.proxy]
name = "proxy"
base_url = "https://proxy.example.com/v1"
wire_api = "responses"
requires_openai_auth = true
```

Authentication remains projected through `auth.json` with `OPENAI_API_KEY`.

## Important Paths

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

Operational meaning:

- `providers.json` is the managed provider registry.
- `codex-switch.json` stores tool-level metadata such as the default target Codex directory.
- `config.toml` is the active runtime routing file.
- `auth.json` is the active auth projection file.

## Command Notes

Shared flags:

```bash
--json
--codex-dir <path>
--help
--version
```

Relevant environment variables:

```bash
CODEXS_HOME
CODEXS_CODEX_DIR
```

Important behavioral constraints:

- Prefer `--json` for programmatic invocation whenever the command supports it.
- `login copilot` requires a real TTY and does not support `--json`.
- `login copilot` currently installs the local Copilot SDK when needed, tries the bundled runtime CLI first, falls back to `PATH` when necessary, and rechecks auth readiness before reporting success.
- `add --copilot` assumes SDK install and upstream Copilot auth are already ready.
- `migrate` remains interactive when provider adoption requires human input.
- `status` is the main dual-path summary command.
- `doctor` is the deeper repair-oriented diagnostic command.

## Safety Notes

- Treat `providers.json` as sensitive because it may contain API keys.
- Human-readable output may mask secrets, but JSON output can expose full provider payloads.
- Managed write operations rely on backup and rollback flow; do not describe manual file edits as the primary workflow.
