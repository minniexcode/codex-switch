# codex-switch `0.0.11` 设计文档

## 文档信息

- 文档类型：详细设计文档
- 适用版本：`0.0.11`
- 目标范围：`0.0.10 -> 0.0.11`
- 对应 PRD：[`../PRD/codex-switch-prd-v0.0.11.md`](../PRD/codex-switch-prd-v0.0.11.md)
- 关联上一版设计：[`./codex-switch-v0.0.10-design.md`](./codex-switch-v0.0.10-design.md)
- 关联专项设计：[`./codex-switch-copilot-integration-design.md`](./codex-switch-copilot-integration-design.md)

## 1. 文档目标

本设计文档用于把 `0.0.11` 的结构性变更收口到“实现者无需再补关键决策”的程度。文档必须直接回答以下问题：

- `codex-switch` 的 tool home 与目标 `codexDir` 如何彻底拆分，哪些文件归哪一层负责
- `codex-switch.json` 的最小稳定 contract 是什么，默认 `codexDir` 解析优先级如何固定
- `codexs login <upstream>` 的命令定位、主流程、失败边界和首版 `copilot` 语义是什么
- `add --copilot` 在 `0.0.11` 后到底还负责什么，不再负责什么
- 当前开发阶段不需要哪些兼容性/迁移逻辑，哪些历史状态允许手动处理
- `init`、direct provider、bridge、backup、rollback、`status`、`doctor` 在新路径模型下的最小可用实现边界是什么
- 哪些错误码、输出语义和测试场景必须被 `0.0.11` design 正式固定

本设计只覆盖 `0.0.11` 的文档与实现契约，不顺手扩展成多 upstream 平台方案、GUI 模型、长期双写兼容层、自动迁移层或新的大 JSON 契约。

## 2. 版本定位

`0.0.11` 是一次工具边界重构版本，不是单个命令补丁版本。

它的目标不是“给现有 Copilot 路径补一个 `login` 命令”，也不是“把几个路径从 `~/.codex` 改到别处”。本版要解决的是：`codex-switch` 终于拥有独立且稳定的工具级 home 边界，并把上游登录从 provider mutation 命令里拆出来。

同时，本版的实现策略明确偏向开发期最小落地，而不是 release 兼容性工程：

- 当前工具只有单用户自用场景
- `0.0.11` 到手动确认的 `0.1.0 release` 之前，都按开发版本处理
- 不为了历史状态、低价值升级路径或“也许以后会用到”的兼容故事引入污染性代码
- 旧状态允许手动清理、手动迁移或直接重新 `add provider`

这意味着 `0.0.11` 要同时完成两类收口：

1. 存储模型收口
   - `providers.json`
   - `backups/`
   - lock 文件
   - runtime state
   - runtime install
   必须统一迁到 tool home
2. 命令职责收口
   - `login` 负责 upstream onboarding / auth readiness
   - `add --copilot` 负责 provider precondition validation 与 registry mutation
   - `switch` 继续负责最终 runtime gate 与 config/auth projection

如果这两条线只完成其中一条，`0.0.11` 就不算完成。

## 3. 设计原则

`0.0.11` 必须遵循以下原则：

1. 工具管理态与目标 runtime 状态严格分层。
2. `providers.json` 是 `codex-switch` tool home 内的管理态 SSOT。
3. `config.toml` 与 `auth.json` 继续属于目标 `codexDir`，不承载 `codex-switch` registry、backup 或 runtime install。
4. upstream login 是 onboarding / auth 能力，不是 provider mutation 能力。
5. 开发阶段优先最小实现，不为一次性历史状态引入自动迁移或长期兼容层。
6. 本版只真实落地 Copilot upstream，但目录模型和命令模型必须给未来 upstream 预留扩展位。
7. design 文档以 `0.0.11` PRD 为事实源；若当前实现存在未完成或旧行为，设计稿应明确目标契约，而不是被旧实现反向锁死。
8. `0.1.0` 只有在用户手动明确为 release 时才按 release 语义看待；否则仍按开发版本处理。

## 4. 数据边界与路径模型

### 4.1 双路径模型

`0.0.11` 起，CLI 的路径模型不再是“所有路径都从 `codexDir` 推导”。实现必须正式转为双路径模型：

- tool home 路径
- target Codex runtime 路径

