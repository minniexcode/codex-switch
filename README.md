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

This scoped package is currently being reserved and scaffolded for the first public release.

The product scope is already defined, but the full CLI feature set is not implemented yet. The first published versions may be bootstrap releases used to reserve the npm package name and establish the command entrypoint.

If you install the package now, expect a minimal CLI shell rather than the complete switching workflow.

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

## Planned MVP

The planned MVP command surface is:

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

Planned shared flags:

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

Current bootstrap behavior:

```bash
codexs --help
```

## Current Repository Contents

This repository currently contains the product definition and PRD used to shape the first implementation:

- [Product Overview](./docs/codex-switch-product-overview.md)
- [Product Research](./docs/codex-switch-product-research.md)
- [PRD](./docs/codex-switch-prd.md)

## Roadmap

Near-term priorities:

- publish the package name and CLI entrypoint
- implement provider storage and validation
- implement config backup and rollback
- implement safe switching flow around `config.toml`
- support structured `--json` output for automation
- add cross-platform tests for Windows, macOS, and Linux paths

## Non-Goals for MVP

The first version is not trying to be:

- a GUI or desktop app
- a background daemon
- a full account management platform
- a proxy/router layer
- a remote sync service

## Development

At this stage the package is a bootstrap CLI shell. The implementation will follow the product documents in `docs/`.

## License

MIT
