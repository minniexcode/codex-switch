# codex-switch `0.0.6` 设计文档

## 文档信息

- 文档类型：详细设计文档
- 适用版本：`0.0.6`
- 目标范围：`0.0.5 -> 0.0.6`
- 主对齐 PRD：[`../PRD/codex-switch-prd-v0.1.0.md`](../PRD/codex-switch-prd-v0.1.0.md)
- 远期边界参考：[`../PRD/codex-switch-prd-v0.0.5-to-v0.1.0.md`](../PRD/codex-switch-prd-v0.0.5-to-v0.1.0.md)
- 风格基线：[`codex-switch-v0.0.5-design.md`](./codex-switch-v0.0.5-design.md)

## 1. 文档目标

这份文档回答的是 `0.0.6` 应该怎样落地，而不是继续讨论长期愿景：

- `0.0.5` 已经落下来的命令能力哪些必须稳住，哪些边缘行为必须收口
- `0.0.6` 为什么不是“再加一批新命令”，而是“稳定性 + 模块化”版本
- 当前 `src/cli.ts`、`src/app/types.ts`、`src/infra/` 的职责混合问题应该怎样拆开
- 未来第三方 auth / proxy / SDK 相关需求，在本版里只应该沉淀成什么内部扩展契约

目标是让实现阶段不再重复拍板“要不要重构”“命令表面怎么统一”“未来集成往哪层放”这些关键问题。

## 2. 版本定位与设计原则

### 2.1 当前基线

当前 `0.0.5` 已具备：

- provider registry 管理：`list`、`show`、`add`、`edit`、`remove`
- 运行态切换：`current`、`switch`
- 导入导出：`import`、`import --merge`、`export`
- 初始化与诊断：`setup`、`status`、`doctor`
- 备份恢复：`backups list`、`rollback`
- `config show` / `config list-profiles`
- 统一 JSON envelope
- 写操作统一走锁、备份、失败回滚

当前主要短板已经不再是“缺命令”，而是：

- help、参数、TTY 和 `--json` 的行为仍有继续统一的空间
- `src/cli.ts` 已承担过多解析、分发、交互和异常渲染职责
- CLI 解析类型与应用层类型混放，层次所有权不清
- `infra` 同时装文件仓储和外部运行时调用，未来会继续膨胀

### 2.2 `0.0.6` 的一句话定义

`0.0.6` 的核心不是继续扩张命令面，而是修复 `0.0.5` 的稳定性问题，冻结当前 CLI 公共契约，并把实现收敛为适合继续扩展的显式分层结构。

### 2.3 设计原则

`0.0.6` 继续沿用现有工程原则：

- `CLI First`
- `Local First`
- `Safe by Default`
- `AI Friendly`
- `Split State Model`
- `Lightweight Transactions`

在此基础上新增三条版本原则：

- 不破坏当前 help、命令名和 `--json` envelope
- 架构重构必须先收口公共契约，再做内部迁移
- 未来 integration 能力只能挂在独立 runtime / integration 边界，不得重新耦合回 CLI 入口

## 3. 范围与边界

### 3.1 `0.0.6` 范围内

本设计覆盖：

- help 文案、参数、TTY 交互、错误语义的一致性修复
- 命令分发、交互编排、应用用例、存储访问、运行时集成的重新分层
- `setup` / `add` / `edit` / `remove` / `import` / `export` / `switch` / `rollback` 的稳定性收口
- `status` / `doctor` / `config show` / `config list-profiles` 的读取稳定性收口
- 面向未来 auth / proxy / SDK 的内部能力契约

### 3.2 明确不在 `0.0.6` 范围内

下面这些内容不进入本设计：

- 新增大型命令族
- 真实 Copilot 登录接入
- 本地代理服务启动、停止、守护与生命周期管理命令
- 第三方 SDK 安装器或依赖下载体验
- GUI / TUI / daemon 化
- 把 `config.toml` 升级为通用配置编辑器

### 3.3 数据与公共契约边界

`0.0.6` 继续坚持现有公共边界：

- `providers.json`：provider registry 的单一事实源
- `config.toml`：运行态配置投影，继续保持局部受管
- `auth.json`：认证态运行时文件
- `backups/` + `latest.json`：恢复态
- `--json`：顶层 envelope shape 不变

本版允许内部文件和模块重组，但不允许用户可见契约漂移。

## 4. 当前实现问题盘点

### 4.1 `src/cli.ts` 过重

