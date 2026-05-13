# codex-switch `0.0.6` PRD

## 文档信息

- 状态：Active PRD
- 产品名：`codex-switch`
- CLI 命令名：`codexs`
- 当前基线版本：`0.0.5`
- 目标版本：`0.0.6`
- 文档定位：定义 `0.0.5 -> 0.0.6` 的直接需求范围
- 历史基线 PRD：[`codex-switch-prd.md`](./codex-switch-prd.md)
- 后续演进 PRD：[`codex-switch-prd-v0.0.5-to-v0.1.0.md`](./codex-switch-prd-v0.0.5-to-v0.1.0.md)
- 对应研究稿：[`../codex-switch-product-research.md`](../codex-switch-product-research.md)
- 对应技术架构：[`../codex-switch-technical-architecture.md`](../codex-switch-technical-architecture.md)
- 对应命令设计：[`../codex-switch-command-design.md`](../codex-switch-command-design.md)

说明：

- 当前文件路径仍沿用历史命名 `codex-switch-prd-v0.1.0.md`
- 本文档内容语义以当前 active PRD 为准，本次版本更新不处理文件重命名

## 一句话定义

`0.0.6` 的目标不是继续扩张命令面，而是先修复 `0.0.5` 的功能稳定性问题，冻结当前 CLI 公共契约，并把实现从“单入口持续膨胀的命令调度器”收敛为适合继续扩展的模块化分层架构。

## 当前基线：`0.0.5`

当前已具备的命令面：

- `config-show`
- `config-list-profiles`
- `list`
- `show`
- `current`
- `status`
- `setup`
- `edit`
- `add`
- `switch`
- `remove`
- `import`
- `export`
- `backups`
- `doctor`
- `rollback`

当前基线已具备的工程特征：

- `providers.json` 继续作为管理态单一事实源
- `config.toml` 具备结构化读取与受管 section 写入能力
- 写命令统一走锁、备份、失败回滚
- `--json` 继续使用统一 envelope
- CLI 帮助页已经具备稳定命令分组和文案基础

当前主要问题：

- `0.0.5` 需要继续收敛边界行为和失败语义，提升已有功能的稳定性
- `src/cli.ts` 已经承担过多命令分发、交互编排和参数补全逻辑
- 当前四层结构仍然成立，但 CLI 入口和应用编排层需要进一步细化职责
- 未来第三方 auth / 本地代理 / 外部依赖接入已具备现实需求，但当前扩展边界还不够明确

## `0.0.6` 目标

`0.0.6` 需要完成三件事：

- 修复 `0.0.5` 命令行为中的稳定性问题，巩固已有能力
- 重整 CLI 与应用层分层，解决 `cli.ts` 持续膨胀问题
- 为未来第三方 auth / 本地 proxy / 外部 SDK 集成建立清晰边界，但本版不交付这些集成功能

## 范围

### In Scope

- 现有命令面的稳定性修复与一致性收敛
- 顶层 help 文案、命令分组、示例和危险提示的一致性
- `--json` 契约、TTY 交互规则、非交互失败语义的一致性
- `setup` / `add` / `edit` / `remove` / `import` / `export` / `switch` / `rollback` 的事务与恢复稳定性
- `status` / `doctor` / `config-show` / `config-list-profiles` 的读取稳定性
- CLI 入口再分层
- 应用编排与运行时集成边界收敛
- 为未来第三方 integration 预留明确架构边界

### Out of Scope

- 新增大型命令族
- 真实 Copilot auth 登录接入
- 本地代理服务启动、停止、守护和生命周期管理
- 第三方 SDK 安装器或依赖下载体验
- GUI / TUI / daemon 化
- 把 `config.toml` 升级为通用配置编辑器

## 稳定公共契约

### CLI 命令面

`0.0.6` 默认锁定当前 help 所表达的命令面与分组，不以“新增命令数量”作为版本目标。

Usage 级别的公共入口保持：

```text
codexs <command> [options]
codexs help <command>
```

当前命令分组继续保留：

- Read Commands
- Change Commands
- Diagnostics And Recovery

当前命令名继续保留：

- `config-show`
- `config-list-profiles`
- `list`
- `show`
- `current`
- `status`
- `setup`
- `edit`
- `add`
- `switch`
- `remove`
- `import`
- `export`
- `backups`
- `doctor`
- `rollback`

### JSON Envelope

`--json` 继续保持统一 envelope：

```json
{
  "ok": true,
  "command": "list",
  "data": {},
  "warnings": [],
  "error": null
}
```

要求：

- 顶层 shape 不变
- 新字段只追加到 `data` / `warnings`
- 错误信息继续进入 `error`
- 架构重构不得破坏已有自动化消费方式

### 交互规则

交互能力继续只是 TTY 中的人类增强层，不改变自动化契约：

- `--json` 一律禁用交互
- 非 TTY 一律不进入交互
- 危险写命令继续要求显式确认或显式参数
- 用户取消 prompt 时不得产生文件写入

## 数据与状态边界

### `providers.json`

`providers.json` 继续是 provider registry 的单一事实源：

- `profile` 必填
- `apiKey` 仍按完整 managed provider 处理
- 不引入“半初始化 provider”作为稳定状态

### `config.toml`

到 `0.0.6` 为止，`config.toml` 的定位继续保持：

- 顶层 active `profile`
- 与 provider 关联的 `[profiles.<name>]`
- 第一批受管字段：`model`、`model_provider`
- 非受管内容允许存在，但不进入通用编辑器范围