这两个路径只在命令执行时被同时解析，但职责独立。

### 4.2 tool home 默认位置

本版固定默认 tool home：

- Windows：`~/.config/codex-switch`

旧的 `~/.codex-switch` 不再是默认主 home。本设计不要求自动读取、自动搬运或兼容保留旧 home 中的运行态数据。

### 4.3 `CodexPaths` 稳定语义

`createCodexPaths` 需要产出以下稳定语义：

- `toolHomeDir`
- `toolConfigPath`
- `providersPath`
- `backupsDir`
- `latestBackupPath`
- `lockPath`
- `runtimeDir`
- `runtimesDir`
- `codexDir`
- `configPath`
- `authPath`

其中：

- 由 tool home 派生：
  - `toolConfigPath`
  - `providersPath`
  - `backupsDir`
  - `latestBackupPath`
  - `lockPath`
  - `runtimeDir`
  - `runtimesDir`
- 由 target `codexDir` 派生：
  - `configPath`
  - `authPath`

### 4.4 tool home 文件职责

`0.0.11` 固定以下文件归属于 tool home：

- `codex-switch.json`
  - 工具级配置文件
- `providers.json`
  - provider registry SSOT
- `backups/`
  - managed mutation backups
- `runtime/`
  - runtime state，例如 `copilot-bridge-state.json`
- `runtimes/`
  - optional runtime install，例如 Copilot SDK
- lock 文件
  - `codex-switch` 写操作锁

### 4.5 target `codexDir` 文件职责

目标 `codexDir` 继续只承担目标 Codex runtime 文件：

- `config.toml`
- `auth.json`

这些文件继续被 `switch`、`status`、`doctor`、`config show` 等命令使用，但它们不再承载 `codex-switch` 自己的 registry、backup 或 lock 语义。

### 4.6 明确删除的旧语义

`0.0.11` design 必须明确删除以下旧叙述：

- `providers.json` 属于目标 `codexDir`
- `backups/` 属于目标 `codexDir`
- `codex-switch` lock 文件属于目标 `codexDir`
- runtime install 和 runtime state 可以散落在 tool home 之外
- `config.toml` / `auth.json` 承载 `codex-switch` registry 或 backup

### 4.7 开发期历史状态处理原则

对于旧版本遗留状态，本版采用手动处理原则，而不是自动兼容原则：

- 不自动迁移旧 `providers.json`
- 不自动迁移旧 `backups/`
- 不自动迁移旧 lock 文件
- 不自动迁移旧 `~/.codex-switch` runtime/state
- 若用户需要保留旧 provider，可手动重新 `add provider`
- 若用户需要保留旧备份，可手动拷贝或直接放弃

设计目标是避免把一次性过渡需求固化为长期维护逻辑。

## 5. Tool Config 设计

### 5.1 配置文件

新增工具级配置文件：

- `codex-switch.json`

它位于 tool home 根目录，是 tool-level config 的唯一稳定入口。

### 5.2 最小稳定字段

`0.0.11` 只固定最小稳定字段：

- `version`
- `defaultCodexDir`

其中：

- `version`
  - 记录 tool config 写入版本或格式版本元信息
- `defaultCodexDir`
  - 用于在未显式指定 `--codex-dir` 时，解析默认目标 Codex 目录

### 5.2.1 `defaultCodexDir` 写入策略

`0.0.11` 对 `defaultCodexDir` 的写入策略固定为：

- 只有当次命令显式传入 `--codex-dir` 时，`init` 才允许写入 `defaultCodexDir`
- 写入值仅限于用户显式传入的 `--codex-dir`
- 若 `codex-switch.json` 已存在，则 `init` 不覆盖已有 `defaultCodexDir`
- 若当次 `codexDir` 来自环境变量、已有 config、开发 sandbox 或 `~/.codex` fallback，则 `init` 不写入 `defaultCodexDir`
- 本版不引入单独的“set default codex dir”命令

这意味着 `defaultCodexDir` 在 `0.0.11` 中只持久化显式用户选择，不持久化解析链中的 fallback 值。开发 sandbox、`~/.codex` 或临时环境变量可以参与当前命令解析，但不会因为执行一次 `init` 就被固化成长期默认值。

### 5.3 明确不放进 `codex-switch.json` 的内容

本版明确不把以下内容放入 `codex-switch.json`：

