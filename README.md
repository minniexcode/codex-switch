# codex-switch

`@minniexcode/codex-switch` is a local-first CLI for managing and switching Codex and Claude Code provider routing.

It keeps `codex-switch` tool state separate from the target runtime directories, so managed providers, backups, and runtime projection are handled through explicit commands instead of manual file edits.

Current package version: `0.3.0`

`0.3.0` adds Claude Code provider switching via the `--claude` flag. The tool now supports both Codex (OpenAI-compatible providers projected into `config.toml`/`auth.json`) and Claude Code (full `settings.json` profile switching).

## Install

```bash
npm install -g @minniexcode/codex-switch
codexs --help
```

For local development:

```bash
npm install
npm run build
node dist/cli.js --help
```

Node.js `>=18` is required.

## Primary Workflow (Codex)

```bash
codexs init
codexs add packycode --profile packycode --model gpt-5 --api-key sk-xxx --base-url https://api.example/v1
codexs switch packycode
codexs status
codexs doctor
```

What the workflow does:

- `init` creates the `codex-switch` tool home files.
- `add` stores a managed provider in `providers.json` and creates or updates the matching `[model_providers.<id>]` projection in `config.toml`.
- `switch` writes top-level `model` and `model_provider` in the target Codex config and projects `OPENAI_API_KEY` into `auth.json`.
- `status` summarizes current mapping, auth projection, and drift.
- `doctor` reports issue-first diagnostics.

`--profile` is a CLI alias for the managed Codex `model_provider` id. It is not the legacy Codex top-level `profile` selector.

## Claude Code Workflow

```bash
codexs add --claude opus --from-file ~/.claude/settings.json
codexs add --claude copilot --from-file ~/.claude/settings-copilot.json
codexs switch --claude copilot
codexs current --claude
codexs list --claude
```

What the workflow does:

- `add --claude` imports a complete Claude Code `settings.json` as a named profile into `claude-providers.json`.
- `switch --claude` atomically replaces `~/.claude/settings.json` with the stored profile.
- `current --claude` detects which registered profile matches the active settings.
- `list --claude` shows all Claude profiles with an active indicator.

Claude providers store the full `settings.json` content (env vars, model mappings, permissions, plugins) as an opaque blob. Switching replaces the entire file.

## Commands

Current `0.3.0` command surface:

```text
codexs init
codexs migrate
codexs list [--claude]
codexs show <provider> [--claude]
codexs current [--claude]
codexs status
codexs config show
codexs config list-profiles
codexs add <provider> --profile <id> --model <model> --api-key <key> [--base-url <url>]
codexs add --claude <name> --from-file <settings.json>
codexs edit <provider> [options]
codexs switch <provider> [--claude]
codexs remove <provider> [--claude] --force
codexs import <file>
codexs export <file>
codexs backups list
codexs rollback [backup-id]
codexs doctor
codexs setup
```

`setup` is deprecated and exists only as a pointer to `init` for fresh state or `migrate` for advanced adoption of existing Codex config.

All commands accept `--json` for the standard JSON envelope where supported by the parser, and `--codex-dir <path>` to target a specific Codex directory.

## Runtime Projection

For Codex `0.134.0+`, the active route is the top-level `model` and `model_provider` in `config.toml`.

Managed OpenAI-compatible provider projection uses this shape:

```toml
model = "gpt-5"
model_provider = "packycode"

[model_providers.packycode]
name = "packycode"
base_url = "https://api.example/v1"
wire_api = "responses"
requires_openai_auth = true
```

`codex-switch` intentionally does not write legacy `[profiles.*]` sections for new managed providers, and it removes legacy `env_key`/`env_key_instructions` fields from managed model-provider projections when it writes them.

Authentication is projected into the target Codex `auth.json` as API-key mode with `OPENAI_API_KEY`. Do not commit real keys or private provider exports.

## Managed State

Tool home:

```text
~/.config/codex-switch/
  codex-switch.json
  providers.json
  claude-providers.json
  backups/
```

Target Codex directory:

```text
~/.codex/
  config.toml
  auth.json
```

Target Claude Code directory:

```text
~/.claude/
  settings.json
```

Environment variables:

- `CODEXS_HOME` overrides the `codex-switch` tool home.
- `CODEXS_CODEX_DIR` provides the default target Codex directory when `--codex-dir` is not passed.
- `CODEXS_CLAUDE_DIR` overrides the Claude Code directory (default: `~/.claude`).
- In development, `NODE_ENV=development` defaults to `./dev-codex/local-sandbox` when no override is set.

## Migration And Adoption

Use `migrate` only when you already have Codex runtime config that should be adopted into managed `providers.json` state. It is not the default fresh-install command.

```bash
codexs migrate
codexs migrate --overwrite --codex-dir ~/.codex
```

## Current Non-Goals

`0.3.0` does not implement or reserve runtime code paths for:

- GitHub Copilot SDK integration.
- GitHub device-flow login.
- HTTP proxy bridge or local bridge worker commands.
- Background runtime services, bridge logs, or bridge runtime state.
- Built-in third-party router packaging.
- Account systems or cloud sync.
- Claude Code plugin marketplace management.
- Generic "target" abstraction or pluggable provider type system.

## Development

```bash
npm run build
npx tsc --noEmit
npm test
node dist/cli.js --help
node dist/cli.js --version
npm pack --dry-run
```

## Fact Sources

Current fact sources:

- [PRD 0.3.0](./docs/PRD/codex-switch-prd-v0.3.0.md)
- [Design 0.3.0](./docs/Design/codex-switch-v0.3.0-design.md)
- [PRD 0.2.1](./docs/PRD/codex-switch-prd-v0.2.1.md)
- [Design 0.2.1](./docs/Design/codex-switch-v0.2.1-design.md)
- [CLI usage](./docs/cli-usage.md)

Historical documents remain under `docs/PRD/` and `docs/Design/` for context only.