当前 `src/cli.ts` 同时承担：

- version 输出
- help 分发
- 参数分发
- 交互能力判断
- 命令调用
- 异常归一化和最终渲染

这意味着任何一个新命令、新交互分支或未来 integration，都容易继续把复杂度堆回单文件入口。

### 4.2 CLI 类型落在 `src/app/types.ts`

当前 `ParsedArgs`、`CommandContext` 等 CLI 解析与调度类型放在 `src/app/types.ts`，带来两个问题：

- 类型所有权不清，CLI 表面层概念混入用例层
- 后续要拆 command surface 时，应用层会被迫携带 CLI 历史包袱

### 4.3 公开命令形态与内部 command key 未正式抽象

当前 help 和解析事实上已经存在两套概念：

- 公开 CLI 形态：`config show`、`config list-profiles`、`backups list`
- 内部执行 key：`config-show`、`config-list-profiles`、`backups-list`

这套事实目前只散落在 `help.ts` 和 `args.ts` 中，没有被提升成正式抽象，因此 help、参数解析和 dispatch 仍可能出现映射漂移。

### 4.4 `src/infra/` 职责过宽

当前 `src/infra/` 同时承载：

- `providers.json` / `config.toml` / 备份 / 锁 / 路径解析
- `codex` CLI 调用与可用性检查

如果未来 auth adapter、proxy runtime、SDK probe 继续往这里堆，`infra` 会再次变成“什么都放”的兜底目录，边界无法稳定。

## 5. `0.0.6` 功能总览

`0.0.6` 需要完成四件事：

- 巩固现有命令的 help、参数、TTY、错误和回滚行为
- 把 command surface、interaction、application、storage、runtime 的职责边界显式化
- 让 `src/cli.ts` 缩回薄入口，只保留 bootstrap 与最终渲染职责
- 为未来第三方 auth / proxy / SDK 接入预留清晰但非侵入式的 runtime 边界

## 6. 目标架构

### 6.1 最终结构方向

`0.0.6` 设计稿直接锁定目标源码结构为：

```text
src/
  cli.ts
  commands/
  interaction/
  application/
  domain/
  storage/
  runtime/
```

说明：

- `src/cli.ts` 保留为薄入口，不再承担持续膨胀的业务编排
- 这不是要求一次性重命名所有文件完成“大爆炸迁移”
- 这是最终结构方向，迁移允许分阶段完成

### 6.2 为什么选择 Hybrid 显式分层

`0.0.6` 不采用“所有命令逻辑继续围绕 CLI 文件散开”的路线，也不要求引入过度设计的框架式架构。

这里锁定的是一套 Hybrid 分层：

- 上层围绕命令表面与交互体验组织
- 中层围绕应用用例与领域规则组织
- 下层按持久化与运行时依赖做边界隔离

这样既能保留现有 CLI 工程的简单性，也能防止未来第三方集成倒灌回入口层。

## 7. 模块职责设计

### 7.1 `commands/`

`commands/` 是命令表面层，负责：

- `parseArgs`
- help 定义与渲染
- `CommandId` 与公开 token 映射
- command registry
- dispatch orchestration
- `ParsedCommand` / `CommandExecutionContext` 这类类型归属

明确不负责：

- 真实文件写入
- 直接业务事务
- 终端 prompt 细节实现
- 第三方 CLI / SDK 调用

### 7.2 `interaction/`

`interaction/` 是纯交互层，负责：

- `PromptRuntime`
- `canPrompt`
- provider 选择
- 危险确认
- setup 目录选择
- 渐进式补问
- 交互取消语义

交互层的唯一产物是“已决输入”，而不是文件副作用：

- 可以决定 providerName / profile / strategy / confirm 等输入
- 不直接写 `providers.json`、`config.toml`、`auth.json`

### 7.3 `application/`

`application/` 是用例编排层，继续保留现有命令 use case 思想，但要求：

- 每个 use case 只接收显式参数
- 不直接依赖终端 IO
- 不再承载 CLI 解析类型
- 继续负责双写事务、结果契约和回滚增强

它是 command surface 到 storage / runtime / domain 的稳定入口。

### 7.4 `domain/`

`domain/` 继续保留，但职责要显式收紧为：

- provider / config / runtime-state 规则
- 错误码与纯规则判断
- 共享 profile、悬空 active profile、一致性 issue 等策略

明确不承载：

