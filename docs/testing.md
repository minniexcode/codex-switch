# Testing Guide

`codex-switch` now has four test layers:

- `tests/domain.spec.js`: pure domain/unit coverage
- `tests/app.spec.js`: file-backed application integration coverage
- `tests/cli.spec.js`: CLI dispatch and prompt simulation coverage
- `tests/dev-sandbox.spec.js`: real `node dist/cli.js` read-only smoke tests against `dev-codex/local-sandbox`
- `tests/e2e.spec.js`: write-command regression tests against temporary copies of `dev-codex/local-sandbox`

## Commands

Build the CLI:

```bash
npm run build
```

Run the full suite:

```bash
npm test
```

Run a single suite manually:

```bash
node -e "require('./tests/dev-sandbox.spec').run()"
node -e "require('./tests/e2e.spec').run()"
```

## Development Fixture

The repository fixture lives at:

```text
dev-codex/local-sandbox/
```

It is used in two different ways:

- read-only dispatcher tests point at it directly
- mutation tests copy it into a temporary directory before running writes

Do not point destructive automation directly at `dev-codex/local-sandbox` unless you intentionally want to update the fixture.

## Read-Only Smoke Tests

`tests/dev-sandbox.spec.js` verifies the built CLI against the real development fixture.

Covered commands:

- `list --json`
- `current --json`
- `status --json`
- `config show --json`
- `backups list --json`
- `doctor --json`

These tests check two execution styles:

- development default resolution with `NODE_ENV=development`
- explicit `--codex-dir dev-codex/local-sandbox`

This is the fastest way to validate that `0.0.x` builds still read the repo sandbox correctly.

## Mutation Regression Tests

`tests/e2e.spec.js` uses `fs.cpSync()` to clone `dev-codex/local-sandbox` into a temp directory, then exercises the real CLI command dispatcher against the copy.

Covered write scenarios:

- `switch` with login and backup creation
- `rollback` restoring `config.toml` and `auth.json`
- `add`, `edit`, `remove`
- `add --create-profile`
- blocking destructive remove of the active profile provider
- `import --merge`
- `export`
- `backups list` with corrupt backup entries
- `rollback <missing-id>`
- corrupt `backups/latest.json`

It also includes mixed workflow scenarios where multiple commands operate on the same sandbox copy end-to-end, for example:

- `add -> switch -> edit -> show -> config show -> export -> rollback`
- `import --merge -> switch --no-login -> remove -> doctor -> backups list -> rollback <backup-id>`

The setup flow is covered with `executeCommand()` plus mocked Codex CLI checks because `setup` currently depends on external `codex --version` availability and interactive adopt input.

## Fixture Rules

- Prefer `--codex-dir <temp-copy>` for all write tests.
- Prefer `--json` when assertions need stable output.
- Treat `show --json` output as sensitive because it includes unmasked API keys.
- If a test needs `codex login` or `codex --version`, prefer mocking the spawn layer.
- Keep fixture assertions focused on stable data such as provider names, active profile, backup count, and typed error codes.

## Reporting Template

Use this template for release checks:

```text
Version under test: 0.0.x
Build: PASS/FAIL
Suite results:
- domain: PASS/FAIL
- app: PASS/FAIL
- cli: PASS/FAIL
- dev-sandbox: PASS/FAIL
- e2e: PASS/FAIL

Read-only smoke checks:
- list/current/status/config/backups/doctor

Mutation checks:
- switch/rollback/add/edit/remove/import/export/setup

Open risks:
- <risk 1>
- <risk 2>
```

## Current Gaps

Known areas that still deserve more coverage:

- true subprocess coverage for `setup`
- explicit tests for `rollback-latest`
- more backup corruption cases inside historical manifests
- README and release docs should stay in sync with the package version
