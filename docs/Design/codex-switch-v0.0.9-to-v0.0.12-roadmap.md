# codex-switch `0.0.9 -> 0.0.12` Roadmap

## Document Info

- Document type: roadmap / execution plan
- Current implementation baseline: `0.0.8`
- Planned versions: `0.0.9`, `0.0.10`, `0.0.11`, `0.0.12`
- Release gate after roadmap: `0.1.0`
- Scope: stabilize the current CLI through four focused pre-`0.1.0` versions
- Related PRD: [`../PRD/codex-switch-prd-v0.0.5-to-v0.1.0.md`](../PRD/codex-switch-prd-v0.0.5-to-v0.1.0.md)
- Related design baseline: [`./codex-switch-v0.0.8-design.md`](./codex-switch-v0.0.8-design.md)

## 1. Goal

This roadmap turns the current `0.0.8` baseline into a concrete version-by-version plan instead of a single abstract jump to `0.1.0`.

The intent is:

- `0.0.9` solves the remaining runtime-backed provider uncertainty
- `0.0.10` makes diagnosis and recovery dependable
- `0.0.11` freezes public contracts
- `0.0.12` prepares the codebase and docs for a stable release decision

`0.1.0` is not treated as the next automatic version. It is the release gate reached only after the `0.0.9 -> 0.0.12` line has proven stable.

## 2. Planning Principles

Across `0.0.9` to `0.0.12`, the project should prefer:

- stabilizing existing behavior over adding new command families
- making side effects explicit over hiding them behind convenience
- improving diagnosis and recovery before broadening abstractions
- containing runtime-backed complexity rather than generalizing too early
- deferring plugin-system work until there is more than one real runtime-backed path to support

This means the roadmap does not aim to deliver:

- a true plugin system
- a broad auth adapter platform
- a background daemon product
- a GUI / TUI track
- multiple unrelated runtime-backed provider families

## 3. Release Target Semantics

By the end of this roadmap, the project should be able to justify `0.1.0` with confidence that:

- the command surface is stable for humans and automation
- the top-level `--json` envelope is effectively frozen
- `providers.json`, `config.toml`, `auth.json`, backups, and runtime state have clear boundaries
- direct providers remain stable
- the Copilot runtime-backed path is understandable, diagnosable, and recoverable
- docs reflect actual shipped behavior

## 4. Version Plan

## 4.1 `0.0.9`: Runtime-Backed Provider Stabilization

### Objective

Make the Copilot runtime-backed provider path operationally safe, explainable, and testable.

### Why `0.0.9` comes first

`0.0.8` introduced the first optional runtime install and local bridge lifecycle. That is the largest behavior change in the current line. If this remains fuzzy, later contract and documentation work will sit on an unstable foundation.

### Main tasks

- Confirm the exact user-visible Copilot lifecycle:
  - detect runtime-backed provider
  - probe optional SDK install state
  - fail clearly when SDK is missing
  - install only when explicitly allowed by the command path
  - verify upstream Copilot auth state
  - start or reuse bridge
  - healthcheck bridge
  - only then mutate managed Codex files
- Tighten runtime error semantics:
  - `COPILOT_SDK_MISSING`
  - `COPILOT_SDK_INSTALL_FAILED`
  - `COPILOT_SDK_UNSUPPORTED`
  - `COPILOT_AUTH_REQUIRED`
  - `BRIDGE_PORT_CONFLICT`
  - `BRIDGE_START_FAILED`
  - `BRIDGE_HEALTHCHECK_FAILED`
- Improve first-use CLI messaging:
  - explain that the runtime is optional
  - explain that installation is lazy and local
  - explain where the runtime is installed
  - explain whether failure is repairable by reinstall or upstream login
- Make runtime state handling explicit:
  - what is persisted
  - what is best-effort only
  - how stale bridge state is treated
  - when old runtime state is ignored, reused, or cleared
- Ensure direct providers never pass through Copilot-specific runtime checks

### Testing tasks

- Add runtime installation probe coverage
- Add non-interactive failure-path coverage for missing SDK
- Add bridge reuse vs fresh-start coverage
- Add stale runtime-state coverage
- Add rollback-path coverage when bridge start succeeds but file mutation fails
- Re-run direct-provider regression coverage

### Documentation tasks

- Update README runtime-backed provider notes
- Update `docs/cli-usage.md` for Copilot-related command semantics
- Document runtime install location and runtime state file purpose

### Exit criteria

`0.0.9` is complete when:

