# @minniexcode/codex-switch

`@minniexcode/codex-switch` is a local-first CLI for managing and switching Codex provider/profile configuration safely.

Current product direction:

- CLI-first
- local-first
- safe by default
- AI-friendly

The intended command name is:

```bash
codexs
```

## Status

The repository now contains the first end-to-end modular CLI implementation for the MVP command set defined in `docs/`.

The project is implemented as a TypeScript CLI, builds into `dist/`, and is organized into `cli`, `app`, `domain`, and `infra` layers for maintainability.

## Why This Exists

Managing multiple Codex providers or profiles locally usually falls into two bad options:

- ad hoc scripts that work once but are hard to maintain
- heavier account or desktop tools that solve a broader problem than local switching

`@minniexcode/codex-switch` sits between those extremes. It aims to provide a stable CLI interface for:

- viewing the current Codex profile
- listing locally configured providers
- switching providers safely
- backing up config before mutation
- rolling back on failure
- importing and exporting provider mappings
- returning structured output for automation and AI agents

## Product Definition

`@minniexcode/codex-switch` is intended to manage files under `~/.codex/`:

```text
~/.codex/
  config.toml
  auth.json
  providers.json
  backups/
```

Core design principles:

- `providers.json` is the management-state single source of truth for provider metadata and mappings
- `config.toml` and `auth.json` are runtime mirrors that codex-switch synchronizes safely
- `backups/latest.json` tracks rollback state for the latest managed mutation window
- all writes should be backed up first
- failures should trigger rollback
- write operations should execute under a lightweight single-process file lock
- CLI output should stay stable and machine-readable

## MVP Commands

The current MVP command surface is:

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

## CLI Experience

The CLI supports both explicit automation-friendly commands and progressive terminal flows for high-frequency human write commands.

- explicit flags remain the primary contract for scripts and AI agents
- `codexs add` prompts for missing required values in a real TTY
- `codexs switch` can let you select a provider when `<provider>` is omitted in a TTY
- `codexs remove` selects and confirms deletions in a TTY, while automation still requires `--force`
- `codexs import`, `codexs export`, and `codexs rollback` ask for dangerous-action confirmation in a TTY
- `--json` stays non-interactive and should be used for machine parsing

Examples:

```bash
codexs help
codexs help add
codexs add packycode --profile packycode --api-key sk-xxx
codexs add
codexs switch
codexs remove freemodel
codexs rollback
```

## Example Provider Model

Planned `providers.json` shape:

```json
{
  "providers": {
    "packycode": {
      "profile": "packycode",
      "apiKey": "sk-xxx",
      "baseUrl": "https://example.com/v1",
      "note": "primary free model route",
      "tags": ["free", "daily"]
    }
  }
}
```

`providers.json` should be treated as a local secret because it may contain API keys.

## Install

Global install:

```bash
npm install -g @minniexcode/codex-switch
```

One-off execution:

```bash
npx @minniexcode/codex-switch
```

Current CLI entry check:

```bash
codexs --help
```

## Current Repository Contents

This repository contains both the product documents and the CLI implementation:

- [Product Overview](./docs/codex-switch-product-overview.md)
- [Product Research](./docs/codex-switch-product-research.md)
- [PRD](./docs/codex-switch-prd.md)
- [Technical Architecture](./docs/codex-switch-technical-architecture.md)
- [Command Design](./docs/codex-switch-command-design.md)

## Implementation Notes

Current implementation characteristics:

- modular TypeScript architecture split into `app`, `domain`, `infra`, and `cli`
- repository-style infra modules for providers, config, backups, and write locks
- a shared mutation orchestration contract that wraps backup, rollback, and lock handling
- safe write flows with backup manifests under `backups/`
- rollback support for `config.toml` and optional `auth.json`
- `status` and `doctor` expose live-state drift so future backfill/edit/sync flows can reuse the same core model
- stable `--json` envelopes for automation
- richer top-level and command-specific help output
- inquirer-backed progressive TTY flows for add, switch, remove, import/export confirmations, and rollback confirmation
- test coverage in `tests/` using a custom serial runner (`tests/run-tests.js`) because the current environment hits `node --test` worker/spawn restrictions

## Storage Model

The current storage model is intentionally split:

- management state: `providers.json`
- runtime state: `config.toml` and `auth.json`
- rollback state: `backups/latest.json` and timestamped backup manifests

That keeps the MVP file-based while preserving the same boundary a future database-backed registry would use.

## Concurrency And Drift

Current write semantics are intentionally lightweight:

- every mutating command runs inside `~/.codex/.codex-switch.lock`
- each mutation creates a backup first and rolls back on failure
- `status` and `doctor` detect when the active runtime profile in `config.toml` is no longer mapped in `providers.json`

That drift signal is the contract for future `edit`, `sync`, and explicit backfill flows. The current version detects and reports drift, but does not silently write live runtime changes back into the management registry.

## Non-Goals for MVP

The first version is not trying to be:

- a GUI or desktop app
- a background daemon
- a full account management platform
- a proxy/router layer
- a remote sync service

## Development

Local development:

```bash
npm install
npm run build
npm test
node dist/cli.js --help
```

## License

MIT
