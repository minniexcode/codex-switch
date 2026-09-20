# Changelog

## 0.3.1 - 2026-09-20

Security patch release for the `0.3.0` dual-target line. No architecture change: the `--claude` path, both registries, and the command surface are unchanged.

### Added

- Global `--reveal` flag. `show --claude <name>` now masks credential-shaped env values by default; `--reveal` is the explicit opt-in that prints the real values and includes the raw `settings` blob.
- `export` reports `secretCount` and `containsSecrets`, and emits a warning when exported provider records contain API keys in plaintext.
- New `src/domain/secrets.ts` as the single source of truth for secret-key detection and masking; `maskSecret()` moved there from `src/domain/providers.ts`.
- `ROLLBACK_PATH_REJECTED` error code.
- `tests/secret-handling.spec.js` covering masking, `--reveal`, error-detail redaction, atomic writes, export warnings, and rollback containment.
- PRD v0.3.1 and Design v0.3.1 fact sources.

### Changed

- Managed files are written with owner-only permissions (`0600` for files, `0700` for directories the tool creates) on macOS and Linux. The `chmod` is skipped on Windows, where access is governed by NTFS ACLs and `chmod` only toggles the read-only bit.
- Error details are redacted by walking the whole detail tree against the shared secret-key pattern, instead of skipping only top-level keys containing `apikey`.
- `restoreManifest()` requires an `allowedRoots` argument, sourced from the caller rather than the backup manifest, so a tampered manifest cannot redirect a restore outside the managed roots.
- The `show --claude` payload gained `revealed`, and omits `settings` unless `--reveal` is passed.
- Human `show --claude` output notes when values were masked so `--reveal` is discoverable.

### Fixed

- `writeTextFileAtomic()` no longer deletes the destination before renaming. The previous `rm`-then-`rename` left a window where the destination did not exist; `rename` alone already replaces an existing file on both platforms.
- `auth.json` writes go through the atomic helper instead of a bare `fs.writeFileSync`, closing the last non-atomic write on the mutation path and bringing the file under the permission fix.

### Security

- `show --claude <name>` no longer returns live `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` values, in human or `--json` output.
- Codex `show --json` still returns the full `apiKey` by design; it is a documented automation contract and is unchanged in this release.
- On Windows, `chmod`-based permission tightening is inert. The exposure there is at the NTFS ACL layer and is documented as an operator action in `docs/codex-switch-2.x-roadmap.md` (P0-2).

## 0.3.0 - 2026-07-18

Claude Code provider switching release.

### Added

- Claude Code provider management via `--claude` flag on `add`, `switch`, `list`, `show`, `current`, `remove` commands.
- `codexs add --claude <name> --from-file <settings.json>` imports a Claude Code settings file as a named profile.
- `codexs switch --claude <name>` atomically replaces `~/.claude/settings.json` with the stored profile.
- `codexs current --claude` detects which registered profile matches the active Claude settings.
- `codexs list --claude` shows all Claude profiles with active detection.
- `codexs show --claude <name>` displays full Claude profile details including env vars.
- `codexs remove --claude <name>` removes a Claude profile from the registry.
- Separate `claude-providers.json` storage in tool home directory.
- `CODEXS_CLAUDE_DIR` environment variable to override the Claude Code directory.
- PRD v0.3.0 and Design v0.3.0 fact sources.

### Changed

- Package description updated to reflect dual-target (Codex + Claude Code) support.
- Help text for `add`, `switch`, `list`, `show`, `current`, `remove` updated with `--claude` usage.

## 0.2.2 - 2026-07-15

Version bump and command summary update.

## 0.2.1 - Unreleased

Provider-management-only consolidation release.

- Repositioned the current development line as a local-first Codex provider/model-provider management CLI.
- Removed current-facing Copilot login, `add --copilot`, bridge command, SDK, HTTP proxy bridge, and local bridge runtime contracts from docs and command presentation.
- Added `0.2.1` PRD and design fact sources.
- Updated release-contract coverage around the reduced provider-management command surface.
## 0.1.5 - 2026-07-01

