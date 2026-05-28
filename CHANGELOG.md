# Changelog

All notable changes to `@minniexcode/codex-switch` will be documented in this file.

## 0.1.1 - 2026-05-28

This release aligns the public release story and runtime-routing documentation with the current Codex `0.134.0+` contract.

本次版本把公开文档、发布叙事和当前 Codex `0.134.0+` 的运行态路由契约收口到同一套表述。

### Changed

- Documented top-level `model` plus `model_provider` as the active runtime route for managed providers.
- Clarified that `--profile` is only an alias for the managed `model_provider` id, not the primary runtime selector.
- Clarified that managed `[model_providers.*]` projection no longer writes `env_key` or `env_key_instructions`.
- Documented that `switch`, `add`, and `edit` clean legacy `env_key` and `env_key_instructions` fields before projecting the active route.
- Documented the fixed managed OpenAI-compatible projection fields `wire_api = "responses"` and `requires_openai_auth = true`.

### Docs

- Updated `README.md`, `README.CN.md`, and `README.AI.md` to version `0.1.1` and route-first runtime semantics.
- Updated `docs/cli-usage.md` for Codex `0.134.0+` behavior and managed runtime projection rules.
- Updated `docs/Reference/codex-config-reference.md` and `docs/Reference/codex-config-reference.zh-CN.md` to distinguish official Codex config capabilities from `codex-switch` managed projection choices.
- Updated historical long-form docs so current fact-source links point to the `0.1.1` PRD and design docs instead of the `0.1.0` release pair.

### Verification

- `npm run build`
- `npm test`
- `npx tsc --noEmit`

## 0.1.0 - 2026-05-26

This release is the first stable release line for codex-switch. It closes the release gate by aligning package metadata, public documentation, help text, and test coverage around the existing direct-provider, Copilot, and diagnostic workflows.

本次版本是 codex-switch 的第一条稳定发布线。它通过对齐包元数据、公开文档、help 文案和测试覆盖，把 direct provider、Copilot 与诊断工作流收口到同一套发布合同。

### Changed

- Bumped the package and lockfile version to `0.1.0`.
- Aligned README, CLI usage, product overview, and release docs to the stable release story.
- Tightened the command help and human-readable output so `list`, `status`, and `doctor` surface provider type, ambiguity, tool home, target runtime, and next-step guidance more clearly.

### Docs

- Added the release testing guide under `docs/Tests/testing.md`.
- Marked the long-lived command and architecture docs as historical references instead of current release contracts.

### Verification

- `npm run build`
- `npm test`
- `npx tsc --noEmit`
- `npm pack --dry-run`
- `node dist/cli.js --help`
- `node dist/cli.js --version`

## 0.0.12 - 2026-05-21

This release is a beta hardening release. It does not expand the top-level feature surface. It tightens the release narrative, help text, human-readable output, and verification contract around the existing direct-provider and Copilot workflows.

本次版本是 beta hardening release，不是继续扩 feature surface 的版本。重点是收口主工作流、帮助文案、人类输出语义和发布验证边界。

### Changed

- Changed the public narrative so the primary direct workflow is `init -> add -> switch -> status -> doctor`.
- Changed the Copilot workflow narrative so `login copilot` is the required onboarding step before `add --copilot` and `switch`.
- Changed top-level help, command help, and human-readable output to reflect the tool-home-first dual-path model.

### Docs

- Updated `README.md`, `README.CN.md`, `README.AI.md`, `docs/cli-usage.md`, `docs/codex-switch-product-overview.md`, and `docs/Tests/testing.md` for `0.0.12`.
- Added the `0.0.12` design document and aligned active documentation to the new PRD/design pair.
- Marked long-lived architecture/command design docs as historical references instead of current release contracts.

### Verification

- `npm run build`
- `npm test`
- `npx tsc --noEmit`
- `npm pack --dry-run`

## 0.0.11 - 2026-05-19

This release separates codex-switch tool state from the target Codex runtime, formalizes interactive upstream onboarding for GitHub Copilot, and freezes the expanded public command surface around config inspection and managed bridge operations.

