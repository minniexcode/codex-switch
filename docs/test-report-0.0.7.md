# Test Report: 0.0.7

Date: 2026-05-14

## Environment

- Platform: Windows (`win32`)
- Workspace: `C:\Users\A200477427\Developers\Github\codex-switch`
- Node.js: `v24.11.1`
- npm: `11.13.0`

## Scope

This report covers the current automated suite plus the new built-CLI entrypoint checks added in `tests/cli-e2e.spec.js`.

Chinese summary:

- `npm test` is not compile-only. It rebuilds `dist/` and then runs the full automated suite.
- `add` now has explicit built-CLI non-interactive regression coverage.
- `migrate` is verified in two ways: built CLI non-interactive failure contract, plus injected interactive workflow coverage.
- `setup` is verified as deprecated and must fail with `COMMAND_DEPRECATED`.

## Commands Run

```bash
npx tsc --noEmit
npm test
```

## Overall Result

- TypeScript check: PASS
- Build and suites: PASS
- Full suite total: `39 passed, 0 failed`

Suite results:

- `commands`: PASS (`10/10`)
- `cli-e2e`: PASS (`7/7`)
- `interaction`: PASS (`8/8`)
- `runtime`: PASS (`2/2`)
- `workflows`: PASS (`12/12`)

## Built CLI Command Matrix

Read commands covered through the built CLI entrypoint:

- `--help`
- `--version`
- `list --json`
- `show --json`
- `current --json`
- `status --json`
- `config show --json`
- `config list-profiles --json`
- `backups list --json`
- `doctor --json`

Write commands covered through the built CLI entrypoint on temp copies:

- `init --json`
- `add --json`
- `add --create-profile --json`
- `edit --json`
- `switch --json`
- `remove --force --json`
- `import --json`
- `export --force --json`
- `rollback --json`

Negative contract checks through the built CLI entrypoint:

- `add` against a missing profile without `--create-profile`
- removing the active provider profile
- `rollback <missing-id>`
- `migrate --overwrite --json`
- `setup --json`

## Key Findings

### 1. `npm test` behavior

`npm test` rebuilds the project first and then executes the JavaScript test harness in `tests/run-tests.js`. It is not a compile-only command.

### 2. `add`

Validated behaviors:

- succeeds non-interactively when all required flags are provided
- creates `providers.json` entries with derived `envKey`
- supports `--create-profile` to add missing profile and model provider sections
- fails with `PROFILE_NOT_FOUND` when targeting a missing profile without `--create-profile`

### 3. `migrate`

Validated behaviors:

- built CLI non-interactive path currently fails by design with `INVALID_ARGUMENT`
- error payload includes adoptable profile metadata and a suggestion to run in an interactive TTY
- interactive adopt flow remains covered in `tests/workflows.spec.js` through runtime injection

This means the current implementation does not support a full non-interactive `migrate` workflow yet. The new tests lock that behavior in as an explicit contract instead of silently leaving it unverified.

### 4. Repository sandbox observations

Observed from the checked-in `dev-codex/local-sandbox` fixture during this run:

- active profile: `freemodel`
- managed providers in `list --json`: `alpha`, `bestmodel`, `beta`, `freemodel`
- `doctor --json` returns `healthy: false` in this automation environment because runtime probing reports `CODEX_NOT_INSTALLED`
- the `doctor` issue is environmental, not a providers/config parse failure

## Residual Risks

- prompt-driven subprocess automation for true interactive `migrate` is still not covered end-to-end
- Windows sandbox restrictions currently block nested `child_process` launches with `EPERM`, so automated command checks run through the built CLI entrypoint in-process instead of spawning `node dist/cli.js`
- `rollback-latest` still lacks a dedicated direct test
- backup corruption coverage is still focused on selected cases rather than an exhaustive matrix
