# codex-switch Technical Architecture

## Current Fact Sources

- [`cli-usage.md`](./cli-usage.md)
- [`PRD/codex-switch-prd-v0.1.0.md`](./PRD/codex-switch-prd-v0.1.0.md)
- [`PRD/codex-switch-prd-v0.1.1.md`](./PRD/codex-switch-prd-v0.1.1.md)
- [`PRD/codex-switch-prd-v0.1.2.md`](./PRD/codex-switch-prd-v0.1.2.md) (planned)
- [`Design/codex-switch-v0.1.0-design.md`](./Design/codex-switch-v0.1.0-design.md)
- [`Design/codex-switch-v0.1.1-design.md`](./Design/codex-switch-v0.1.1-design.md)
- [`Design/codex-switch-v0.1.2-design.md`](./Design/codex-switch-v0.1.2-design.md) (planned)

## Layers

```text
src/commands/     CLI command registry, parsing helpers, dispatch handlers
src/interaction/  TTY prompts and interactive input collection
src/app/          application use cases and mutation orchestration
src/domain/       provider/config/error contracts and pure planning logic
src/storage/      filesystem persistence for tool home and Codex runtime files
src/runtime/      external Codex and optional Copilot runtime adapters
src/cli/          output rendering and compatibility entry helpers
src/infra/        compatibility re-exports for older internal paths
```

Dependency direction should remain command/interaction -> app -> domain/storage/runtime. Domain code should not depend on CLI, storage, or runtime modules.

## State Model

Tool home stores managed state:

```text
codex-switch.json
providers.json
backups/
runtime/
runtimes/
```

Target Codex home stores runtime projection:

```text
config.toml
auth.json
```

`providers.json` is the managed provider source of truth. `config.toml` and `auth.json` are projections for the selected target Codex runtime.

## Switch Transaction

`switch` is the central write workflow:

1. Read provider registry.
2. Resolve the target provider and model.
3. For Copilot providers, verify SDK install, Node runtime, upstream auth, and bridge health.
4. Create a mutation backup.
5. Project `model`, `model_provider`, and `[model_providers.<id>]`.
6. Write `auth.json` with the Codex-facing bearer secret.
7. Roll back touched files if a mutation step fails.

Direct providers project their actual upstream API key as `OPENAI_API_KEY`. Copilot providers project only the local bridge bearer secret; GitHub/Copilot upstream tokens remain in the official Copilot runtime.

## Copilot Runtime

The Copilot path is implemented as an experimental local bridge:

- SDK runtime is installed under the managed `runtimes/copilot` directory.
- The managed installer defaults to `@github/copilot-sdk@1.0.2`.
- Copilot paths require Node.js `>=20`; direct providers continue to support Node.js `>=18`.
- Runtime validation separately rejects older or prerelease SDK installs, and SDK API shape is validated when creating the client or session.
- The bridge exposes a minimal OpenAI-compatible `/v1/chat/completions` and `/v1/responses` surface for simple text-oriented turns.
- The worker keeps one long-lived `CopilotClient`, creates one session per request, serializes requests, requires `abort()`, and treats `disconnect()` as best-effort cleanup rather than a compatibility gate.
- Responses streaming emits initial SSE events before upstream completion and uses heartbeat comments while waiting.

## Testing

Tests are plain Node specs run by `tests/run-tests.js`. The main verification commands are:

```bash
npm run build
npm test
npx tsc --noEmit
npm pack --dry-run
```