- provider registry
- backup manifest
- per-upstream runtime 策略
- per-workspace / per-provider 路由规则
- 多 profile 编辑器语义

### 5.4 默认 `codexDir` 解析优先级

本版固定默认目标 `codexDir` 的解析优先级为：

1. `--codex-dir`
2. 环境变量 `CODEXS_CODEX_DIR`
3. `codex-switch.json.defaultCodexDir`
4. 开发环境默认 sandbox
5. `~/.codex`

这个优先级属于公开 contract，相关帮助文案、错误消息、`init` 结果和测试都必须使用同一顺序。

### 5.5 CLI 启动解析顺序

除了优先级之外，本版还固定命令启动阶段的解析顺序。实现必须按以下顺序进入命令逻辑：

1. 解析原始 CLI 参数与 flags
2. 先 resolve tool home
3. 读取 tool home 下的 `codex-switch.json`，若存在则校验其最小结构
4. 再基于以下优先级 resolve `codexDir`
   - `--codex-dir`
   - `CODEXS_CODEX_DIR`
   - `codex-switch.json.defaultCodexDir`
   - 开发环境默认 sandbox
   - `~/.codex`
5. 用已解析出的 `toolHomeDir` 与 `codexDir` 构造 `CodexPaths`
6. 命令 handler 只消费已经解析完成的 paths，不再各自重复推导默认 `codexDir`

这条顺序属于实现前提，而不是建议。否则 `defaultCodexDir` 会停留在文档字段层，无法稳定接入命令流。

## 6. `init` 详细设计

### 6.1 新语义

`init` 不再以“初始化某个 `codexDir/providers.json`”为核心，而应转为纯 tool-home 初始化命令：

- 确保 tool home 已初始化
- 确保 `codex-switch.json` 存在
- 确保 `providers.json` 存在

### 6.2 行为约束

`init`：

- 可以创建缺失的 tool home
- 可以创建缺失的 `providers.json`
- 可以创建缺失的 `codex-switch.json`
- 不解析 `config.toml` 或 `auth.json` 的存在性
- 不创建 target `codexDir`
- 不检查 target `codexDir` 是否存在
- 不写入任何 target runtime 文件

### 6.3 结果语义

`init` 成功结果必须能表达：

- tool home 是否新建
- tool config 是否新建
- provider registry 是否新建

当前旧结果中以 `createdCodexDir` / `configExists` / `authExists` 为中心的说法，需要在 `0.0.11` 中删除。`init` 的成功结果只描述 tool-home 初始化结果，不混入 target runtime 状态。

## 7. `login` 命令设计

### 7.1 命令面

新增命令：

- `codexs login <upstream>`

首版支持：

- `copilot`

可接受别名：

- `github-copilot`

内部二者归一为同一 upstream id。

### 7.2 命令定位

`login` 是 upstream auth / onboarding 命令，不是 provider mutation 命令。

因此它：

- 不写入 `providers.json`
- 不直接改写 `config.toml`
- 不直接改写 `auth.json`
- 不创建 provider
- 不删除 provider
- 不切换 active profile

### 7.3 非支持输入

首版 `login` 只接受已知 upstream 词汇。

未知 upstream 必须失败为 `INVALID_ARGUMENT` 或等价明确错误，而不是静默接受字符串后进入空分支。

### 7.4 TTY 边界

`login copilot` 只支持交互式 TTY。

因此：

- 非 TTY 调用失败
- `--json` 调用失败
- 失败必须明确说明该命令需要交互式登录环境

设计目标是避免“部分执行后才失败”的半吊子 contract。

## 8. `login copilot` 详细设计

### 8.1 成功定义

`login copilot` 成功的定义是：

- 本地 runtime 已可用
- Copilot auth readiness recheck 成功

它不要求：

- 创建 provider
- 修改 active profile
- 修改 `config.toml`
- 修改 `auth.json`

### 8.2 主流程

`login copilot` 的主流程固定为：

1. 确认当前为 TTY
2. 检查本地 Copilot SDK runtime 是否已安装
3. 缺失时询问是否立即安装 SDK
4. SDK 就绪后执行 auth readiness 检查
5. 若 auth 已就绪，则直接成功返回
6. 若 auth 未就绪，则检查系统级官方 `copilot` CLI 是否可用
7. CLI 可用时启动官方 `copilot login`
8. 登录返回后做一次显式 recheck
9. recheck 成功则返回成功；失败则返回明确错误与下一步提示

