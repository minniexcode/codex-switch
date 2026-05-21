# AI README

This file summarizes the current operational contract for AI agents, automation scripts, and contributors.

## Package Context

- Package: `@minniexcode/codex-switch`
- CLI name: `codexs`
- Current repository version: `0.0.12`
- Version status: development-version software, not a stable `0.1.0` release yet

## Product Role

`codex-switch` is a local-first TypeScript CLI that manages provider and profile state for Codex while keeping tool-managed state separate from the target Codex runtime.

The managed source of truth is the tool home. Runtime files under the target Codex directory are projected outputs, not the main registry.

## Primary Workflows

Direct provider workflow:

```bash
codexs init
codexs add <provider> --profile <name> --api-key <key>
codexs switch <provider>
codexs status
codexs doctor
```

GitHub Copilot workflow:

```bash
codexs init
codexs login copilot
codexs add <provider> --copilot --profile <name>
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
- `migrate` still depends on interactive profile selection and provider-detail collection in this release.
- `status` is the main dual-path summary command.
- `doctor` is the deeper repair-oriented diagnostic command.

## Safety Notes

- Treat `providers.json` as sensitive because it may contain API keys.
- Human-readable output may mask secrets, but JSON output can expose full provider payloads.
- Managed write operations rely on backup and rollback flow; do not describe manual file edits as the primary workflow.
