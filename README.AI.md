# README.AI

This file is the current AI-facing fact sheet for `@minniexcode/codex-switch`.

Current repository version: `0.2.1`

Current fact sources:

- `docs/PRD/codex-switch-prd-v0.2.1.md`
- `docs/Design/codex-switch-v0.2.1-design.md`
- `docs/cli-usage.md`

## Product Positioning

`codex-switch` is a local-first provider/model-provider management CLI for Codex. It manages local provider records, projects Codex `model_provider` sections, writes the active top-level `model` / `model_provider` route, and maintains backups around mutating commands.

Do not describe the current product as a direct-vs-Copilot dual path. In `0.2.1`, there is only the provider-management workflow for OpenAI-compatible provider endpoints.

## Primary Workflow

```bash
codexs init
codexs add <provider> --profile <model-provider-id> --model <model> --api-key <key> [--base-url <url>]
codexs switch <provider>
codexs status
codexs doctor
```

`--profile` means managed `model_provider` id alias. It is not the legacy Codex top-level `profile` selector.

## Current Command Surface

Document only these current commands:

```text
init
migrate
list
show
current
status
config show
config list-profiles
add
edit
switch
remove
import
export
backups list
rollback
doctor
setup
```

`setup` is deprecated and only points callers to `init` or `migrate`.

## State Model

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

Managed projection for current Codex versions is route-first:

- top-level `model`
- top-level `model_provider`
- matching `[model_providers.<id>]`
- API-key auth projection in `auth.json`

Do not present top-level `profile` or `[profiles.*]` as the current managed runtime path. They may be inspected for adoption or legacy diagnostics only.

## Current Non-Goals

`0.2.1` does not include:

- Copilot SDK integration.
- GitHub device-flow login.
- `login copilot`.
- `add --copilot`.
- `bridge start`, `bridge status`, or `bridge stop`.
- HTTP proxy bridge or local bridge worker runtime.
- `runtime/` or `runtimes/` managed service directories.
- Bridge logs or bridge runtime state.
- Built-in third-party router packaging.
- Automatic migration of old Copilot or bridge state.

A future release may integrate a third-party router-like capability. Do not write current commands, schema, or runtime paths for that in `0.2.1` docs or code.

## Development-Version Policy

Treat `0.2.1` as development-version software unless the user explicitly declares a real release. Do not add automatic migration shims, dual-read/dual-write behavior, or compatibility preservation for old experimental local state unless asked in the current task.

## Verification Commands

```bash
npx tsc --noEmit
npm test
node dist/cli.js --help
node dist/cli.js --version
npm pack --dry-run
```