### 8.3 实现前提与职责拆分

`login copilot` 在 `0.0.11` 中依赖两个彼此独立的前提，它们不能混写为一个“本地 runtime”概念：

1. tool home 本地安装的 `@github/copilot-sdk`
   - 用于 auth readiness probe
   - 用于后续 bridge/runtime-backed provider 能力
   - 由 `codex-switch` 负责安装与探测
2. 系统级官方 `copilot` CLI
   - 用于执行真实的 `copilot login`
   - 不由 `codex-switch` 安装
   - 仍视为外部依赖

因此，本版明确选择以下模型：

- `codex-switch` 只安装和管理本地 Copilot SDK
- `codex-switch` 不安装官方 `copilot` CLI
- `login copilot` 的登录动作只通过系统级 `copilot login` 完成
- 若系统中没有可用的 `copilot` CLI，则命令失败并提示用户先自行安装官方 CLI

这也是 `0.0.11` 唯一可实现且与当前代码结构一致的模型。

### 8.4 官方 CLI 启动语义

`login copilot` 不存在“优先使用 tool home 本地 launcher”的语义，因为当前 tool home 安装物是 SDK，不是官方 CLI。

因此启动语义固定为：

1. SDK 缺失时，先处理 SDK 安装
2. SDK 存在但 auth 未就绪时，检查系统级 `copilot` CLI
3. 系统级 CLI 缺失则失败
4. 系统级 CLI 可用则执行 `copilot login`

设计上不要求：

- 在 tool home 内安装官方 `copilot` CLI
- 同时维护“本地官方 CLI + 系统官方 CLI”双来源
- 为 `login copilot` 增加第二套官方 launcher 管理逻辑

### 8.5 本地 runtime install 归属

Copilot SDK runtime install 必须归属于 tool home：

- 位于 `runtimes/` 下

Copilot runtime install 的公开叙述不能再使用 `~/.codex-switch` 作为当前主 home。这里的 runtime install 只指 SDK，不包含官方 `copilot` CLI。

### 8.6 交互式安装语义

当 SDK 缺失时：

- TTY 下可询问用户是否立即安装
- 用户确认后再安装
- 用户拒绝时命令终止，不继续进入 auth probe 或 launcher 流程

安装成功后必须立即执行 auth readiness probe，而不是等下游 `add --copilot` 或 `switch` 再发现缺 auth。

### 8.7 登录语义

当 auth readiness probe 失败时：

- 若系统级 `copilot` CLI 可用，则直接启动官方登录流程
- `codex-switch` 不托管 GitHub/Copilot token
- browser / device-code / 官方提示体验完全委托给官方 tooling

命令返回后必须做一次显式 recheck。`login copilot` 的成功不能只以“launcher 成功启动过”作为判据。

### 8.8 失败边界

至少要能清楚表达以下失败类型，并固定到明确的命令错误码：

- 当前非 TTY，无法完成交互式登录
- SDK 安装失败
- 系统级 `copilot` CLI 缺失
- `copilot login` 启动失败
- 登录返回后 recheck 仍未通过

这些失败必须继续沿用 CLI `error.code` 层，而不是塞进 `doctor.data.issues[]` 或 warning-only 路径。

### 8.9 `login copilot` 错误码 contract

本版把 `login copilot` 的关键失败固定为以下命令错误码：

- `COPILOT_LOGIN_REQUIRES_TTY`
  - 用于非 TTY 或 `--json` 调用 `login copilot`
- `COPILOT_SDK_INSTALL_FAILED`
  - 用于 SDK 安装失败
- `COPILOT_CLI_MISSING`
  - 用于系统级官方 `copilot` CLI 不可用
- `COPILOT_LOGIN_LAUNCH_FAILED`
  - 用于 `copilot login` 无法启动或退出非零
- `COPILOT_LOGIN_RECHECK_FAILED`
  - 用于 `copilot login` 返回后，auth readiness recheck 仍未通过

同时保留以下既有错误码语义：

- `COPILOT_SDK_MISSING`
  - 用于非 `login` 命令在前提检查阶段发现 SDK 缺失，例如 `add --copilot`、`switch`
