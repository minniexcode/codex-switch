# Changelog

All notable changes to `@minniexcode/codex-switch` will be documented in this file.

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
