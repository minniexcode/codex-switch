# codex-switch

`@minniexcode/codex-switch` is a local-first CLI for managing and switching Codex and Claude Code provider routing.

It keeps `codex-switch` tool state separate from the target runtime directories, so managed providers, backups, and runtime projection are handled through explicit commands instead of manual file edits.

Current package version: `0.4.1`

`0.4.1` is the stateful-recovery release. It adds `codexs unlock [--force]` for a lock whose owner no longer exists, and `codexs backups prune [--keep N]` plus automatic retention for a backups directory that previously grew without bound. Same-second mutations no longer overwrite each other's backup, `doctor` reports an occupied or stale lock, and two flags that had never worked now do: `--create-profile` writes the legacy `[profiles.<id>]` section it always claimed to, and `--claude` on a command with no Claude path is refused instead of being ignored.

`0.4.0` is the foundation release. It parses `--claude`, `--force`, `--merge`, `--overwrite`, and `--create-profile` as real boolean flags, makes an unrecognized command exit `1` with a structured error instead of exiting `0` with help, reports the tool-home root in `status`, and moves the whole suite onto a single `runCli(argv, io)` entry ladder that runs on Windows and Linux against Node 20 and 22.

`0.3.x` added Claude Code provider switching via the `--claude` flag and the `0.3.1` secret-handling changes. The tool supports both Codex (OpenAI-compatible providers projected into `config.toml`/`auth.json`) and Claude Code (full `settings.json` profile switching).

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
codexs show --claude copilot
codexs show --claude copilot --reveal
```

What the workflow does:

- `add --claude` imports a complete Claude Code `settings.json` as a named profile into `claude-providers.json`.
- `switch --claude` atomically replaces `~/.claude/settings.json` with the stored profile.
- `current --claude` detects which registered profile matches the active settings.
- `list --claude` shows all Claude profiles with an active indicator.
- `show --claude` prints one profile with secret env values masked and the raw `settings` blob withheld.

Claude providers store the full `settings.json` content (env vars, model mappings, permissions, plugins) as an opaque blob. Switching replaces the entire file.

### Reading secrets back

`show --claude` masks any env value whose key looks like a credential (`*_TOKEN`, `*_API_KEY`,
`*_SECRET`, `*_PASSWORD`, `*_CREDENTIAL`, anything containing `auth`) in both the human and `--json`
output. Non-secret neighbours such as `ANTHROPIC_BASE_URL` print normally.

`--reveal` is a global flag that prints the real values and includes the `settings` blob. It is an
explicit escape hatch, so it is never applied by accident:

```bash
codexs show --claude copilot --reveal
```

Files this tool writes are created with owner-only permissions (`0600` for files, `0700` for
directories it creates) on **macOS and Linux**. On Windows the permission tightening is skipped —
NTFS has no group/other bits for `chmod` to set, so access there is decided by ACLs and this tool
does not touch them.

On macOS and Linux, files written before the upgrade keep their previous mode until the next write
touches them. To fix them all at once:

```bash
# macOS / Linux only — this is a no-op on Windows.
chmod -R go-rwx ~/.config/codex-switch ~/.codex/config.toml ~/.codex/auth.json ~/.claude/settings.json
```

## Commands

Current `0.4.1` command surface:

```text
codexs init
codexs migrate
codexs list [--claude]
codexs show <provider> [--claude] [--reveal]
codexs current [--claude]
codexs status
codexs config show
codexs config list-profiles
codexs add <provider> --profile <id> --model <model> --api-key <key> [--base-url <url>] [--create-profile]
codexs add --claude <name> --from-file <settings.json>
codexs edit <provider> [options] [--create-profile]
codexs switch <provider> [--claude]
codexs remove <provider> [--claude] --force
codexs import <file>
codexs export <file>
codexs backups list
codexs backups prune [--keep N]
codexs unlock [--force]
codexs rollback [backup-id]
codexs doctor
codexs setup
```

`setup` is deprecated and exists only as a pointer to `init` for fresh state or `migrate` for advanced adoption of existing Codex config.

All commands accept `--json` for the standard JSON envelope where supported by the parser, and `--codex-dir <path>` to target a specific Codex directory. `--codex-dir` requires a path: a following token that starts with `-` is refused rather than taken as the value.

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

`codex-switch` does not write legacy `[profiles.*]` sections for new managed providers by default. `--create-profile` is the explicit opt-in that also writes the matching `[profiles.<id>]` section for older Codex builds that route through it, and it removes legacy `env_key`/`env_key_instructions` fields from managed model-provider projections when it writes them.

Authentication is projected into the target Codex `auth.json` as API-key mode with `OPENAI_API_KEY`. Do not commit real keys or private provider exports.

## Managed State

Tool home:

```text
~/.config/codex-switch/
  codex-switch.json
  providers.json
  claude-providers.json
  backups/
  .codex-switch.lock
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

