# Testing

Current version: `0.3.1`

The test suite is plain Node.js. `npm test` rebuilds the CLI and runs `tests/run-tests.js`, which discovers `tests/*.spec.js` files. Each spec exports `{ name, tests: [{ name, run() }] }`; a spec whose tests throw is reported and the runner continues with the next one.

## Commands

```bash
npm run build
npx tsc --noEmit
npm test
node dist/cli.js --help
node dist/cli.js --version
npm pack --dry-run
```

## Required Coverage For 0.3.1

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

Do not add tests for removed `0.2.1` runtime experiments such as Copilot SDK integration, GitHub login, `add --copilot`, or bridge commands.

## Known Gaps

- `tests/provider-workflow.spec.js` cannot run on a fresh clone. Its three tests copy `dev-codex/local-sandbox`, which is gitignored and therefore absent, so they fail with `ENOENT` until the fixture is rebuilt programmatically. Tracked as roadmap P1-9 (Phase 2).
- The POSIX permission assertions in `tests/secret-handling.spec.js` return early on Windows, so the `0600` / `0700` code path has no executable coverage on that platform. It is exercised only on macOS and Linux.