- 命令解析
- prompt 流程
- 文件系统访问
- 外部 CLI / SDK 可用性探测

### 7.5 `storage/`

`storage/` 从 `infra` 中拆出，职责锁定为：

- `providers.json` / `config.toml` / backups / lock / path resolution
- 原子写入
- 备份 manifest
- 文件读取校验

明确不承载：

- `codex` CLI 调用
- 第三方 auth / SDK / proxy 调用

### 7.6 `runtime/`

`runtime/` 从 `infra` 中拆出，职责锁定为：

- 当前 `codex` CLI 调用
- 未来第三方 auth adapter
- 未来本地 proxy runtime
- 外部依赖探测与版本 / 可用性检查

这层唯一目标是吸收“依赖外部程序或外部集成”的复杂度，而不是承载 provider/config 核心规则。

## 8. 内部接口与类型

`0.0.6` 不锁未来用户命令，但锁内部契约名称和边界。

### 8.1 `CommandId`

`CommandId` 表示内部稳定命令标识，和公开 token 序列分离。

例如：

```ts
type CommandId =
  | "config-show"
  | "config-list-profiles"
  | "list"
  | "show"
  | "current"
  | "status"
  | "setup"
  | "edit"
  | "add"
  | "switch"
  | "remove"
  | "import"
  | "export"
  | "backups-list"
  | "doctor"
  | "rollback";
```

设计要求：

- 对外命令 token 可以多段
- 对内 dispatch key 必须稳定单值
- help、解析、dispatch 和 JSON `command` 字段都应共享同一套命令定义来源

### 8.2 `CommandDefinition`

`CommandDefinition` 负责描述一条命令的帮助、公开 token、参数规范和处理器绑定。

建议内部结构：

```ts
type CommandDefinition = {
  id: CommandId;
  tokens: string[];
  group: "read" | "write" | "recovery";
  summary: string;
  usage: string[];
  details: string[];
  examples: string[];
  handler: CommandHandler;
};
```

这样 help 文案、topic 匹配、参数解析和 dispatch 都能共用一份 registry。

### 8.3 `CommandHandler`

`CommandHandler` 是 command surface 到 application 的统一入口。

建议职责：

- 接收 `ParsedCommand`
- 在必要时请求 `InteractiveResolver`
- 将“已决输入”映射为应用层显式参数
- 返回稳定 `CommandResult`

它不直接做底层文件写入，也不直接操作终端输出。

### 8.4 `InteractiveResolver`

`InteractiveResolver` 的目标，是把 TTY 条件下的补问与确认从 handler 里拿出去。

能力至少包括：

- 选择 provider
- 选择 setup 目录
- 选择 setup strategy
- 危险删除确认
- rollback 确认
- add / edit 的渐进式缺失字段补问

它只产出已决输入或取消结果，不直接调用应用用例。

### 8.5 `RuntimeDependencyProbe`

`RuntimeDependencyProbe` 负责探测 `codex` CLI 或未来 SDK 是否可用。

职责包括：

- 可执行文件是否存在
- 版本是否满足最低要求
- 环境是否具备调用条件
- 将失败归一为 runtime/integration 侧错误

它不负责 provider/config 规则判断。

### 8.6 `AuthRuntimeAdapter` 与 `ProxyRuntimeAdapter`

这两个接口在 `0.0.6` 里只定义能力边界，不定义未来命令名。

建议能力方向：

```ts
type AuthRuntimeAdapter = {
  probe(): Promise<RuntimeAvailability>;
  readState?(): Promise<unknown>;
  acquire?(): Promise<unknown>;
};

type ProxyRuntimeAdapter = {
  probe(): Promise<RuntimeAvailability>;
  getStatus?(): Promise<unknown>;
};
```

约束：

- 不在 `0.0.6` 里提前承诺 Copilot 用户命令
- 不在本版里提前锁死 SDK 选型和协议细节
- 只要求未来集成能以 runtime adapter 形式接入

## 9. 命令表面模型

### 9.1 公开 CLI 形态

公开 CLI 形态继续允许多 token 命令：

- `config show`
- `config list-profiles`
- `backups list`

同时继续保留单 token 命令：

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
- `doctor`
- `rollback`

### 9.2 内部执行 ID

内部执行 ID 继续允许使用稳定 key：

- `config-show`
- `config-list-profiles`
- `backups-list`

这与当前实现事实一致，但在 `0.0.6` 中必须正式化，不再只靠局部 if/else 映射。