## Locks And Backup Retention

Every write command takes one lock, shared by both targets, and snapshots the files it touches into `backups/` first.

A process killed mid-write leaves that lock behind. `codexs unlock` clears it, but only after proving the recorded owner is gone — a live owner is refused, because taking a lock from a running process corrupts state where refusing only inconveniences:

```bash
codexs unlock
codexs unlock --force   # a recycled pid you know is not the original owner
```

There is no timeout-based takeover: a slow `migrate` can outlast any timer, so a pid that looks live is treated as live. `--force` is the deliberate override for the case where it is not.

Backups are retained to the newest 20 by default. Retention runs automatically after every successful mutation, and `backups prune` is the manual path:

```bash
codexs backups prune
codexs backups prune --keep 5
```

A directory that any surviving manifest still references is never deleted, so a rollback route stays intact even when the backup that created it is old. Directories whose manifest is missing or unreadable are reported rather than deleted. Codex and Claude operations share one `backups/` directory and one `latest.json`.

## Current Non-Goals

`0.4.1` does not implement or reserve runtime code paths for:

- GitHub Copilot SDK integration.
- GitHub device-flow login.
- HTTP proxy bridge or local bridge worker commands.
- Background runtime services, bridge logs, or bridge runtime state.
- Built-in third-party router packaging.
- Account systems or cloud sync.
- Claude Code plugin marketplace management.
- Generic "target" abstraction or pluggable provider type system.
- A TTL-based lock takeover. A slow `migrate` can exceed any timer, so a recycled pid is fail-closed and `codexs unlock --force` is the way out.
- An audit log for lock takeovers; the takeover reports through the existing result payload.
- An exit-code taxonomy. Success is `0` and failure is `1`; there is no `2` for usage errors and no code map.
- Deleting the dead code trees. `src/infra/` and the dead `src/cli/` shims are Phase 3 (`P2-1`).
- A change to `engines.node`. It still advertises `>=18` while the sole runtime dependency requires `>=20.12`, and CI does not test Node 18 — green CI must not be read as "the advertised floor is supported".

## Development

```bash
npm run build
npx tsc --noEmit
npm test          # in-process suite; silence means green
npm run test:e2e  # real child processes against sandboxed roots; prints passed/failed/skipped
node dist/cli.js --help
node dist/cli.js --version
npm pack --dry-run
```

`npm test` runs every `tests/*.spec.js` through one in-process harness and prints nothing when it passes. `npm run test:e2e` builds the CLI and drives the real binary as a child process, with `CODEXS_HOME`, `CODEXS_CODEX_DIR`, and `CODEXS_CLAUDE_DIR` all pointing inside a sandbox that the runner refuses to leave. It is a separate command and a separate CI step: it costs a process spawn per case, and it covers what the in-process suite structurally cannot — exit codes, real pipes, and environment isolation.

## Fact Sources

Current fact sources:

- [PRD 0.4.1](./docs/PRD/codex-switch-prd-v0.4.1.md)
- [Design 0.4.1](./docs/Design/codex-switch-v0.4.1-design.md)
- [PRD 0.4.0](./docs/PRD/codex-switch-prd-v0.4.0.md)
- [Design 0.4.0](./docs/Design/codex-switch-v0.4.0-design.md)
- [PRD 0.3.1](./docs/PRD/codex-switch-prd-v0.3.1.md)
- [Design 0.3.1](./docs/Design/codex-switch-v0.3.1-design.md)
- [PRD 0.3.0](./docs/PRD/codex-switch-prd-v0.3.0.md)
- [Design 0.3.0](./docs/Design/codex-switch-v0.3.0-design.md)
- [PRD 0.2.1](./docs/PRD/codex-switch-prd-v0.2.1.md)
- [Design 0.2.1](./docs/Design/codex-switch-v0.2.1-design.md)
- [CLI usage](./docs/cli-usage.md)

Historical documents remain under `docs/PRD/` and `docs/Design/` for context only.
