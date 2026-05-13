# Test Report: 0.0.5

Date: 2026-05-13

## Environment

- Platform: Windows (`win32`)
- Node.js: `v24.11.1`
- npm: `11.13.0`
- Workspace: `C:\Users\A200477427\Developers\Github\codex-switch`

## Commands Run

```bash
npm run build
npm test
```

## Overall Result

- Build: PASS
- Test suites: 5/5 PASS

Suite results:

- `domain`: PASS
- `app`: PASS
- `cli`: PASS
- `dev-sandbox`: PASS
- `e2e`: PASS

## Coverage Added In This Pass

New test assets:

- `tests/dev-sandbox.spec.js`
- `tests/e2e.spec.js`
- `docs/testing.md`

Updated wiring:

- `tests/helpers.js`
- `tests/run-tests.js`

## Detailed Results

### 1. Domain Suite

Status: PASS

Focus:

- config patch planning
- managed profile view generation
- provider normalization and masking
- runtime drift helpers
- backup list helpers

### 2. App Suite

Status: PASS

Focus:

- list/current/status
- add/edit/show/remove
- import/export
- switch/login/rollback
- setup
- doctor
- lock conflict and rollback behavior

### 3. CLI Suite

Status: PASS

Focus:

- arg parsing
- help rendering
- JSON success/failure envelopes
- interactive add/edit/remove/import/export/rollback/setup flows
- config commands

### 4. Dev Sandbox Suite

Status: PASS

Fixture:

- `dev-codex/local-sandbox`

Validated with the built CLI as a real subprocess:

- `list --json`
- `current --json`
- `status --json`
- `config show --json`
- `backups list --json`
- `doctor --json`

Observed state during test:

- active profile: `packycode`
- managed providers: `freemodel`, `packycode`
- status issues: `0`
- backups found: `>= 1`

### 5. End-to-End Suite

Status: PASS

Fixture strategy:

- copy `dev-codex/local-sandbox` into a temp directory
- run write commands against the temp copy
- keep the repository fixture unchanged

Validated flows:

- `switch freemodel` updates active profile and refreshes `auth.json`
- `rollback` restores `config.toml` and `auth.json`
- `add` creates a provider in `providers.json`
- `edit` updates note and tags
- `remove --force` deletes a non-active provider
- `add --create-profile` creates a managed profile section in `config.toml`
- destructive removal of the active provider fails with `PROFILE_IN_USE`
- `import --merge` replaces overlapping providers and keeps merged state valid
- `export` writes a valid providers file
- `backups list` skips corrupt backup folders with warnings
- `rollback missing-backup` fails with `BACKUP_NOT_FOUND`
- corrupt `backups/latest.json` fails with `ROLLBACK_FAILED`
- `setup` adopt flow works through CLI dispatch with mocked Codex CLI availability

Validated mixed workflows:

- `add -> switch -> edit -> show -> config show -> export -> rollback`
- `import --merge -> switch --no-login -> remove -> doctor -> backups list -> rollback <backup-id>`

## Release Confidence

Current confidence for `0.0.5`: medium-high.

Why:

- core read and write workflows now have automated coverage
- the development fixture is exercised directly by the built CLI
- backup/rollback behavior is covered by both existing and new tests

## Residual Risks

- `setup` is not yet covered as a true subprocess end-to-end command because it depends on interactive adopt input and external `codex` availability
- `rollback-latest` still has no direct dedicated test case even though `rollback` coverage is strong
- `README.md` still shows version `0.0.4` in the documentation text and should be updated separately

## Recommended Pre-Release Checklist

Before the next publish:

- run `npm test`
- run a manual smoke check of `node dist/cli.js --help`
- run one real local `switch --no-login` against a temp `--codex-dir`
- update user-facing docs if the package version changes