本次版本正式把 codex-switch 的工具级管理态从目标 Codex runtime 中分离出来，引入独立的 GitHub Copilot 上游登录流程，并将 config 检视与受管 bridge 操作纳入公开命令面。

### Added

- Added `codexs login copilot` for interactive GitHub Copilot SDK installation and upstream auth readiness checks.
- Added `codexs bridge start`, `codexs bridge status`, and `codexs bridge stop` to manage the local Copilot bridge runtime explicitly.
- Added `codexs config show` and `codexs config list-profiles` for structured `config.toml` inspection with managed-state hints.

- 新增 `codexs login copilot`，用于交互式完成 GitHub Copilot SDK 安装和上游登录就绪检查。
- 新增 `codexs bridge start`、`codexs bridge status`、`codexs bridge stop`，显式管理本地 Copilot bridge runtime。
- 新增 `codexs config show` 与 `codexs config list-profiles`，提供带受管态提示的结构化 `config.toml` 检视能力。

### Changed

- Changed `init` to bootstrap the codex-switch tool home and registry files instead of treating the Codex runtime directory as the management root.
- Changed the storage model so `providers.json`, backups, runtime state, and optional runtimes live under the codex-switch tool home, while `config.toml` and `auth.json` remain in the target Codex directory.
- Changed `add --copilot` and `switch` to require Copilot SDK install and upstream login readiness to be handled through `codexs login copilot`, while keeping local bridge secrets and routing under managed provider state.
- Updated README, AI README, Chinese README, CLI usage, and release metadata to align with the 0.0.11 command and path contracts.

- 将 `init` 改为初始化 codex-switch 的 tool home 与 registry 文件，不再把 Codex runtime 目录当作管理根目录。
- 调整存储模型：`providers.json`、备份、runtime state 和可选 runtimes 存放在 codex-switch tool home 下，而 `config.toml` 与 `auth.json` 仍位于目标 Codex 目录。
- 调整 `add --copilot` 与 `switch` 的公开契约：Copilot SDK 安装和上游登录统一通过 `codexs login copilot` 完成，本地 bridge secret 和路由仍由受管 provider 状态维护。
- 更新 README、AI README、中文 README、CLI usage 和发布元数据，使其与 0.0.11 的命令与路径契约保持一致。

### Verification

- `npm run build`
- `npm test`
- `npx tsc --noEmit`
- `npm pack --dry-run`

## 0.0.10 - 2026-05-18

This release splits the old `setup` command into a lightweight automation-friendly `init` path and a human-led `migrate` path so initialization and adopt semantics are no longer mixed.

本次版本把旧的 `setup` 拆分为轻量、适合自动化的 `init`，以及面向人工迁移的 `migrate`，从而不再混合“空初始化”和“从运行态 adopt”两种语义。

### Added

- Added `codexs init` as an idempotent initializer that resolves a Codex directory, optionally creates it in TTY mode, and ensures `providers.json` exists.
- Added `COMMAND_DEPRECATED` so old command aliases can fail with structured machine-readable replacement hints.

- 新增 `codexs init`，用于幂等初始化 Codex 目录；在 TTY 下可确认创建缺失目录，并确保 `providers.json` 存在。
- 新增 `COMMAND_DEPRECATED` 错误码，用于让旧命令以结构化、可机读的替代提示失败。

### Changed

- Renamed the former `setup` migration flow to `codexs migrate` while preserving adopt rules, backup/lock behavior, and post-run `doctor`.
- Changed `codexs setup` into a deprecated command entry that no longer performs work and now points callers to `init` and `migrate`.
- Updated README, AI README, CLI usage, help text, and command output to present `init` and `migrate` as the primary entry points.

- 将原 `setup` 迁移流程重命名为 `codexs migrate`，同时保留 adopt 规则、backup/lock 和 post-run `doctor`。
- 将 `codexs setup` 改为弃用入口，不再执行实际工作，而是明确引导调用方改用 `init` 和 `migrate`。
- 更新 README、AI README、CLI usage、help 文案和命令输出，使 `init` 与 `migrate` 成为主入口。

### Verification

- `npm run build`
- `npm test`

## 0.0.6 - 2026-05-13
