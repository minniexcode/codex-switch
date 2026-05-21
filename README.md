# @minniexcode/codex-switch

`@minniexcode/codex-switch` is a local-first CLI for managing and switching Codex provider and profile configuration safely.

It keeps `codex-switch` tool state separate from the target Codex runtime, so provider management, backup flow, and runtime projection stay explicit instead of relying on manual file edits.

Chinese version: [README.CN.md](./README.CN.md)

## Version

Current package version: `0.0.12`

This repository is still on a development-version line. The current release focuses on making the primary workflows, help text, and operational boundaries consistent with the implementation.

## Install

```bash
npm install -g @minniexcode/codex-switch
```

Run without a global install:

```bash
npx @minniexcode/codex-switch --help
```

Built CLI entrypoint:

```bash
codexs --help
```

## Primary Workflows

Direct provider workflow:

```bash
codexs init
codexs add my-provider --profile my-provider --api-key sk-xxx
codexs switch my-provider
codexs status
codexs doctor
```

GitHub Copilot workflow:

```bash
codexs init
codexs login copilot
codexs add copilot-main --copilot --profile copilot-main
codexs switch copilot-main
codexs status
codexs doctor
```

Notes:

- `init` prepares the `codex-switch` tool home and managed state.
- `login copilot` handles upstream Copilot onboarding and auth readiness.
- `add --copilot` does not perform login for you; it assumes Copilot login is already ready.
- `status` is the main read command after switching.
- `doctor` is the main repair-oriented diagnostic command.

## Advanced Adopt Workflow

Use `migrate` only when you already have Codex runtime state that should be adopted into managed `providers.json` state:

```bash
codexs init
codexs migrate
```

`migrate` is an advanced adopt helper. It is not the default first step for a fresh install.

## Command Surface

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
codexs remove <provider> [--force] [--switch-to <profile>]
codexs import <file>
codexs export <file> [--force]
codexs bridge start [provider]
codexs bridge status [provider]
codexs bridge stop [provider]
codexs backups list
codexs rollback [backup-id]
codexs doctor
```

`setup` still exists only as a deprecated compatibility entry that points callers to `init` or `migrate`.

## Runtime Model

`codex-switch` uses a dual-path model.

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

Key points:

- `providers.json` is the managed provider registry and lives under the tool home.
- `codex-switch.json` stores tool-level metadata such as `defaultCodexDir`.
- `config.toml` remains the active runtime routing file in the target Codex directory.
- `auth.json` remains the active auth projection file in the target Codex directory.
- Direct providers rewrite `OPENAI_API_KEY` into the active runtime projection.
- Copilot providers keep upstream GitHub authentication in the official Copilot runtime while `codex-switch` manages local bridge state and routing.

Path controls:

- `--codex-dir <path>` targets a specific Codex runtime directory.
- `CODEXS_CODEX_DIR` provides the default target runtime when `--codex-dir` is not passed.
- `CODEXS_HOME` overrides the tool home location.

## Automation Notes

This CLI supports both human TTY usage and non-interactive automation.

Global flags:

```bash
--json
--codex-dir <path>
--help
--version
```

Operational limits:

- `login copilot` requires a real TTY and does not support `--json`.
- `migrate` still depends on interactive profile selection and provider-detail collection in this release.
- Automation should pass explicit arguments and prefer `--json` for stable parsing.

## Local Development

```bash
npm run build
npm test
npx tsc --noEmit
node dist/cli.js --help
npm pack --dry-run
```

## Documentation

- [Chinese README](./README.CN.md)
- [AI README](./README.AI.md)
- [Detailed CLI Usage](./docs/cli-usage.md)
- [Testing Guide](./docs/Tests/testing.md)
- [Product Overview](./docs/codex-switch-product-overview.md)
- [PRD 0.0.12](./docs/PRD/codex-switch-prd-v0.0.12.md)
- [Release Gate PRD 0.1.0](./docs/PRD/codex-switch-prd-v0.1.0.md)

## License

MIT
