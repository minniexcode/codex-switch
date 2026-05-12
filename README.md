# @minniexcode/codex-switch

`@minniexcode/codex-switch` is a local-first CLI for managing and switching Codex provider/profile configuration safely.

It is built for people who use multiple Codex providers, API keys, or profiles and want a repeatable way to switch between them without manually editing files under `~/.codex/`.

## What This Repository Is For

This repository contains the CLI implementation, package metadata, and product documents for `codex-switch`.

The project focuses on a simple idea:

- keep Codex profile switching local
- back up config before writes
- roll back on failure
- support both humans in a terminal and AI/automation workflows

## What It Can Do

Current MVP command set:

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

What that means in practice:

- list locally managed providers
- show the current active profile
- switch to another provider safely
- import and export provider mappings
- add or remove provider records
- detect config drift and common local issues
- back up managed files before mutation and roll back when needed

## Quick Start

### For Humans

Install globally:

```text
npm install -g @minniexcode/codex-switch
```

Or run without installing globally:

```text
npx @minniexcode/codex-switch --help
```

Check the CLI:

```text
codexs --help
```

Typical usage:

```text
codexs list
codexs current
codexs add my-provider --profile my-provider --api-key sk-xxx
codexs switch my-provider
codexs status
```

### For LLM Agents

Read this first:

```text
./README.AI.md
```

Then install and use the project by following the agent-specific instructions in that file.

Reference:

- [AI README](./README.AI.md)

Shared flags:

```text
--json
--codex-dir <path>
```

## Interactive Use

The CLI supports both explicit commands and guided terminal flows.

- `codexs add` prompts for missing required values in a real TTY
- `codexs switch` can show a provider selector when no provider is passed
- `codexs remove` supports interactive selection and confirmation
- `import`, `export`, and `rollback` ask for confirmation in interactive mode
- `--json` remains non-interactive for scripts and agents

## Files It Manages

`codex-switch` is designed around files under `~/.codex/`:

```text
~/.codex/
  config.toml
  auth.json
  providers.json
  backups/
```

Storage model:

- `providers.json` is the management source of truth
- `config.toml` and `auth.json` are runtime state
- `backups/latest.json` tracks the latest rollback window

`providers.json` may contain API keys, so it should be treated as a local secret.

## Documentation

User-oriented project docs:

- [Chinese README](./README.CN.md)
- [AI README](./README.AI.md)
- [Product Overview](./docs/codex-switch-product-overview.md)
- [Product Research](./docs/codex-switch-product-research.md)
- [PRD](./docs/codex-switch-prd.md)
- [Technical Architecture](./docs/codex-switch-technical-architecture.md)
- [Command Design](./docs/codex-switch-command-design.md)

## Latest 3 Versions

### 0.0.3

- Added interactive TTY flows for high-frequency commands such as `add`, `switch`, `remove`, `import`, `export`, and `rollback`
- Improved help output and command-specific guidance
- Expanded CLI test coverage for interactive and argument handling behavior

### 0.0.2

- Added mutation orchestration with backup-first writes, rollback handling, and single-process locking
- Improved `status` and `doctor` so they can detect runtime drift more clearly
- Strengthened repository and domain layers for safer config operations

### 0.0.1

- Shipped the initial TypeScript CLI implementation
- Added the core MVP commands and file-based provider management model
- Added the first full set of product, architecture, and command design docs

## License

MIT