- Copilot runtime-backed usage has a predictable first-use flow
- runtime failures map to actionable error messages
- lazy install behavior is understandable from both CLI output and docs
- direct-provider behavior still passes regression coverage

## 4.2 `0.0.10`: Recovery and Diagnostics Hardening

### Objective

Make local-state diagnosis, rollback expectations, and runtime visibility strong enough that the CLI feels safe to operate.

### Why `0.0.10` comes next

Once runtime-backed behavior is stable, the next risk is supportability. Users need to know what is broken, where it is broken, and what they can safely do next.

### Main tasks

- Improve `doctor` so it explains cross-file inconsistencies clearly:
  - provider missing from registry
  - linked profile missing from `config.toml`
  - `base_url` mismatch
  - `env_key` mismatch
  - `auth.json` key/value mismatch with active provider
  - runtime-backed provider configured but runtime unavailable
  - stale or invalid bridge state
- Review `status` so it can answer:
  - which provider is active
  - whether config projection is consistent
  - whether auth mirror state is consistent
  - whether runtime-backed dependencies are healthy
- Review write commands for transaction and rollback integrity:
  - `setup`
  - `add`
  - `edit`
  - `switch`
  - `remove`
  - `import`
  - `rollback`
- Re-check lock, backup, and rollback boundaries now that runtime side effects exist
- Strengthen rollback UX:
  - clearer backup listing
  - clearer latest-backup recovery path
  - clearer missing/corrupt-backup failure output
- Decide whether a narrow repair-oriented helper is needed before `0.1.0`
  - if yes, keep it minimal
  - if not, ensure `doctor` provides precise next actions

### Testing tasks

- Add malformed runtime-state coverage
- Add backup corruption and partial-history edge cases
- Add `rollback latest` coverage if that path is intended to be stable
- Add cross-file inconsistency fixtures for `doctor`

### Documentation tasks

- Expand troubleshooting guidance
- Document how backups relate to runtime state
- Explain what managed rollback does and does not cover

### Exit criteria

`0.0.10` is complete when:

- common failure states can be diagnosed from CLI output
- rollback remains trustworthy for managed files
- runtime-specific side effects are clearly separated from file rollback guarantees

## 4.3 `0.0.11`: Public Contract Freeze

### Objective

Lock the external behavior expected by human users, scripts, and future AI callers.

### Why `0.0.11` follows recovery work

Contract freeze should happen after the runtime path and repair path have already settled. Freezing too early just causes repeated exceptions and compatibility noise.

### Main tasks

- Review command behavior for stability:
  - `list`
  - `show`
  - `current`
  - `status`
  - `doctor`
  - `setup`
  - `add`
  - `edit`
  - `switch`
  - `remove`
  - `import`
  - `export`
  - `backups`
  - `rollback`
- Freeze the top-level JSON envelope:
  - `ok`
  - `command`
  - `data`
  - `warnings`
  - `error`
- Review command-specific `data` payloads and identify fields that should now be considered stable
- Audit non-interactive behavior:
  - `--json` must not prompt
  - non-TTY mode must not prompt
  - commands requiring additional input must fail explicitly
- Audit TTY-only behavior:
  - prompt cancel semantics
  - destructive confirmation semantics
  - wording alignment with current managed model
- Tighten help text and examples so docs and behavior match exactly

### Specific contract areas to verify

- `setup` adoption rules must align with provider/config/auth separation
- `switch` success must mean both `config.toml` and `auth.json` are correct
- `import --merge` must not leave linked profile state drifting
- `edit` must enforce the stable managed provider field set
- `status` and `doctor` must expose enough detail without future top-level shape changes

### Testing tasks

- Add JSON snapshot-style assertions where useful
- Add more non-interactive validation coverage
- Add `status` / `doctor` coverage for both direct and runtime-backed providers
- Verify help rendering after wording cleanup

### Documentation tasks

- Refresh command reference docs against actual behavior
- Document which output fields are stable vs descriptive
- Clarify interactive convenience vs automation contract

### Exit criteria

`0.0.11` is complete when:

- command behavior is stable enough to treat as a release contract
- JSON output no longer needs structural changes for known near-term needs
- prompt and non-prompt paths behave consistently across commands

## 4.4 `0.0.12`: Architecture Cleanup and Release Readiness

### Objective

Make the codebase, tests, and shipped materials clean enough that the project can either release `0.1.0` directly after `0.0.12` or justify one more pre-release step with clear reasons.

### Why `0.0.12` is the last pre-`0.1.0` planned version

By this point, runtime behavior, recovery behavior, and public contracts should already be settled. The final pre-release version should focus on maintainability, packaging clarity, and release discipline.

