# AI README

This file is for AI agents, automation scripts, and contributors who need a compact operational summary of the repository.

## Repository Purpose

`@minniexcode/codex-switch` is a local-first TypeScript CLI for managing provider/profile state for Codex under `~/.codex/`.

Primary goals:

- safe local profile switching
- backup-before-write mutation flows
- rollback on failure
- stable machine-readable CLI output
- support for both human TTY usage and agent automation

## Main Command Surface

```bash
codexs list
codexs current
codexs switch <provider>
codexs status
codexs import <file>
codexs export <file>
codexs add <provider>
codexs remove <provider>
codexs doctor
codexs rollback
```

Shared flags:

```bash
--json
--codex-dir <path>
```

## Important Runtime Files

```text
~/.codex/
  config.toml
  auth.json
  providers.json
  backups/
```

Operational model:

- `providers.json` is the management-state source of truth
- `config.toml` and `auth.json` are runtime mirrors
- `backups/latest.json` tracks the latest rollback state
- mutating commands should back up first and run under a lightweight file lock

## Project Structure

```text
src/
  app/
  cli/
  domain/
  infra/
tests/
docs/
dist/
```

Layer intent:

- `cli`: argument parsing, help, TTY flows, output shaping
- `app`: command orchestration and use-case logic
- `domain`: pure domain rules and shared models
- `infra`: filesystem, lock, backup, config, and Codex integration code

## Command Entry Point

Use `codexs` directly for runtime interaction:

```bash
codexs --help
codexs list --json
codexs status --json
```

## Current Version Context

Current package version in this repository:

```text
0.0.3
```

Recent version summary:

- `0.0.3`: interactive TTY flows and improved help
- `0.0.2`: mutation orchestration, backups, rollback, locks, drift detection improvements
- `0.0.1`: initial TypeScript CLI and baseline docs

## Notes For Agents

- Prefer `--json` when invoking commands programmatically
- Treat `providers.json` as sensitive because it may contain API keys
- Do not assume silent write-back from runtime files into `providers.json`
- Use `docs/` for deeper product and architecture context
