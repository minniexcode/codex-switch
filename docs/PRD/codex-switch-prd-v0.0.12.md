# codex-switch `0.0.12` PRD

## 文档信息

- 状态：Active PRD
- 产品名：`codex-switch`
- CLI 命令名：`codexs`
- 当前基线版本：`0.0.11`
- 目标版本：`0.0.12`
- 文档定位：定义 `0.0.11 -> 0.0.12` 的直接需求范围
- 版本角色：beta / internal-test build
- 关联 roadmap：[`../Design/codex-switch-v0.0.9-to-v0.0.12-roadmap.md`](../Design/codex-switch-v0.0.9-to-v0.0.12-roadmap.md)
- 关联上一版 PRD：[`./codex-switch-prd-v0.0.11.md`](./codex-switch-prd-v0.0.11.md)
- 关联正式发布门槛：[`./codex-switch-prd-v0.1.0.md`](./codex-switch-prd-v0.1.0.md)

## 一句话定义

`0.0.12` 不是继续扩命令面的版本，而是把已经具备可用性的 `0.0.11` 收束为一个适合内测验证的 beta 版本：主工作流清晰、文档一致、帮助文案一致、诊断与恢复路径可解释，然后再决定是否进入 `0.1.0`。

## 版本定位

`0.0.12` 的核心任务不是“再做一个亮眼新功能”，而是回答下面这个现实问题：

- 现在这套 CLI，是否已经足够稳定，值得被当成一个正式发布产品去讲？

从当前仓库状态看，答案已经接近“是”，但还差最后一层发布一致性收口：

- 代码中的双路径模型已经成型
- Copilot 本地启动路径已经可用
- direct provider / bridge / doctor / rollback 主能力已经齐
- 但产品叙述、README、PRD、帮助文案、版本文件和主入口推荐路径还没有完全统一

因此，`0.0.12` 要做的是：

1. 固定正式主工作流
2. 弱化非主路径能力的产品权重
3. 清理文档与版本线漂移
4. 准备 `0.1.0` 的 release gate

## 本版目标

- 把 `init -> add -> switch -> status/doctor` 固定为 direct provider 的主工作流
- 把 `init -> login copilot -> add --copilot -> switch` 固定为 Copilot provider 的主工作流
- 把 `migrate` 从“Quick Start 主入口”降级为“高级 adopt 工具”
- 让 README、CLI help、CLI usage、产品文档、PRD、changelog 对同一套主路径使用一致表述
- 清理仍然残留的旧路径叙述、旧版本语义和历史命名漂移
- 为 `0.1.0` 建立真实有效的发布门槛文档，而不是继续复用旧内容

## In Scope

- 发布级文案硬化
- 帮助页、README、CLI usage 的主路径重排
- `init`、`login copilot`、`status`、`doctor` 的结果语义和人类可读解释强化
- `migrate` 的产品定位调整
- 版本文件、PRD、roadmap、changelog 的一致性收口
- 结构层清理中那些不会改变外部命令契约的尾巴
- 针对 release-ready 场景补齐测试与验证 checklist

## Out of Scope

- 新增新的顶级命令族
- 新增新的 upstream
- 为 `migrate` 做完整非交互产品化
- 引入 GUI / TUI / daemon
- 自动迁移旧 tool home 或旧 registry 布局
- 做 plugin system、marketplace、multi-upstream 平台化抽象
- 处理“未来也许会有”的兼容故事

## 核心产品判断

### 1. 当前已经足够“功能可用”

`0.0.11` 之后，`codex-switch` 已经不是一个只差几个命令的工具，而是一套完整的本地 provider 管理 CLI：

- tool home 与 target Codex runtime 已拆分
- direct provider 流程已经完整
- Copilot onboarding / bridge / switch 路径已经闭环
- backup / rollback / doctor / status 已形成基本安全带

这意味着 `0.0.12` 不需要再靠堆功能证明价值。

### 2. 当前还不够“发布可讲”

真正还没收口的是以下问题：

- 有些文档仍残留旧 `~/.codex/providers.json` 叙述
- `migrate` 在文档中的权重仍然偏高，容易让用户误以为它是默认主入口
- 历史 `v0.1.0` PRD 文件仍是旧 `0.0.6` 内容，正式发布线不可信
- 部分帮助与结果语义还没有完全体现 tool-home-first 模型

所以本版的产品任务是“发布叙事硬化”，不是“功能继续扩张”。

## 主工作流定义

### Direct Provider 主工作流

`0.0.12` 固定 direct provider 的主路径为：

```bash
codexs init
codexs add <provider> --profile <name> --api-key <key>
codexs switch <provider>
codexs status
codexs doctor
```

这条路径应被视为：

- README 主推荐路径
- help 示例主推荐路径
- 最接近 `0.1.0` 正式发布入口的路径

### Copilot Provider 主工作流

`0.0.12` 固定 Copilot provider 的主路径为：

```bash
codexs init
codexs login copilot
codexs add <provider> --copilot --profile <name>
codexs switch <provider>
codexs status
codexs doctor
```

说明：

- `login copilot` 仍是 upstream onboarding / auth readiness 命令
- `add --copilot` 仍不是安装和登录编排命令
- `bridge start` / `bridge stop` / `bridge status` 保留，但属于运行时运维能力，不是所有 Copilot 使用者的第一步

