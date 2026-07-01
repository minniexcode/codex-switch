# codex-switch

`@minniexcode/codex-switch` is a local-first provider/model-provider management CLI for Codex.

It keeps `codex-switch` tool state separate from the target Codex directory, so managed providers, backups, and Codex `model_provider` projection are handled through explicit commands instead of manual file edits.

Current package version: `0.2.1`

`0.2.1` is the current repository development line. It is a provider-management-only consolidation release: direct OpenAI-compatible provider records are managed locally and projected into Codex config/auth files. This version does not include the previous account-login, local bridge, or background runtime experiments.

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

## Primary Workflow

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

## Commands

Current `0.2.1` command surface:

```text
codexs init
codexs migrate
codexs list
codexs show <provider>
codexs current
codexs status
codexs config show
codexs config list-profiles
codexs add <provider> --profile <model-provider-id> --model <model> --api-key <key> [--base-url <url>]
codexs edit <provider> [options]
codexs switch <provider>
codexs remove <provider> --force
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
~/.codex-switch/
  codex-switch.json
  providers.json
  backups/
```

Target Codex directory:

```text
~/.codex/
  config.toml
  auth.json
```

Environment variables:

- `CODEXS_HOME` overrides the `codex-switch` tool home.
- `CODEXS_CODEX_DIR` provides the default target Codex directory when `--codex-dir` is not passed.
- In development, `NODE_ENV=development` defaults to `./dev-codex/local-sandbox` when no override is set.

## Migration And Adoption

Use `migrate` only when you already have Codex runtime config that should be adopted into managed `providers.json` state. It is not the default fresh-install command.

```bash
codexs migrate
codexs migrate --overwrite --codex-dir ~/.codex
```

The development-version policy applies to `0.2.1`: old local experimental state is not automatically migrated. Clean up or re-add providers manually when moving from an older local experiment.

## Current Non-Goals

`0.2.1` does not implement or reserve runtime code paths for:

- GitHub Copilot SDK integration.
- GitHub device-flow login.
- `login copilot`.
- `add --copilot`.
- HTTP proxy bridge or local bridge worker commands.
- Background runtime services, bridge logs, or bridge runtime state.
- Built-in third-party router packaging.
- Account systems or cloud sync.
- Automatic migration of old Copilot or bridge state.

A future release may integrate a third-party router-like capability, but `0.2.1` makes no workflow, schema, or runtime guarantee for that.

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

- [PRD 0.2.1](./docs/PRD/codex-switch-prd-v0.2.1.md)
- [Design 0.2.1](./docs/Design/codex-switch-v0.2.1-design.md)
- [CLI usage](./docs/cli-usage.md)

Historical documents remain under `docs/PRD/` and `docs/Design/` for context only.
