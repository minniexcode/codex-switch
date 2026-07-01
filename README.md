# @minniexcode/codex-switch

`@minniexcode/codex-switch` is a local-first CLI for managing and switching Codex provider and model-provider routing safely.

It keeps `codex-switch` tool state separate from the target Codex runtime, so provider management, backup flow, and runtime projection stay explicit instead of relying on manual file edits.

Chinese version: [README.CN.md](./README.CN.md)

## Version

Current package version: `0.1.5`

This is the current repository development line. `0.1.5` is a Copilot Bridge process-visibility patch, focused on streaming commentary/reasoning signals, defensive SDK-event normalization, and safer redaction for unknown runtime events while keeping the provider surface unchanged.

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
codexs add my-provider --profile my-provider --model gpt-5.5 --base-url https://gateway.example.com/v1 --api-key sk-xxx
codexs switch my-provider
codexs status
codexs doctor
```

GitHub Copilot workflow:

```bash
codexs init
codexs login copilot
codexs add copilot-main --copilot --profile copilot-main --model gpt-4.1
codexs switch copilot-main
codexs status
codexs doctor
```

Notes:

- `init` prepares the `codex-switch` tool home and managed state.
- `login copilot` handles upstream Copilot onboarding and auth readiness.
- `add --copilot` does not perform login for you; it assumes Copilot login is already ready.
- For non-interactive use, pass `--profile` explicitly. In TTY mode, `add` and `edit` can prompt for missing required fields.
- Copilot support is an experimental local bridge. The managed installer defaults to `@github/copilot-sdk@1.0.2`, Copilot runtime paths require Node.js `>=20`, and runtime checks separately reject older or prerelease SDK installs while validating API shape when the client or session is used.
- `switch` projects the selected provider into the target Codex runtime as top-level `model` plus `model_provider`.
- `status` is the main read command after switching.
- `doctor` is the main repair-oriented diagnostic command.

## Runtime Routing Model

For Codex `0.134.0+`, the active runtime route is selected through top-level `model` and `model_provider` in `config.toml`.

`codex-switch` treats that route as the runtime contract:

- top-level `model` selects the active model id
- top-level `model_provider` selects the active provider route
- managed `[model_providers.<id>]` entries are the projected runtime provider definitions
- `--profile` is only an alias for the managed `model_provider` id, not the primary runtime selector

Direct-provider projection writes:

- top-level `model`
- top-level `model_provider`
- `[model_providers.<id>]`
- `auth.json` with `OPENAI_API_KEY`

Managed direct-provider projection does not keep `env_key` or `env_key_instructions` in the generated runtime config. `switch`, `add`, and `edit` clean old legacy projection fields before writing the active route.

For managed OpenAI-compatible routes, the projected provider entry keeps the fixed runtime shape:

```toml
model = "gpt-5.5"
model_provider = "my-provider"

[model_providers.my-provider]
name = "my-provider"
base_url = "https://gateway.example.com/v1"
wire_api = "responses"
requires_openai_auth = true
```

Managed Copilot projection additionally writes:

```toml
stream_idle_timeout_ms = 300000
```

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
codexs add <provider> --profile <model-provider-id> --model <model> --api-key <key> [--base-url <url>]
codexs add <provider> --copilot --profile <model-provider-id> --model <model>
codexs edit <provider>
codexs switch <provider>
codexs remove <provider> [--force] [--switch-to <provider>]
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
- `migrate` remains interactive when provider adoption requires human input.
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
- [PRD 0.1.0](./docs/PRD/codex-switch-prd-v0.1.0.md)
- [PRD 0.1.1](./docs/PRD/codex-switch-prd-v0.1.1.md)
- [PRD 0.1.2](./docs/PRD/codex-switch-prd-v0.1.2.md)
- [PRD 0.1.3](./docs/PRD/codex-switch-prd-v0.1.3.md)
- [PRD 0.1.5](./docs/PRD/codex-switch-prd-v0.1.5.md)
- [Design 0.1.2](./docs/Design/codex-switch-v0.1.2-design.md)
- [Design 0.1.3](./docs/Design/codex-switch-v0.1.3-design.md)
- [Design 0.1.5](./docs/Design/codex-switch-v0.1.5-design.md)

## License

MIT
