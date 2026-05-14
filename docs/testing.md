# Testing Guide

`codex-switch` currently ships with five active test layers:

- `tests/commands.spec.js`: argument parsing, help rendering, and command dispatch contracts
- `tests/cli-e2e.spec.js`: built CLI entrypoint checks for user-visible command behavior and rendered output
- `tests/interaction.spec.js`: prompt boundary and interactive data collection behavior
- `tests/runtime.spec.js`: Codex runtime probing and version checks
- `tests/workflows.spec.js`: file-backed app workflow coverage for write operations and rollback paths

## Commands

Build the CLI:

```bash
npm run build
```

Run the full suite:

```bash
npm test
```

`npm test` is not compile-only. It runs:

```bash
npm run build
node tests/run-tests.js
```

Run one suite manually:

```bash
node -e "require('./tests/cli-e2e.spec').tests[0].run()"
node -e "require('./tests/workflows.spec').tests[0].run()"
```

## Development Fixture

The repository fixture lives at:

```text
dev-codex/local-sandbox/
```

It is used in two different ways:

- read-oriented CLI subprocess tests point at it directly
- write-oriented tests copy it into a temporary directory before running mutations

Do not point destructive automation directly at `dev-codex/local-sandbox` unless you intentionally want to update the fixture.

## Built CLI Coverage

`tests/cli-e2e.spec.js` executes the built CLI entrypoint logic from `dist/` and asserts the same JSON and human-readable payloads users see.

Covered entrypoint checks:

- `--help`
- `--version`

Covered read commands against the repository sandbox:

- `list --json`
- `show --json`
- `current --json`
- `status --json`
- `config show --json`
- `config list-profiles --json`
- `backups list --json`
- `doctor --json`

Covered write commands against temporary sandbox copies:

- `init --json`
- `add --json`
- `add --create-profile --json`
- `edit --json`
- `switch --json`
- `remove --force --json`
- `import --json`
- `export --force --json`
- `rollback --json`
- `setup --json`

Covered non-interactive failure contracts:

- `add` without an existing profile or `--create-profile`
- blocking destructive removal of the active provider profile
- `rollback <missing-id>`
- `migrate --overwrite --json`
- `setup --json`

This harness intentionally avoids `child_process` subprocess spawning because the current Windows sandbox used by automation blocks nested process launches with `EPERM`. The suite still validates the built CLI layer rather than calling app functions directly.

## Workflow Coverage

`tests/workflows.spec.js` keeps the deeper file-backed mutation coverage at the app/dispatch layer.

Important workflow scenarios already covered there include:

- non-interactive `init`
- non-interactive `migrate` failure behavior
- interactive `migrate` adoption via injected runtime
- `add`, `edit`, `remove`
- `switch` plus rollback
- `export` and `import`
- auth write rollback on failure

## Fixture Rules

- Prefer `--codex-dir <temp-copy>` for all write tests.
- Prefer `--json` when assertions need stable output.
- Treat `show --json` output as sensitive because it includes unmasked API keys.
- If a test needs `codex login` or `codex --version`, prefer mocking the spawn layer instead of assuming an installed local binary.
- Keep fixture assertions focused on stable data such as provider names, active profile, backup count, and typed error codes.

## Reporting Template

Use this template for release checks:

```text
Version under test: 0.0.x
Build: PASS/FAIL
Suite results:
- commands: PASS/FAIL
- cli-e2e: PASS/FAIL
- interaction: PASS/FAIL
- runtime: PASS/FAIL
- workflows: PASS/FAIL

Read command checks:
- help/version/list/show/current/status/config/backups/doctor

Mutation checks:
- init/add/edit/switch/remove/import/export/rollback/migrate/setup

Open risks:
- <risk 1>
- <risk 2>
```

## Current Gaps

Known areas that still deserve more coverage:

- true subprocess automation for interactive TTY-only flows such as prompt-driven `migrate`
- explicit tests for `rollback-latest`
- more backup corruption cases inside historical manifests
- docs and report snapshots should stay in sync with the current package version