### 9.3 单一 registry 原则

help 文案、参数解析、dispatch 都必须共享同一份 registry，不允许再多处手写映射。

禁止继续扩散的形态包括：

- `help.ts` 自己维护一套命令名
- `args.ts` 自己维护一套多 token -> key 映射
- `cli.ts` 再用 `switch` 补一套分发事实

`0.0.6` 的目标是让这三者都从 `CommandDefinition[]` 派生。

## 10. 稳定性与错误语义要求

### 10.1 help / 参数 / TTY 一致性

`0.0.6` 要求显式收口以下行为：

- help 文案与真实命令行为一致
- 默认文本输出与 `--json` 输出语义一致
- `--json` 一律禁用交互
- `setup` 在 `0.0.6` 中如果仍依赖 adopt 输入采集，则非交互路径必须显式失败，不允许伪装成“稳定支持但最终必然报错”的半可用状态
- 非 TTY 一律不进入交互
- 用户取消 prompt 时不得产生文件写入

### 10.2 写命令安全语义

所有修改 `providers.json`、`config.toml`、`auth.json` 的命令继续默认遵守：

- 单次锁
- 单次备份
- 单次失败整体回滚

不能接受的状态包括：

- `providers.json` 已更新但 `config.toml` 未同步
- `config.toml` 已更新但 `providers.json` 未同步
- `auth.json` 或 active profile 留在半切换状态

### 10.3 读取稳定性

读取命令在 `0.0.6` 至少需要满足：

- 历史 workspace 或边缘状态下不轻易崩溃
- `status` 与 `doctor` 的诊断语义继续对齐
- `config show` 与 `config list-profiles` 的输出结构稳定
- 对缺失文件、解析失败和不一致状态给出可预测错误或 warning

## 11. 迁移方案

### 11.1 Phase 1：抽出 command surface 契约

第一阶段目标：

- 抽出 command surface 类型和 registry
- 把 `ParsedArgs`、`CommandContext` 从 `src/app/types.ts` 迁走
- 明确 `CommandId`、`ParsedCommand`、`CommandExecutionContext` 的所有权

这一阶段不追求目录一次性重命名完毕，先解决“谁拥有 CLI 契约”。

### 11.2 Phase 2：缩薄 `src/cli.ts`

第二阶段目标：

- 让 `src/cli.ts` 只保留 bootstrap
- 只保留 version / help / main / error exit
- 命令分发和处理器绑定下沉到 `commands/`

这一步完成后，入口文件应能稳定维持在薄层。

### 11.3 Phase 3：抽离 `interaction/`

第三阶段目标：

- 把现有 `cli/interactive.ts`、`add-interactive.ts`、`prompt.ts` 收口为独立 `interaction/` 层
- 把危险确认、补问、目录选择、交互取消统一抽象
- 避免每个 command handler 再自行散落 prompt 细节

### 11.4 Phase 4：拆分 `infra` 为 `storage` 与 `runtime`

第四阶段目标：

- 先迁 `codex-cli.ts` 一类外部运行时调用到 `runtime/`
- 把文件读写、锁、备份、路径、仓储收口到 `storage/`
- 在 runtime 层补齐 capability contracts

迁移顺序上先拆运行时入口，再收口未来 probe / adapter 扩展点。

### 11.5 Phase 5：测试与文档同步

第五阶段目标：

- 按新边界收口测试
- 修正 README / help / 版本同步问题
- 确认命令行为和公共契约未回归

这是收尾阶段，不应被当成可后置省略项。

## 12. 关键流程时序

### 12.1 顶层 CLI 启动到 command registry dispatch

```text
argv
  -> cli.ts bootstrap
  -> commands.parseArgs
  -> commands.resolveCommandDefinition
  -> commands.dispatch
  -> handler
  -> application use case
  -> output render
```

要求：

- 顶层入口不再自行维护命令知识
- dispatch 以 registry 为单一事实源

### 12.2 带交互的写命令：解析到“已决输入”再进入 application

```text
argv
  -> parse command surface
  -> handler checks TTY / --json
  -> interaction resolver collects missing inputs / confirmations
  -> resolved command input
  -> application use case
  -> storage + runtime mutation
  -> result
```

关键点：

- 交互发生在 application 之前
- application 看见的始终是显式参数，而不是 prompt 分支

### 12.3 `switch` 的 storage + runtime 事务链路

