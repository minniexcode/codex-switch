# Testing

Current version: `0.3.1`

The test suite is plain Node.js. `npm test` rebuilds the CLI and runs `tests/run-tests.js`, which discovers `tests/*.spec.js` files. Each spec exports `{ name, tests: [{ name, run() }] }`; a spec whose tests throw is reported and the runner continues with the next one. A spec that throws while being loaded is reported the same way, and the run continues.

Every temporary directory is created through `makeTempDir()` in `tests/helpers.js`, which registers it for removal. `run-tests.js` calls `cleanupTempDirs()` after each suite and a `process.on("exit")` backstop covers the failure path, so a full run leaves nothing behind. Nothing calls `fs.rmSync` on a test directory directly.

## Commands

```bash
npm run build
npx tsc --noEmit
npm test
node dist/cli.js --help
node dist/cli.js --version
npm pack --dry-run
```

## Required Coverage

Focus on the dual-target contract and the `0.3.1` secret-handling guarantees:

- Version metadata is `0.3.1` in `package.json` and `package-lock.json`, and `codexs --version` prints it.
- Current docs point to `docs/PRD/codex-switch-prd-v0.3.1.md` and `docs/Design/codex-switch-v0.3.1-design.md`.
- Help exposes only current commands: `init`, `migrate`, `list`, `show`, `current`, `status`, `config show`, `config list-profiles`, `add`, `edit`, `switch`, `remove`, `import`, `export`, `backups list`, `rollback`, `doctor`, and deprecated `setup`.
- Fresh provider flow: `init -> add -> switch -> status -> doctor`.
- Base URL drift diagnostics.
- Ambiguous active provider mapping.
- `migrate` remains an advanced adopt helper.
- `setup` remains a deprecated pointer.
- JSON output uses the stable envelope.
- `show --claude` masks credential-shaped env values and omits `settings`; `--reveal` returns real values and includes `settings`.
- `--reveal` placed before the provider name still resolves that name as a positional.
- `list --claude` and `current --claude` expose no secret material.
- Error-detail redaction covers nested keys and key names other than `apikey`.
- `export` reports `containsSecrets` and warns when exported records hold plaintext keys.
- `writeTextFileAtomic` leaves the destination present and intact at rename time.
- `restoreManifest` rejects a restore path outside the allowed roots and leaves the named file untouched.
- On POSIX, a managed write lands at `0600` for files and `0700` for created directories.
- The suite runs green with no `dev-codex/` present; Codex fixtures are generated per test by `makeCodexFixture()`.
- The Claude provider workflow (`add`, `switch`, `list`, `current`, `show`, `remove`) runs end to end against a `CODEXS_CLAUDE_DIR` that is verified to sit inside a temporary directory.

Do not add tests for removed `0.2.1` runtime experiments such as Copilot SDK integration, GitHub login, `add --copilot`, or bridge commands.

## Known Gaps

- The POSIX permission assertions in `tests/secret-handling.spec.js` return early on Windows, so the `0600` / `0700` code path has no executable coverage on that platform. The `ubuntu-latest` leg of `.github/workflows/ci.yml` is the only place it runs.
