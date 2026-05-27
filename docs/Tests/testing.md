# codex-switch Testing Guide

This guide records the release gate for `0.1.0`.

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

## Fixture guidance

- Prefer isolated temp directories for mutating tests.
- Keep fixtures small and realistic.
- Use `dev-codex/local-sandbox` only when a test needs a representative Codex directory layout.
