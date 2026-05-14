## @minniexcode/codex-switch

`codex-switch` is a local-first CLI for managing and switching Codex provider/profile configuration safely.

It is designed for users who work with multiple Codex providers, API keys, or profiles and want a repeatable, backup-first workflow instead of manually editing files under `~/.codex/`.

中文版: [README.CN.md](./README.CN.md)

## Overview

What it does:

- Initialize an empty managed `providers.json`
- Migrate unmanaged runtime profiles from an existing Codex directory
- List, show, add, edit, and remove provider records
- Switch the active provider/profile safely
- Import and export provider definitions
- Run diagnostics and detect local drift
- List backups and roll back to a previous managed state

Current version: `0.0.8`

## Install

Install globally:

```bash
npm install -g @minniexcode/codex-switch
```

Or run directly:

```bash
npx @minniexcode/codex-switch --help
```

CLI entry:

```bash
codexs --help
```

## Quick Start

Take over an existing Codex directory:

```bash
codexs init
codexs migrate
```

Inspect managed providers:

```bash
codexs list
codexs show my-provider
```

Add and switch:

```bash
codexs add my-provider --profile my-provider --api-key sk-xxx
codexs switch my-provider
```

Check runtime state:

```bash
codexs current
codexs status
codexs doctor
```

## Common Commands

```bash
codexs init
codexs migrate
codexs list
codexs show <provider>
codexs current
codexs status
codexs add <provider> --profile <name> --api-key <key>
codexs edit <provider> [--profile <name>] [--api-key <key>]
codexs switch <provider>
codexs remove <provider>
codexs import <file> [--merge]
codexs export <file>
codexs backups list
codexs rollback [backup-id]
codexs doctor
```

Command help:

```bash
codexs help switch
codexs help init
codexs help migrate
codexs help setup
```

## How It Works

By default, `codex-switch` operates on `~/.codex/`, and you can override the target with `--codex-dir`.

Managed files:

```text
~/.codex/
  config.toml
  auth.json
  providers.json
  backups/
```

Notes:

- `providers.json` is the managed provider registry
- `config.toml` and `auth.json` represent runtime state
- mutating commands back up before writing
- rollback is available after failed or undesired changes

## Automation

This CLI supports both human TTY use and non-interactive automation.

Current exceptions:
- `init` is automation-friendly and idempotent, but still returns a structured error in non-interactive or `--json` mode when the resolved target directory does not exist.
- `migrate` remains intentionally TTY-only for adopt initialization. It requires interactive profile selection and provider detail collection, and non-interactive/`--json` runs fail fast with a structured error.

Recommended global flags:

```bash
--json
--codex-dir <path>
--help
--version
```

Recommendations:

- use `--json` for stable machine-readable output
- pass all required arguments explicitly in scripts or CI
- use `--codex-dir <path>` for sandbox or test environments

## Testing

Build and test locally:

```bash
npm run build
npm test
```

The repository includes a development fixture under `dev-codex/local-sandbox` plus dedicated test docs:

- [Testing Guide](./docs/testing.md)
- [Test Report for 0.0.5](./docs/test-report-0.0.5.md)

## Documentation

- [Chinese README](./README.CN.md)
- [AI README](./README.AI.md)
- [Detailed CLI Usage](./docs/cli-usage.md)
- [Testing Guide](./docs/testing.md)
- [Test Report for 0.0.5](./docs/test-report-0.0.5.md)
- [Product Overview](./docs/codex-switch-product-overview.md)
- [Technical Architecture](./docs/codex-switch-technical-architecture.md)
- [Design Doc 0.0.5](./docs/Design/codex-switch-v0.0.5-design.md)
- [Design Doc 0.0.4](./docs/Design/codex-switch-v0.0.4-design.md)

## License

MIT