- `COPILOT_AUTH_REQUIRED`
  - 用于非 `login` 命令在前提检查阶段发现 auth 未就绪，例如 `add --copilot`、`switch`
- `INVALID_ARGUMENT`
  - 用于未知 upstream、非法参数组合等普通参数错误，不再复用于 `login copilot` 的 TTY/launcher/recheck 失败

设计意图是把“参数错误”“前提缺失”“登录流程失败”三类问题彻底分开，避免实现者把不同失败随手塞回旧错误码。

## 9. `add --copilot` 语义调整

### 9.1 新定位

`0.0.11` 后，`add --copilot` 只负责：

- 创建 Copilot provider
- 验证 runtime / auth 前提
- 在前提满足时写入 provider registry

它不再负责：

- 安装 Copilot SDK
- 启动官方 Copilot login
- 编排完整安装 + 登录交互主流程

### 9.2 失败语义

当前提缺失时：

- 缺 runtime：
  - 返回 `COPILOT_SDK_MISSING`
  - 提示执行 `codexs login copilot`
- 缺 auth：
  - 返回 `COPILOT_AUTH_REQUIRED`
  - 提示执行 `codexs login copilot`

本版要求是把推荐主路径切到 `login copilot`，而不是继续把用户引导回旧的 `add --install-copilot-sdk`。

### 9.3 `--install-copilot-sdk`

`0.0.11` 的设计目标是让安装主流程退出 `add --copilot`，并把入口统一到 `login copilot`。因此本版对外语义固定为：

- `add --copilot --install-copilot-sdk` 不再执行 SDK 安装
- 该 flag 保留为兼容输入壳层，但命令必须直接失败
- 失败时使用明确错误，提示改用 `codexs login copilot`
- 帮助文案中不再把该 flag 描述为受支持主路径

本版不允许把该 flag 解释为：

- “仅安装 SDK”
- “继续安装 SDK 但不 login”
- “实现者可自行决定是否还生效”

设计选择已经固定：保留输入兼容壳层，但调用即报错并引导到 `login copilot`。

## 10. 历史状态与开发期兼容策略

### 10.1 不做自动迁移

`0.0.11` 不实现首次运行自动迁移，也不实现命令前自动迁移 preflight。

当前设计中，历史状态处理由用户自行决定：

- 手动删除旧状态
- 手动复制需要保留的文件
- 直接重新 `add provider`

### 10.2 不做兼容读写层

本版不要求：

- 读取旧 `codexDir/providers.json` 作为 fallback
- 读取旧 `codexDir/backups/` 作为 fallback
- 读取旧 `~/.codex-switch` runtime/state 作为 fallback
- 新旧路径双读
- 新旧路径双写
- 启动时冲突检测与自动修复

实现可以假定：一旦进入 `0.0.11` 开发模型，tool home 就是唯一有效管理态位置。

### 10.3 手动处理优先于代码兼容

如果旧状态与新布局不一致，本版推荐手动处理，而不是增加代码复杂度：

- provider 丢失可重新 `add provider`
- 旧 backup 可放弃，或由用户手动整理
- 旧 runtime/state 可直接清理

这一选择是开发阶段决策，不视为缺陷。

## 11. runtime state 与 runtime install 设计

### 11.1 runtime state 归属

Copilot bridge runtime state 必须明确归属于 tool home：

- 位于 `runtime/` 下

例如：

- `runtime/copilot-bridge-state.json`

### 11.2 runtime install 归属

Copilot SDK runtime install 必须明确归属于 tool home：

- 位于 `runtimes/` 下

例如：

- `runtimes/copilot/`

### 11.3 与 backup 的关系

runtime state 继续保持在 managed backup 事务外：

- backup 不承诺捕获 runtime state
- rollback 不承诺恢复 bridge 进程
- `status` / `doctor` 负责解释 runtime state 是否 missing、stale 或 mismatch

这条边界在 `0.0.11` 中继续保持，不因为路径迁移而重新引入 runtime-state 强事务承诺。

## 12. 命令影响面与最小兼容边界

### 12.1 必须保持可用的工作流

在新路径模型下，以下工作流必须保持行为稳定：

- direct provider add / edit / remove / switch
- backup / rollback
- `status`
- `doctor`
- `bridge start`
- `bridge stop`
- `bridge status`
- 端口恢复后 provider/config 投影写回

