# codex-switch `0.1.0` Design

## 文档信息

- 文档类型：实现约束设计文档
- 适用版本：`0.1.0`
- 当前定位：release-hardening only
- 关联 PRD：[`../PRD/codex-switch-prd-v0.1.0.md`](../PRD/codex-switch-prd-v0.1.0.md)
- 关联 beta 设计：[`./codex-switch-v0.0.12-design.md`](./codex-switch-v0.0.12-design.md)

## 1. 设计原则

`0.1.0` 的实现只做 release-hardening，不新增命令面，不改 JSON envelope，不引入兼容层，也不把历史草案继续扩成平台设想。

这个版本的实现目标是收口，不是扩张：

- 把用户看见的主路径讲清楚。
- 把 `list`、`status`、`doctor` 的可读语义讲清楚。
- 把 `migrate` 和 `setup` 的产品定位讲清楚。
- 把文档、help、输出、测试和包内容收口成同一套事实。

## 2. 当前阻塞项

实现收口前必须先正视以下阻塞项：

1. `tests/` 仍被忽略，导致回归测试无法稳定版本化。
2. README 仍引用不存在的 `docs/Tests/testing.md`，说明文档入口还未收口。
3. 版本叙事仍以 `0.0.12` 为中心，`0.1.0` 还没有被写成稳定发布线。
4. 主工作流、`migrate` 定位、`setup` 定位和真实实现状态还没有完全对齐。

只要这些阻塞项还存在，就不应把当前实现视为 `0.1.0` ready。

## 3. 收口矩阵

以下子系统必须完成对应收口。

| 子系统 | 必须稳定的内容 | 约束 |
| --- | --- | --- |
| 文档 | PRD、design、README、CLI usage、product overview、changelog、testing guide | 所有面向用户的文档必须与 `0.1.0` 事实一致 |
| 帮助 | 顶层 help、命令 help、示例顺序 | direct/Copilot 主路径优先，`migrate` 降级，`setup` 仅保留 deprecated 语义 |
| 输出 | `init`、`list`、`status`、`doctor`、`login` 的 human-readable 文案 | 只收口语义，不改 JSON envelope |
| 读路径 | tool home / runtime separation、dual-path model、ambiguous active profile 处理 | 不新增兼容层，不伪造 current 状态 |
| 测试 | release gate、回归测试、fixture 检查 | 回归测试必须落仓库，不能继续停留在忽略状态 |

## 4. 必须稳定的用户可见语义

### 4.1 `list`

`list` 必须能让用户直接看出：

- provider 属于 `direct` 还是 `copilot`
- 哪个 provider 是 current
- 当前 active profile 是否可唯一解析

如果当前 active profile 对应多个 provider，就必须显式表现为 ambiguous，而不是把任何一个 provider 假装成 current。

`list --json` 仍然使用既有 envelope，只允许追加字段，不允许改顶层契约。

### 4.2 `status`

`status` 必须把以下内容讲清楚：

- tool home 是什么
- target runtime 是什么
- 当前 active provider 是什么
- 当前路径是 direct 还是 Copilot
- 下一步应该做什么

`status` 是摘要，不是字段堆叠。输出顺序必须围绕“当前状态 -> 影响 -> 下一步”组织。

### 4.3 `doctor`

`doctor` 必须先给整体健康结论，再列 issue，再给修复建议。

每条 issue 至少要表达：

- 问题是什么
- 为什么重要
- 下一步怎么修

`doctor` 的目标不是罗列内部数据结构，而是把用户推到下一步修复动作。

### 4.4 provider picker

list 和 provider picker 必须一致处理 ambiguous active profile。

选择器提示至少要包含：

- `profile`
- `providerType`
- `current` 标记，仅在唯一解析时出现

### 4.5 命令定位

`0.1.0` 还必须稳定以下产品定位：

- 稳定命令面以 `init`、`login`、`list`、`show`、`current`、`status`、`doctor`、`config`、`add`、`edit`、`switch`、`remove`、`import`、`export`、`bridge`、`backups`、`rollback` 为准。
- `migrate` 只能被表述为高级 adopt helper。
- `setup` 只能被表述为 deprecated entry。
- `--json` 顶层 envelope 继续固定为 `ok / command / data / warnings / error`。

## 5. 文档同步要求

以下面向用户的文档必须与 `0.1.0` 事实一致：

- `README.md`
- `README.CN.md`
- `README.AI.md`
- `docs/cli-usage.md`
- `docs/codex-switch-product-overview.md`
- `docs/PRD/codex-switch-prd-v0.1.0.md`
- `docs/Design/codex-switch-v0.1.0-design.md`
- `CHANGELOG.md`
- `docs/Tests/testing.md`

历史大文档不需要在本版全文重写，但必须明确它们只是历史参考，不是当前 release contract。

## 6. 最小测试计划

`0.1.0` 的最小测试计划必须包含以下内容：

1. `npm run build`
2. `npm test`
3. `npx tsc --noEmit`
4. `npm pack --dry-run`
5. built CLI `--help`
6. built CLI `--version`
7. fresh direct provider flow
8. fresh Copilot provider flow
9. `list/status/doctor` 输出语义检查
10. `migrate` 高级 adopt helper 检查
11. `setup` deprecated entry 检查

测试结论必须落在仓库中的正式测试内容里，不能继续依赖忽略目录或口头约定。

## 7. 明确不做

本版不做以下事情：

- 新 upstream
- GUI / TUI
- daemon
- plugin system
- auto migration
- 兼容层
- dual-read / dual-write
- 重新设计公开 JSON envelope
- 重新扩张命令面

## 8. 结论

`0.1.0` 设计的核心不是“再造一个版本叙事”，而是把已存在的实现收口成稳定合同。实现只要偏离这条线，就不应被视为 `0.1.0` 的合理内容。