### `migrate` 的产品定位

`0.0.12` 对 `migrate` 的定位正式收口为：

- 高级 adopt / migration helper
- 面向已有 Codex runtime 状态的人工辅助命令
- 不是 fresh install 的 Quick Start 主入口
- 不是自动化脚本主入口

本版不删除 `migrate`，也不弱化其真实价值；但要停止把它放在产品首页最核心的位置。

## 文档与命令契约要求

### README / Help / CLI Usage 一致性

以下材料必须使用同一套主路径叙述：

- `README.md`
- `README.CN.md`
- `README.AI.md`
- `docs/cli-usage.md`
- CLI 顶层 help
- 相关 command help

一致性要求：

- direct provider 主路径优先展示 `init -> add -> switch`
- Copilot 路径优先展示 `init -> login copilot -> add --copilot -> switch`
- `migrate` 仍出现，但要带有高级 adopt / interactive helper 语义
- `setup` 只保留 deprecation 说明

### 双路径模型叙述冻结

本版对外叙述必须完全统一：

- tool home：
  - `codex-switch.json`
  - `providers.json`
  - `backups/`
  - `runtime/`
  - `runtimes/`
- target Codex runtime：
  - `config.toml`
  - `auth.json`

不再允许继续保留以下旧叙述：

- `providers.json` 位于 `~/.codex`
- `backups/` 位于 `~/.codex`
- `codex-switch` 以 `codexDir` 作为自己的管理根

### 结果语义硬化

本版重点收口以下命令的人类输出和帮助语义：

- `list`
  - 应能标记当前选中的 managed provider，但仅限当前 active provider 可唯一解析时
  - 应显式区分 `direct provider` 与 `Copilot provider`
  - 当当前 active profile 映射到多个 provider 时，不得伪造单一 current provider，而应按 ambiguous 状态解释
- `init`
  - 必须明确它初始化的是 tool home，而不是 target `codexDir`
  - 成功信息应围绕 tool home、tool config、registry 和下一步建议
- `login copilot`
  - 必须明确区分 SDK、official login、shared auth 三层语义
- `status`
  - 应明显展示当前 target `codexDir`
  - 应明显展示 tool home 的角色
  - 应让 direct provider / Copilot provider 的路径差异足够可读
- `doctor`
  - issue 输出应继续聚焦“下一步怎么做”

## 结构与实现收口要求

`0.0.12` 可以继续做不会改变外部契约的内部清理，但前提是：

- 不改变命令名
- 不改变 JSON envelope 顶层 shape
- 不重做错误空间
- 不引入新的兼容层

可接受的内部收口包括：

- 删除或收拢已经无必要的历史 compatibility facade
- 继续削减 oversized handler 的职责泄漏
- 补齐稳定导出类型和关键 use case 的 JSDoc
- 清理目录边界与命名漂移

## 测试重点

### 1. 主工作流验证

- fresh tool home 下 direct provider 主路径可走通
- fresh tool home 下 Copilot 主路径可走通
- `switch -> status -> doctor -> rollback` 保持行为稳定

### 2. 文案与帮助验证

- 顶层 help 主示例改为 direct / Copilot 主路径
- `migrate` 不再被误导性地当作默认入口
- `setup` 继续只返回 deprecation 合同
- `list` 与共享 provider 选择器能展示 provider 类型和 current 标记语义

### 3. 诊断与恢复验证

- 缺 `providers.json`
- 缺 `config.toml`
- 损坏 `auth.json`
- 损坏 bridge runtime state
- Copilot SDK 缺失
- Copilot auth 缺失

这些场景都需要：

- 返回稳定错误码或 issue code
- 给出清楚的下一步建议

### 4. 发布检查

至少覆盖：

- `npm run build`
- `npm test`
- `npx tsc --noEmit`
- `npm pack --dry-run`
- built CLI `--help`
- built CLI `--version`
- read commands in `--json`
- write commands in sandbox
- direct provider 主路径
- Copilot 主路径

## 验收标准

达到以下条件时，`0.0.12` 可以认为完成：

- 用户第一次看 README 和 help 时，能一眼看出主路径是什么
- `migrate` 不再与主 onboarding 路径混淆
- 所有对外文档都使用双路径模型，不再残留旧 `~/.codex/providers.json` 叙述
- `list` 与 provider 选择器可以看出谁是当前 provider，以及它属于 direct 还是 Copilot 路径
- 当前 provider 无法唯一解析时，文档与命令契约都不会伪造单一 current provider
- `0.1.0` 的 PRD 文件不再是历史错误内容
- `init` / `status` / `doctor` 的输出足以支撑小范围 beta 使用
- 代码结构不再继续保留明显的历史双目录语义尾巴
- 发布 checklist 可以真实执行，而不是文档占位

## 结论

`0.0.12` 的完成标准，不是“又多了一个功能”，而是 `codex-switch` 终于开始以一个正式产品的方式讲清楚自己：主路径是什么、管理哪些状态、哪些命令是核心、哪些命令只是高级辅助、以及距离 `0.1.0` 还差哪一道门槛。