这里的“稳定”是指：在 `0.0.11` 新布局内可正常工作，而不是要求兼容旧布局数据。

### 12.2 direct provider 最小边界

本版虽然引入新的 tool home，但 direct provider 工作流不应回归。用户仍应能：

- 使用新 home 内的 provider registry
- 正常投影到目标 `config.toml`
- 正常写入或读取目标 `auth.json`

### 12.3 Copilot provider 最小边界

Copilot provider 继续保留当前 bridge / runtime 路由的核心语义，但其 install 与 login 入口改由 `login copilot` 承担。

这意味着：

- `switch` 仍是最终 runtime gate 权威入口
- `status` / `doctor` 仍可基于 active provider 输出 Copilot runtime 诊断
- `bridge` 命令族仍使用同一 runtime-state 与 provider binding 模型

### 12.4 帮助与文案调整

帮助文案、CLI usage、错误建议必须统一到以下主叙述：

- `login` 是 upstream onboarding 命令
- `add --copilot` 不再承担 install/login 主流程
- 当缺 runtime 或 auth 时，下一步推荐为 `codexs login copilot`

### 12.5 开发版本语义

从现在开始到用户手动确认 release 之前，所有版本都按开发版本处理，包括名义上的 `0.1.0`。

因此本版不为了“未来可能发布”而提前加入：

- 自动迁移
- 发布期兼容垫层
- 面向外部用户的平滑升级逻辑
- 仅为历史版本数据保留的复杂兜底路径

## 13. 错误语义与公开契约

### 13.1 两层语义继续保留

本版继续保持两层语义：

- CLI command failure `error.code`
- `doctor` / `status` 中的 `issues[]`

二者不混为同一错误空间。

### 13.2 本版重点命令错误

本版重点涉及或需要继续保持清晰的错误语义包括：

- `COPILOT_LOGIN_REQUIRES_TTY`
- `COPILOT_SDK_MISSING`
- `COPILOT_AUTH_REQUIRED`
- `COPILOT_SDK_INSTALL_FAILED`
- `COPILOT_SDK_UNSUPPORTED`
- `COPILOT_CLI_MISSING`
- `COPILOT_LOGIN_LAUNCH_FAILED`
- `COPILOT_LOGIN_RECHECK_FAILED`
- `INVALID_ARGUMENT`

这些命令面错误不要求并入 `src/domain/errors.ts` 的统一错误码集合。对于 `login copilot` 这类交互式集成流程，可以独立定义命令专用错误族；只要对外 `error.code` contract 清晰稳定即可。

### 13.3 本版固定的公开契约

`0.0.11` design 需要显式固定以下对外契约：

- `providers.json`、`backups/`、runtime state、runtime install 均属于 tool home
- `config.toml` 与 `auth.json` 继续属于目标 Codex runtime
- `codex-switch.json` 是工具级配置文件，不承载 provider registry
- 默认目标 `codexDir` 解析优先级固定为：
  - `--codex-dir`
  - `CODEXS_CODEX_DIR`
  - `codex-switch.json.defaultCodexDir`
  - 开发环境默认 sandbox
  - `~/.codex`
- `login` 是 upstream onboarding 命令，不是 provider mutation 命令
- `login copilot` 的登录动作只通过系统级 `copilot login` 完成
- `login copilot` 在已登录时不重复启动官方登录
- `add --copilot` 缺少 runtime/auth 前提时，应明确引导到 `codexs login copilot`
- 旧布局状态不属于 `0.0.11` 自动兼容范围

## 14. 模块设计与代码落点

本版按行为分组说明代码落点，而不是逐文件抄清单。

### 14.1 路径与 tool config

主要落点：

- `src/storage/codex-paths.ts`
- `src/storage/tool-config-repo.ts`

职责：

- 固定双路径模型
- 解析默认 tool home
- 解析默认 `codexDir`
- 维护 `codex-switch.json` 的最小稳定 contract
- 清理不再需要的旧路径推导语义

### 14.2 路径切换与命令前置假设

主要落点：

- 命令入口统一路径解析
- 最小化 legacy helper 清理或删除

职责：

- 让命令统一使用新 tool home 路径
- 删除或停用不再需要的旧路径推导语义
- 不引入自动迁移、冲突探测或 fallback 兼容层

### 14.3 `init` 与 provider mutation

主要落点：