### `auth.json`

`auth.json` 继续是认证态运行时文件：

- 可以被 `switch`、`rollback`、备份系统纳入事务边界
- 不是 provider registry 的事实源
- 不在 `0.0.6` 中扩展为第三方 auth 统一数据库

## 架构目标边界

### 现状问题

当前 `cli / app / domain / infra` 四层结构仍然是可用基线，但 `cli.ts` 已同时承担：

- 命令分发
- 参数归一化
- 交互分支判断
- 渐进式补问
- 输出路径拼装

这会让后续每增加一个命令或 integration，都继续把复杂度堆回 CLI 入口。

### `0.0.6` 架构调整目标

`0.0.6` 不要求彻底推翻现有分层，但要求把职责边界进一步显式化，至少收敛为下面几类模块能力：

- `Command Surface`
  - 负责命令定义、help 文案、命令 key、参数规格、子命令分发
- `Interaction Layer`
  - 负责 TTY prompt、危险确认、渐进式补问、交互取消语义
- `Application Use Cases`
  - 负责单命令业务编排、跨仓储事务边界、结果契约组装
- `Domain Policies`
  - 负责 provider/profile/config consistency 规则、错误码、纯规则判断
- `Storage Repositories`
  - 负责 `providers.json`、`config.toml`、backups 的文件访问和持久化
- `Runtime Integrations`
  - 负责 `codex` CLI 调用，以及未来第三方 auth adapter、本地 proxy runtime、外部 SDK 封装

### 架构约束

`0.0.6` 需要明确以下约束：

- 不把第三方 SDK 调用直接塞进 CLI 入口
- 不把 prompt 逻辑继续散落到每个命令分支内部
- 不让 `app` 层直接依赖终端输出细节
- 不让运行时集成逻辑反向污染领域规则
- 不因未来接入 Copilot 或其他 provider，就改变本地事务与回滚的安全语义

## `0.0.6` 稳定性要求

### 命令行为一致性

现有命令在 `0.0.6` 需要重点收敛：

- help 文案与真实命令行为一致
- 默认文本输出与 `--json` 输出语义一致
- TTY 与非交互模式下的失败路径可预测
- 危险命令的确认规则一致
- 同一类错误优先映射到同一类错误码

### 写命令安全语义

所有会修改 `providers.json`、`config.toml`、`auth.json` 的命令继续默认遵守：

- 单次锁
- 单次备份
- 单次失败整体回滚

不能接受的结果：

- `providers.json` 已更新但 `config.toml` 未同步
- `config.toml` 已更新但 `providers.json` 未同步
- `auth.json` 或 active profile 因失败留在半切换状态

### 读取稳定性

读取命令在 `0.0.6` 至少需要满足：

- 不因历史 workspace 或边缘状态轻易崩溃
- `status` 与 `doctor` 的诊断信号保持一致语义
- `config-show` 与 `config-list-profiles` 输出结构稳定
- 对缺失文件、解析失败和不一致状态给出可预测错误或警告

## Future-Ready Integration 边界

### 为什么 `0.0.6` 要预留这条线

未来存在明确扩展需求：

- 通过第三方 auth 获取认证态
- 借助本地代理使特定上游可在 Codex 中使用
- 接入外部 SDK，例如 GitHub Copilot 相关能力

如果继续沿用当前“命令直接长在 `cli.ts` 上”的方式，后续集成会快速把架构拖回高耦合状态。

### `0.0.6` 的预留目标

本版只要求建立边界，不要求交付真实功能：

- 允许未来把第三方 auth 封装为独立 integration 模块
- 允许未来把本地 proxy runtime 封装为独立运行时组件
- 允许未来把外部依赖探测、可用性检查、错误语义收敛到 runtime integration 层
- 不在本版锁定具体命令名、交互细节或 SDK 选型细节

### Copilot 作为代表性场景

GitHub Copilot 相关 auth / SDK / 本地代理能力，在 `0.0.6` 里的定位是：

- 作为未来架构设计的代表性输入
- 用于验证 `Runtime Integrations` 分层是否足够清晰
- 不作为 `0.0.6` 必须实现的命令需求

## 对实现的要求

从 `0.0.5` 到 `0.0.6` 的改造，默认遵守：

- 不破坏现有命令名
- 不破坏统一 JSON envelope
- 不破坏备份、回滚、锁模型
- 不引入只能靠交互完成的核心流程
- 不把未来第三方集成耦合进当前 provider/config 领域规则
- 允许内部文件和模块重组，但外部 CLI 契约保持稳定

## 验收标准

达到以下条件时，`0.0.6` 可以认为完成：

- 当前 help 文案与命令行为、参数、危险提示基本一致
- 现有命令在 TTY / 非交互 / `--json` 模式下行为稳定
- 读取命令对历史状态和异常状态的处理更稳，不产生明显回归
- 写命令继续满足锁、备份、失败回滚语义
- `cli.ts` 不再承担持续膨胀的主调度与交互编排复杂度
- 应用编排、交互层、运行时集成边界比 `0.0.5` 更清晰
- 为未来第三方 auth / 本地 proxy / SDK 接入预留了清楚但非侵入式的扩展边界

## 结论

`0.0.6` 是一个修复型版本，但它不是“只修 bug 不动结构”的保守补丁版。它的真正目标，是在不破坏当前 CLI 公共契约的前提下，把 `0.0.5` 已经长出来的命令面和事务能力稳住，并把代码结构调整到足以支撑下一阶段 integration-ready 演进的状态。