Copilot Bridge process-visibility and redaction patch release.

### Changed

- Added stable Copilot bridge runtime events for assistant intent, message deltas, reasoning deltas, tool lifecycle, permission lifecycle, user-input requests, exit-plan-mode requests, and session status signals.
- Projected Copilot process/status events into Responses streaming commentary items and reasoning/progress updates into Responses reasoning summary events.
- Forwarded adapter runtime events through the bridge worker while keeping Chat Completions streaming text-only.
- Hardened unknown SDK event summaries with key-aware and value-aware redaction plus bounded truncation.
- Added adapter-level regression coverage for raw SDK session event normalization.

## 0.1.4 - Unreleased

Bridge stability and observability release.

### Changed

- Reworked Copilot bridge reuse to retry transient health/auth probe failures before replacing an existing worker.
- Added persisted bridge runtime logging, restart reason tracking, and surfaced `logPath` metadata across bridge, switch, status, and doctor flows.
- Extended bridge runtime state and start results with persisted probe/restart metadata for diagnostics.
- Restored the interactive provider picker `current` hint for legacy top-level `profile` state when `model_provider` is absent or unresolved.
- Replaced the hard-coded test runner with deterministic `tests/*.spec.js` discovery and aligned the widened release gate with the current help, runtime, and workflow contracts.

## 0.1.3 - Unreleased

Copilot login hotfix release.

### Changed

- Replaced the legacy `CopilotClient` constructor fields with the official `RuntimeConnection.forStdio({ path })` SDK connection path.
- Resolved the managed SDK runtime against `@github/copilot/npm-loader.js` instead of relying on implicit bundled package lookup.
- Kept human `copilot --help` and `copilot login` invocations on the bundled `.bin` shim while separating SDK runtime resolution from terminal CLI resolution.
- Added a focused `0.1.3` regression spec covering the Copilot login compatibility fix.

## 0.1.2 - Unreleased

Copilot runtime repair release.

### Changed

- Pinned the managed Copilot runtime installer to `@github/copilot-sdk@1.0.2` instead of installing `latest`.
- Added a Copilot-only Node.js runtime gate. Direct providers still support Node.js `>=18`; Copilot runtime paths require Node.js `>=20`.
- Reworked SDK loading to resolve `@github/copilot-sdk` from the managed runtime install directory via `createRequire()`.
- Replaced session-based auth probing with `CopilotClient.getAuthStatus()`.
- Added explicit Copilot runtime errors for unsupported Node runtime, SDK version, SDK API shape, and bridge upstream timeout.
- Reworked the bridge worker to keep one long-lived Copilot client, create one session per request, disconnect sessions after use, and serialize requests.
- Updated Responses streaming to emit initial SSE events before the upstream request completes and to keep the connection alive with heartbeat comments.
- Added Copilot config projection for `stream_idle_timeout_ms = 300000`.

### Documentation

- Added `0.1.2` PRD and design docs describing the experimental Copilot bridge boundary.
- Removed obsolete `0.0.x` transition docs and old test reports from the active docs tree.

## 0.1.1 - 2026-05-28

Documentation and fact-source completion release.

### Changed

- Added missing `0.1.1` PRD/design fact sources.
- Aligned README, CLI usage, product overview, architecture notes, and AI-facing README around the stable `0.1.x` route model.
- Clarified that `profile` is a managed alias for the Codex `model_provider` route id.

## 0.1.0 - 2026-05-28

First stable documentation baseline.

### Added

- Stable command-surface summary for direct provider and Copilot provider workflows.
- Stable JSON envelope contract for automation.
- Stable split-state model: tool home for managed state, target Codex home for runtime projection.

### Notes

- `migrate` remains an advanced adopt helper.
- `setup` remains a deprecated compatibility entry.
- Development-version policy remains in effect: no automatic migration shims or backward-compatibility preservation logic unless explicitly requested.