```text
switch command
  -> resolve provider
  -> application/switch-provider
  -> storage acquire lock
  -> storage create backup
  -> storage update active profile in config.toml
  -> runtime refresh codex auth/login when enabled
  -> success result
  -> on failure rollback config/auth from backup
```

关键约束：

- runtime 失败不能污染核心状态
- rollback 仍由应用层事务编排触发

### 12.4 `setup` 的目录发现、策略选择、adopt 输入采集与写入边界

```text
setup command
  -> runtime/storage path candidate discovery
  -> interaction choose directory when needed
  -> read config + providers state
  -> interaction choose strategy and adopt inputs
  -> application/setup-codex
  -> storage mutation under backup
  -> doctor/status style summary output
```

关键边界：

- 候选目录选择属于 interaction
- adopt 规则判断属于 application + domain
- 真实写入仍由 storage 执行

### 12.5 integration-ready 场景：dependency probe / auth adapter 不可用

```text
future integration command or switch extension
  -> handler / application requests runtime probe
  -> runtime dependency probe fails
  -> runtime-layer error normalization
  -> command fails before core mutation
  -> providers/config/auth state unchanged
```

要求：

- 失败归因停留在 runtime 层
- 不把“外部依赖不可用”污染成 provider/config 领域错误

## 13. 测试设计

### 13.1 总体原则

测试继续采用当前 plain Node specs 模式：

- 不引入 Jest / Vitest
- 保留现有 domain / app / cli / dev-sandbox / e2e 五层思路
- 新测试覆盖围绕 command surface、interaction、runtime 三条新增设计关注点补强

### 13.2 Command Surface 覆盖

最少覆盖：

- 多 token 命令解析：`config show`、`config list-profiles`、`backups list`
- help topic 到内部 `CommandId` 的映射
- command registry dispatch
- `--json` 与 TTY gating
- version / help / unknown command 的统一入口行为

### 13.3 Interaction 覆盖

最少覆盖：

- 取消 prompt
- 危险确认拒绝
- `setup` 多候选目录
- `add` / `edit` 的渐进式输入补问
- provider 选择与 rollback 确认

### 13.4 Runtime 覆盖

最少覆盖：

- `codex` CLI 不可用
- 版本不兼容
- 未来依赖探测失败的错误归类
- runtime 失败时不污染 provider/config 核心状态

### 13.5 现有主路径回归

继续保持 e2e 针对以下路径的真实回归：

- `switch`
- `rollback`
- `add` / `edit` / `remove`
- `import` / `export`
- `config show`
- `doctor`

重点不是补更多命令名，而是证明重构后当前主路径没有回归。

## 14. Deferred 到 `0.1.0`

下面这些内容明确 deferred，不混入 `0.0.6`：

- 真实 Copilot / 第三方 auth 登录流程
- 本地 proxy 用户命令和生命周期管理
- 具体 SDK 安装、下载、引导体验
- 更大的 integration 命令面

`0.0.6` 只接受“把边界设计清楚”，不接受“先把未来功能半做进去”。

## 15. 验收标准

`0.0.6` 设计落地后，至少应满足：

- 当前 help 文案与命令行为、参数和危险提示基本一致
- 现有命令在 TTY / 非交互 / `--json` 模式下行为稳定
- `src/cli.ts` 不再承担持续膨胀的主调度与交互编排复杂度
- command surface、interaction、application、storage、runtime 的职责边界比 `0.0.5` 清晰
- 公开 token 与内部 `CommandId` 的映射被正式收口为单一 registry
- 写命令继续满足锁、备份、失败回滚语义
- 读取命令对历史状态和异常状态的处理更稳
- 为未来第三方 auth / proxy / SDK 接入预留了清楚但非侵入式的 integration-ready 边界

验收维度同时包含三类：

- 稳定性：当前命令不回归
- 分层完成度：核心职责边界明确且可迁移
- integration-ready：未来外部能力有独立 runtime 契约，不反向污染 CLI 与领域层

## 16. 结论

`0.0.6` 的本质，是把 `codex-switch` 从“命令已基本成形但入口和职责正在持续膨胀”的状态，推进到“公共契约冻结、现有能力稳定、内部边界清晰、可继续承接 integration-ready 演进”的下一阶段。

这一步不要求立刻交付 Copilot、proxy 或 SDK 功能；它要求的是，在不破坏当前 CLI 用户面和事务安全模型的前提下，把结构调整到足以支撑下一阶段演进的状态。