### Main tasks

- Review `src/cli.ts` and command wiring for continued responsibility leakage
- Refine the intended boundaries:
  - command surface
  - interaction layer
  - application use cases
  - domain policies
  - storage repositories
  - runtime integrations
- Reduce hidden coupling between:
  - CLI parsing and business rules
  - prompts and mutation orchestration
  - runtime integration logic and provider storage rules
- Standardize runtime integration entry points and helper naming
- Check exported types and JSDoc coverage for modules that now define stable contracts
- Prune compatibility logic that no longer serves the current release line
- Perform a full documentation pass:
  - README
  - CLI usage
  - testing guide
  - design docs
  - changelog / release notes
- Resolve version-document naming confusion where practical
- Audit package publishing surface:
  - included files
  - help/version output
  - install instructions
  - Node version assumptions
- Define the final `0.0.12 -> 0.1.0` release checklist

### Testing and maintenance tasks

- Keep tests aligned with module boundaries, not only end-to-end scenarios
- Ensure fixture usage stays understandable and isolated
- Update `docs/testing.md` if test-layer responsibilities changed
- Run release verification against:
  - fresh Codex directory
  - existing valid managed directory
  - partially broken directory
  - runtime-backed provider directory
  - non-interactive automation usage

### Suggested checklist

- `npm run build`
- `npm test`
- built CLI `--help`
- built CLI `--version`
- read commands in JSON mode
- write commands in temp sandbox
- runtime-backed provider health scenarios
- docs updated for actual shipped behavior
- changelog updated

### Exit criteria

`0.0.12` is complete when:

- code structure matches the intended architecture closely enough
- new fixes no longer require repeatedly editing oversized entrypoint logic
- runtime integration feels like an explicit capability domain
- the package presents itself consistently as a near-release build
- the shipped docs match actual behavior
- there is a repeatable release check ready for the `0.1.0` decision

## 5. `0.1.0` Release Gate

Release `0.1.0` only if, after `0.0.12`, all of the following are true:

- direct providers are stable and regression-covered
- Copilot runtime-backed provider behavior is documented and operationally understandable
- managed file boundaries are explicit and reflected in docs and diagnostics
- write commands remain protected by lock, backup, and rollback semantics
- `--json` envelope and major command outputs are stable
- release docs, changelog, and test guide match the shipped package

If one or more of these remain weak, continue with `0.0.13+` instead of forcing the minor-version bump.

## 6. Explicitly Deferred Until After `0.1.0`

The following items should stay out of this roadmap unless a hard dependency forces them in:

- general plugin system
- extension marketplace semantics
- broad auth adapter platform
- daemonized background bridge supervision
- GUI / TUI product tracks
- turning `config.toml` support into a general-purpose editor
- multiple new runtime-backed provider families with divergent behavior

These are valid future directions, but they should not dilute the current release goal.

## 7. Main Risks

### Risk 1: Runtime complexity leaks into the whole CLI

If Copilot runtime handling is not kept contained, command behavior and diagnostics will become harder to reason about across all providers.

Mitigation:

- keep runtime-backed logic behind explicit runtime checks
- preserve direct-provider fast paths
- maintain separate tests for direct and runtime-backed scenarios

### Risk 2: Lazy install feels hidden or surprising

Users usually react more strongly to unexplained installation side effects than to the installation itself.

Mitigation:

- make first-use messaging explicit
- document install location and repair path
- expose runtime state in `status` and `doctor`

### Risk 3: The `0.1.0` goal expands into platform work

The project can drift from “stabilize a CLI” into “design a plugin platform” if future-looking abstractions are introduced too early.

Mitigation:

- keep runtime semantics narrow
- defer true plugin work
- only add abstractions justified by current behavior

### Risk 4: Docs and version files drift from implementation

The repository already has several versioned design and PRD documents. Without a cleanup pass, release messaging can remain confusing.

Mitigation:

- reserve explicit doc-alignment time in `0.0.12`
- tie roadmap progress to implementation reality, not just historical filenames

## 8. Suggested Immediate Next Steps

From the current repository state, the practical next order is:

1. Finish the remaining `0.0.9` runtime stabilization items.
2. Expand `status` and `doctor` for runtime-backed visibility in `0.0.10`.
3. Add missing runtime and recovery test cases before `0.0.11`.
4. Freeze command/output semantics in `0.0.11`.
5. Do one architecture and documentation cleanup pass in `0.0.12`.
6. Decide `0.1.0` only after the `0.0.12` release checklist passes.

This keeps the release line focused and avoids premature abstraction.