- `src/app/init-codex.ts`
- `src/app/add-provider.ts`
- 相关 mutation helper

职责：

- 把 `init` 从 `codexDir/providers.json` 初始化语义改为 tool-home 初始化语义
- 让 `add --copilot` 只负责前提校验与 provider 写入
- 让 direct provider 路径继续沿用既有 config/auth projection 模型

### 14.4 Copilot onboarding 与 runtime

主要落点：

- `src/commands/handlers.ts`
- `src/commands/registry.ts`
- `src/runtime/copilot-installer.ts`
- `src/runtime/copilot-cli.ts`
- `src/runtime/copilot-adapter.ts`
- runtime-state / bridge helper

职责：

- 新增 `login copilot` 命令和帮助文案
- 执行 runtime install / auth probe / system `copilot login` / recheck 流程
- 统一 `login copilot` 相关错误语义
- 保持 bridge lifecycle 与 runtime-backed provider 运行态逻辑一致

### 14.5 状态、诊断与恢复

主要落点：

- `src/app/get-status.ts`
- `src/app/run-doctor.ts`
- `src/storage/backup-repo.ts`
- `src/app/rollback-backup.ts`

职责：

- 更新 storage 路径叙述到新 tool home 模型
- 保持 runtime state 安全读取
- 保持 backup/rollback 在新 home 下的稳定语义

## 15. 测试设计

### 15.1 路径与初始化

至少覆盖：

- `init` 首次运行创建 tool home
- `init` 创建 `codex-switch.json`
- `init` 创建 `providers.json`
- `defaultCodexDir` 生效
- `--codex-dir` 覆盖 `defaultCodexDir`
- `CODEXS_CODEX_DIR` 覆盖 `defaultCodexDir`

### 15.2 历史状态非兼容策略

至少覆盖：

- 新布局下不读取旧 `codexDir/providers.json`
- 新布局下不读取旧 `codexDir/backups/`
- 新布局下不读取旧 `~/.codex-switch` runtime/state
- 命令在新 tool home 缺少状态时按空状态或正常缺失路径处理，而不是尝试自动迁移

### 15.3 `login copilot`

至少覆盖：

- TTY 下缺 runtime 时的安装确认流
- runtime 已安装且 auth 已就绪时直接成功
- 系统级 `copilot` CLI 缺失时失败语义
- `copilot login` 启动失败时失败语义
- 登录返回后 recheck 失败
- 非 TTY 调用失败

### 15.4 `add --copilot`

至少覆盖：

- 缺 runtime 返回 `COPILOT_SDK_MISSING`
- 缺 auth 返回 `COPILOT_AUTH_REQUIRED`
- 错误建议指向 `codexs login copilot`
- 不再通过 `add --copilot` 自动完成安装与官方登录主流程

### 15.5 兼容性回归

至少覆盖：

- direct provider `add` / `edit` / `remove` / `switch` 不回归
- `backups list` / `rollback` 在新 home 下路径正确
- `status` / `doctor` 的 storage 边界更新到新模型
- `bridge start` / `bridge stop` / `bridge status` 使用新的 runtime state 路径

## 16. 明确不做的事

`0.0.11` design 明确不引入以下能力：

- Gemini / DeepSeek / 其他 upstream 的真实 runtime 或登录流程
- `logout`
- 完整 `auth` 子命令族
- 将 `config.toml` / `auth.json` 迁出目标 `codexDir`
- package manager / plugin manager 产品化
- 多 workspace / 多 profile 的复杂工具级策略编辑器
- 长期双写、双读或自动回退到旧 layout 的兼容协议
- 首次运行自动迁移

## 17. 完成标准

`0.0.11` 的完成标准不是“多了一个 `login copilot` 命令”，而是以下条件同时成立：

1. `codex-switch` 拥有稳定独立的 tool home 边界。
2. `providers.json`、backups、runtime state、runtime install 全部有清晰且一致的归属。
3. `login` 与 provider mutation 的职责边界已经拆开。
4. 旧状态不需要自动兼容，手动处理路径清晰且不会把一次性需求固化成长期逻辑。
5. direct provider 与 Copilot provider 现有主工作流在新模型下不回归。

只有在这个基础上，后续多 upstream、多 runtime、甚至多 CLI 生态扩展，才不会继续被旧路径和旧职责模型拖累。
