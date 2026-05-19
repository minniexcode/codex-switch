# AI README

This file is for AI agents, automation scripts, and contributors who need a compact operational summary of the repository.

## Repository Purpose

`@minniexcode/codex-switch` is a local-first TypeScript CLI for managing provider/profile state for Codex while keeping codex-switch tool state separate from the target Codex runtime.

Primary goals:

- safe local profile switching
- backup-before-write mutation flows
- rollback on failure
- stable machine-readable CLI output
- support for both human TTY usage and agent automation
- explicit onboarding for interactive upstreams such as GitHub Copilot

## Main Command Surface

```bash
codexs init
codexs login copilot
codexs migrate
codexs list
codexs show <provider>
codexs current
codexs status
codexs config show [profile]
codexs config list-profiles
codexs edit <provider>
codexs switch <provider>
codexs import <file>
codexs export <file>
codexs add <provider>
codexs remove <provider>
codexs bridge start [provider]
codexs bridge status [provider]
codexs bridge stop [provider]
codexs backups list
codexs doctor
codexs rollback [backup-id]
```

Shared flags:

```bash
--json
--codex-dir <path>
```

Relevant environment variables:

```bash
CODEXS_HOME
CODEXS_CODEX_DIR
```

## Important Files

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

Operational model:

- `providers.json` is the management-state source of truth
- `codex-switch.json` stores tool-level metadata such as `defaultCodexDir`
- `config.toml` remains the managed runtime-routing file in the target Codex directory
- `auth.json` remains the active auth projection file
- `runtime/` stores managed bridge runtime state
- `runtimes/` stores optional local runtimes such as the Copilot SDK install
- mutating commands back up first and run under a lightweight file lock in the tool home

## Project Structure

```text
src/
  app/
  cli/
  commands/
  domain/
  interaction/
  runtime/
  storage/
tests/
docs/
dist/
```

Layer intent:

- `cli`: output shaping and thin CLI-facing utilities
- `commands`: argument parsing, help rendering, and command dispatch
- `app`: command orchestration and use-case logic
- `domain`: pure domain rules and shared models
- `interaction`: TTY-only prompt flows
- `runtime`: Codex/Copilot runtime probing and local bridge management
- `storage`: filesystem-backed repositories and path resolution

## Command Entry Point

Use `codexs` directly for runtime interaction:

```bash
codexs --help
codexs list --json
codexs status --json
codexs config list-profiles --json
```

## Current Version Context

Current package version in this repository:

```text
0.0.11
```

Recent version summary:

- `0.0.11`: tool-home split, `login copilot`, managed bridge commands, and config inspection commands
- `0.0.10`: `init` / `migrate` command split finalized and `setup` deprecated
- `0.0.7`: command-surface refactor and setup split groundwork
- `0.0.4`: setup/show/edit/backups list/specific rollback/import merge and clearer CLI semantics
- `0.0.3`: interactive TTY flows and improved help
- `0.0.2`: mutation orchestration, backups, rollback, locks, drift detection improvements
- `0.0.1`: initial TypeScript CLI and baseline docs

## Notes For Agents

- Prefer `--json` when invoking commands programmatically
- Treat `providers.json` as sensitive because it may contain API keys
- Do not assume silent write-back from runtime files into `providers.json`
- Prefer `init` for repeatable tool-home setup and `migrate` for human-led adopt flows
- `login copilot` requires a real TTY and should not be used under `--json`
- `add --copilot` assumes SDK install and upstream auth readiness are already satisfied
- Use `docs/` for deeper product and architecture context
