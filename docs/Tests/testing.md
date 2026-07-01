# codex-switch Testing Guide

This guide records the current `0.1.x` verification contract for release and review work.

The current repository line is `0.1.5` and remains an unreleased development line until an explicit release task says otherwise.

## Required checks

Run these commands before publishing or reviewing release changes:

```bash
npm run build
npm test
npx tsc --noEmit
npm pack --dry-run
node dist/cli.js --help
node dist/cli.js --version
```

## Release scenarios

- Fresh direct-provider flow: `init -> add -> switch -> status -> doctor`
- Fresh Copilot flow: `init -> login copilot -> add --copilot -> switch -> status -> doctor`
- Ambiguous active profile: `list`, `status`, and provider pickers must surface ambiguity instead of inventing a unique current provider
- `--json` envelope: top-level `ok`, `command`, `data`, `warnings`, and `error` must remain stable
- `migrate`: advanced adopt helper only
- `setup`: deprecated entry only
- Release hygiene: `package.json`, `package-lock.json`, current-line docs, changelog top entry, and current PRD/Design fact sources must agree on the `0.1.5` development line

## Fixture guidance

- Prefer isolated temp directories for mutating tests.
- Keep fixtures small and realistic.
- Use `dev-codex/local-sandbox` only when a test needs a representative Codex directory layout.
