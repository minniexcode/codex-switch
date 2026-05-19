## @minniexcode/codex-switch

`codex-switch` is a local-first CLI for managing and switching Codex provider/profile configuration safely.

It is designed for users who work with multiple Codex providers, API keys, or profiles and want a repeatable, backup-first workflow instead of manually editing files under `~/.codex/`.

中文版: [README.CN.md](./README.CN.md)

## Overview

What it does in `0.0.11`:

- Initializes a dedicated `codex-switch` tool home
- Adopts unmanaged runtime profiles from an existing Codex directory
- Lists, shows, adds, edits, and removes provider records
- Switches the active provider/profile safely
- Supports explicit GitHub Copilot upstream onboarding
- Manages the local Copilot bridge runtime explicitly
- Imports and exports provider definitions
- Runs diagnostics and detects local drift
- Lists backups and rolls back to a previous managed state
- Inspects `config.toml` profiles through structured read commands

Current version: `0.0.11`

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

Initialize tool state and adopt an existing Codex runtime:

```bash
codexs init
codexs migrate
```

Inspect managed providers and config:

```bash
codexs list
codexs show my-provider
codexs config show
```

Add and switch a direct provider:

```bash
codexs add my-provider --profile my-provider --api-key sk-xxx
codexs switch my-provider
```

Prepare GitHub Copilot and manage its bridge:

```bash
codexs login copilot
codexs add copilot-main --copilot --profile copilot-main
codexs bridge start copilot-main
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
codexs login copilot
codexs migrate
codexs list
codexs show <provider>
codexs current
codexs status
codexs config show [profile]
codexs config list-profiles
codexs add <provider> --profile <name> --api-key <key>
codexs add <provider> --copilot --profile <name>
codexs edit <provider>
codexs switch <provider>
codexs bridge start [provider]
codexs bridge status [provider]
codexs bridge stop [provider]
codexs remove <provider> [--force] [--switch-to <profile>]
codexs import <file> [--merge]
codexs export <file> [--force]
codexs backups list
codexs rollback [backup-id]
codexs doctor
```

Command help:

```bash
codexs help init
codexs help login
codexs help add
codexs help bridge
codexs help config
codexs help migrate
```

## How It Works

Starting in `0.0.11`, `codex-switch` uses a dual-path model.

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

Notes:

- `providers.json` is the managed provider registry and now lives under the tool home
- `codex-switch.json` stores tool-level metadata such as `defaultCodexDir`
- `config.toml` is still the active runtime-routing file in the target Codex directory
- `auth.json` is the active auth projection file
- direct-provider switches rewrite `OPENAI_API_KEY`
- Copilot bridge providers keep upstream login in the official Copilot runtime while `codex-switch` manages the local bridge secret, bridge state, and routing
- mutating commands back up before writing and rollback stays available after failed or undesired changes

Path overrides and resolution:

- `--codex-dir <path>` explicitly targets a Codex runtime directory
- `CODEXS_CODEX_DIR` sets the default target when `--codex-dir` is not passed
- `CODEXS_HOME` overrides the tool home location

## Automation

This CLI supports both human TTY use and non-interactive automation.

Current exceptions:

- `login copilot` requires a real TTY and does not support `--json`
- `migrate` remains intentionally interactive for adopt profile selection and provider detail collection

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
- use `CODEXS_HOME` when you want tool state isolated from your default workstation setup

## Testing

Build and test locally:

```bash
npm run build
npm test
npx tsc --noEmit
```

The repository includes a development fixture under `dev-codex/local-sandbox` plus dedicated test docs:

- [Testing Guide](./docs/Tests/testing.md)
- [Bridge Testing Notes](./docs/Tests/testing-bridge-v0.0.9.md)
- [Test Report for 0.0.7](./docs/Tests/test-report-0.0.7.md)

## Documentation

- [Chinese README](./README.CN.md)
- [AI README](./README.AI.md)
- [Detailed CLI Usage](./docs/cli-usage.md)
- [Testing Guide](./docs/Tests/testing.md)
- [Product Overview](./docs/codex-switch-product-overview.md)
- [Technical Architecture](./docs/codex-switch-technical-architecture.md)
- [PRD 0.0.11](./docs/PRD/codex-switch-prd-v0.0.11.md)
- [Design Doc 0.0.11](./docs/Design/codex-switch-v0.0.11-design.md)

## License

MIT
