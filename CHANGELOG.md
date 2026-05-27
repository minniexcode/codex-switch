# Changelog

All notable changes to `@minniexcode/codex-switch` will be documented in this file.

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

This release focuses on stabilizing the existing CLI contract and moving the codebase to clearer internal boundaries for future integrations.

本次版本重点不是继续扩命令，而是稳定现有 CLI 契约，并把内部结构调整为更清晰的分层边界，以承接后续 integration 能力。

### Added

- Added `src/commands/` as the shared command-surface layer for registry, parsing, help, and dispatch.
- Added explicit `src/interaction/`, `src/runtime/`, and `src/storage/` boundaries to separate prompts, external runtime probing, and filesystem-backed state access.
- Added plain Node test coverage for command-surface parsing/dispatch, interaction gating, and runtime probing behavior.

- 新增 `src/commands/` 作为共享的命令表面层，统一 registry、参数解析、help 和 dispatch。
- 新增显式的 `src/interaction/`、`src/runtime/`、`src/storage/` 边界，用于拆分交互、外部运行时探测和文件状态访问。
- 新增 plain Node 测试，覆盖 command surface、interaction gating 和 runtime probing 行为。

### Changed

- Slimmed `src/cli.ts` down to bootstrap, version/help handling, and final render/error exit behavior.
- Moved CLI-owned types out of `src/app/types.ts` so application services no longer own argument-parsing contracts.
- Updated runtime diagnostics to use a dedicated Codex runtime probe instead of probing the CLI directly from the previous mixed infra layer.
- Updated package and CLI version to `0.0.6`.

- 将 `src/cli.ts` 缩减为 bootstrap、version/help 和最终渲染/退出职责。
- 将 CLI 自有类型从 `src/app/types.ts` 移出，使应用层不再持有参数解析契约。
- 将运行时诊断切换为专门的 Codex runtime probe，而不是继续从混合 `infra` 层直接探测 CLI。
- 将包版本和 CLI 版本更新为 `0.0.6`。

### Verification

- `npm run build`
- `npx tsc --noEmit`
- `npm test`

## 0.0.4 - 2026-05-12

This release expands the CLI from the initial MVP into a more complete provider-management workflow. The main focus is setup, provider inspection and editing, backup visibility, selective rollback, and clearer automation behavior.

本次版本把 CLI 从初始 MVP 扩展成更完整的 provider 管理工作流，重点补齐了初始化、provider 查看与编辑、备份可见性、指定回滚，以及更清晰的自动化语义。

### Added

- Added `codexs setup` to initialize `providers.json` from an existing Codex directory.
- Added `codexs show <provider>` to inspect a single provider record.
- Added `codexs edit <provider>` to update selected provider fields.
- Added `codexs backups list` to enumerate historical backup manifests.
- Added `codexs rollback <backup-id>` to restore a specific backup while preserving no-arg latest rollback.
- Added `import --merge` support for shallow provider merges keyed by provider name.

- 新增 `codexs setup`，可以从现有 Codex 目录初始化 `providers.json`。
- 新增 `codexs show <provider>`，用于查看单个 provider 记录。
- 新增 `codexs edit <provider>`，用于更新单个 provider 的指定字段。
- 新增 `codexs backups list`，用于列出历史备份清单。
- 新增 `codexs rollback <backup-id>`，支持按备份 ID 定向回滚，同时保留无参回滚最近一次备份的能力。
- 新增 `import --merge`，支持按 provider 名称做浅合并。

### Changed

- Improved CLI help coverage and command-level usage guidance for the expanded 0.0.4 command surface.
- Tightened interactive vs non-interactive semantics so `--json` and non-TTY runs remain prompt-free.
- Updated error code usage to distinguish invalid arguments, unknown commands, prompt cancellation, Codex discovery failures, existing providers state, and backup lookup failures more clearly.
- Updated package and CLI version to `0.0.4`.

- 改进了 CLI 帮助信息和命令级使用说明，覆盖 0.0.4 扩展后的命令面。
- 收紧了交互与非交互语义，确保 `--json` 和非 TTY 调用不会进入 prompt。
- 清理并细化了错误码语义，更明确地区分参数错误、未知命令、交互取消、Codex 目录发现失败、`providers.json` 已存在、备份不存在等情况。
- 将包版本和 CLI 版本更新为 `0.0.4`。

### Operational Notes

- Human-readable `show` output now masks `apiKey`, while JSON mode returns the full provider payload.
- `edit --tag` replaces the full tag set rather than appending one tag at a time.
- `setup` can prompt for merge/overwrite strategy in TTY mode, but requires explicit strategy in non-interactive mode when `providers.json` already exists.
- Corrupt backup manifests are skipped during `backups list` with warnings instead of aborting the whole command.
- Successful `setup` runs also execute `doctor` as a follow-up validation step.

- 文本模式下的 `show` 会隐藏 `apiKey`，而 JSON 模式会返回完整 provider 对象。
- `edit --tag` 的行为是替换整组标签，而不是单个追加。
- `setup` 在 TTY 下可以交互选择 `merge/overwrite`，但在非交互模式下如果 `providers.json` 已存在，则必须显式指定策略。
- `backups list` 遇到损坏的备份 manifest 时会给出 warning 并跳过，而不是让整个命令失败。
- `setup` 成功后会自动执行一次 `doctor` 做后续校验。

### Verification

- `npm run build`
- `node tests/run-tests.js`

## 0.0.3

- Added interactive TTY flows for `add`, `switch`, `remove`, `import`, `export`, and `rollback`.
- Improved top-level and command-specific help output.
- Expanded test coverage for argument parsing and interactive command behavior.

- 为 `add`、`switch`、`remove`、`import`、`export`、`rollback` 增加了交互式 TTY 流程。
- 改进了顶层帮助和命令级帮助输出。
- 增强了参数解析和交互式命令行为的测试覆盖。

## 0.0.2

- Added mutation orchestration with backup-before-write, rollback handling, and single-process locking.
- Improved `status` and `doctor` to detect runtime drift more clearly.
- Strengthened repository and domain layers for safer config mutation behavior.

- 增加了统一的变更编排能力，包括写前备份、失败回滚和单进程锁。
- 改进了 `status` 和 `doctor`，更清晰地识别运行态漂移。
- 加强了仓储层和领域层，实现更安全的配置变更。

## 0.0.1

- Shipped the initial TypeScript CLI implementation.
- Added the first MVP command set and file-based provider management model.
- Added the initial product, architecture, and command-design documents.

- 发布了第一版 TypeScript CLI 实现。
- 落地了第一批 MVP 命令和基于文件的 provider 管理模型。
- 补齐了首批产品、架构和命令设计文档。
