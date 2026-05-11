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

- `config.toml` remains the source of the active top-level `profile`
- `providers.json` stores provider-to-profile and provider-to-key mappings
- all writes should be backed up first
- failures should trigger rollback
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
- safe write flows with backup manifests under `backups/`
- rollback support for `config.toml` and optional `auth.json`
- stable `--json` envelopes for automation
- test coverage in `tests/` using a custom serial runner (`tests/run-tests.js`) because the current environment hits `node --test` worker/spawn restrictions

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
