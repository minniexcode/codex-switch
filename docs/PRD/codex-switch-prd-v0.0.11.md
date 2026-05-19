# codex-switch `0.0.11` PRD

## 文档信息

- 状态：Active PRD
- 产品名：`codex-switch`
- CLI 命令名：`codexs`
- 当前基线版本：`0.0.10`
- 目标版本：`0.0.11`
- 文档定位：定义 `0.0.10 -> 0.0.11` 的直接需求范围
- 关联 roadmap：[`../Design/codex-switch-v0.0.9-to-v0.0.12-roadmap.md`](../Design/codex-switch-v0.0.9-to-v0.0.12-roadmap.md)
- 关联上一版 PRD：[`./codex-switch-prd-v0.0.10.md`](./codex-switch-prd-v0.0.10.md)

## 一句话定义

`0.0.11` 把 `codex-switch` 从“依附在某个 Codex 目录中的 provider 管理工具”升级为“拥有独立管理态 home、并开始抽象 upstream login 的本地 provider/router 管理器”。

## 版本定位

`0.0.11` 不是只补一个 `login` 命令，也不是只把几个路径改掉。

它是一次结构性版本，目标是把 `codex-switch` 自己的管理态存储正式从 `~/.codex` 的语义里拆出来，形成稳定的工具级 home 边界，同时把上游登录从 `add --copilot` 中抽离为独立命令面。

本版要解决的不是单个实现细节，而是以下几个长期模型问题：

- `providers.json` 和 `backups/` 仍绑在 `codexDir` 下，混淆了“工具状态”和“目标 Codex runtime 状态”
- Copilot runtime install / runtime state 已经部分落在 `~/.codex-switch`，但 registry 仍在 `~/.codex`，边界不一致
- `add --copilot` 同时承担 install、auth check、login 引导和 provider 写入，职责过重
- 如果未来扩展更多 upstream 或 CLI/runtime，继续把工具管理态塞进 `codexDir` 会让模型持续恶化

## 产品定义

### 核心定义

`0.0.11` 将 `codex-switch` 定位为：

- 有独立 tool home 的本地 provider 管理器
- 面向目标 Codex runtime 投影配置的工具
- 可扩展到多 upstream 的登录与 runtime 编排入口

### 本版目标

- 固定 `codex-switch` 独立 home 目录结构
- 将管理态文件与目标 Codex runtime 文件彻底分层
- 把上游登录抽成独立命令 `codexs login <upstream>`
- 为未来多 upstream / 多 CLI 生态扩展预留稳定边界
- 本版只真实落地 Copilot upstream

## In Scope

- 新增默认 home：Windows 使用 `~/.config/codex-switch`
- 新增最小工具级配置文件：`codex-switch.json`
- 将 `providers.json`、`backups/`、lock 文件迁移到新 home
- 将 Copilot runtime install 与 runtime state 明确纳入新 home 结构
- 新增 `codexs login <upstream>`，首版支持 `copilot`
- 支持 `github-copilot` 作为 `copilot` 的别名
- 调整 `add --copilot` 语义，移除其内置安装 / 登录主流程
- 同步更新帮助、文档、错误语义和测试

## Out of Scope

- 一次性落地 Gemini / DeepSeek / 其他 upstream 的真实 runtime 或登录流程
- 新增 `logout`
- 新增完整 `auth` 子命令族
- 将 `config.toml` / `auth.json` 从目标 Codex 目录迁出
- 通用 package manager / plugin manager 能力
- 多 workspace / 多 profile 的复杂工具级策略编辑器
- GUI / daemon / 后台服务化

## 当前版本问题

### 1. 工具管理态与目标 runtime 状态混放

当前模型下，`providers.json`、`backups/`、lock 仍默认跟随 `codexDir`。这在语义上暗示这些文件属于某个单独 Codex runtime，但实际上它们描述的是 `codex-switch` 自己的受管状态。

### 2. Copilot runtime 相关文件边界不一致

Copilot SDK install 和 bridge runtime state 已经逐步落到 `~/.codex-switch` 一类工具目录，但 provider registry 仍留在目标 `codexDir` 下，导致：

- 同一类管理态文件散落两处
- 备份与恢复边界难以解释
- 文档和用户心智模型不断漂移

### 3. `add --copilot` 职责过载

当前 Copilot onboarding 流程中，`add --copilot` 可能承担：

- SDK 是否存在的判断
- SDK 安装
- auth readiness 检查
- 官方登录引导
- provider registry 写入

这导致一个“provider mutation”命令承担了不属于 registry mutation 的上游登录编排责任。

### 4. 缺少稳定的工具级配置层

当前缺少一个明确的工具级配置文件来记录：

- 默认目标 Codex 目录
- tool home 级别的稳定元数据

结果是默认 Codex 目录解析只能依赖 CLI 参数、环境变量和硬编码回退，缺少正式的工具配置入口。

## 设计原则

`0.0.11` 必须遵循以下原则：

1. 工具管理态与目标 runtime 状态严格分层。
2. `providers.json` 是 `codex-switch` tool home 内的管理态 SSOT，不再属于任何单个 `codexDir`。
3. `config.toml` 与 `auth.json` 继续属于目标 Codex runtime，不承载 `codex-switch` 的 registry 或 backup。
4. 上游登录是 onboarding / auth 能力，不是 provider mutation 能力。
5. 当前开发阶段优先最小实现，不为一次性历史状态引入自动迁移或长期兼容层。
6. 本版只落地 Copilot，但命令与目录模型必须为未来更多 upstream 留出扩展位。

## 存储模型

### 默认 tool home

`0.0.11` 固定 `codex-switch` tool home 默认路径：

- Windows：`~/.config/codex-switch`

本版不继续沿用 `~/.codex-switch` 作为主 home。本版不要求自动迁移旧 home 中的 runtime/state。

### tool home 目录职责

`0.0.11` 固定以下目录与文件职责：

- `codex-switch.json`
  - 工具级配置文件
- `providers.json`
  - 管理态 provider registry SSOT
- `backups/`
  - managed mutation backups
- `runtime/`
  - runtime state，例如 `copilot-bridge-state.json`
- `runtimes/`
  - 上游 runtime 安装目录，例如 Copilot SDK
- `.lock` 或等价 lock 文件
  - `codex-switch` 写操作锁

### 目标 Codex 目录职责

目标 `codexDir` 继续只承担目标 Codex runtime 文件：

- `config.toml`
- `auth.json`

### 明确删除的旧语义

本版明确删除以下旧叙述：

- `providers.json` 属于目标 Codex 目录
- `backups/` 属于目标 Codex 目录
- `codex-switch` 的 lock 文件属于目标 Codex 目录
- `config.toml` / `auth.json` 承载 `codex-switch` registry 或 backups

## Tool Config Contract

### 配置文件

新增工具级配置文件：

- `codex-switch.json`

### 本版最小稳定字段

`0.0.11` 只固定最小稳定字段：

- `version`
- `defaultCodexDir`

### 字段语义

- `version`
  - 记录工具配置文件格式或写入版本元信息
- `defaultCodexDir`
  - 用于未显式传 `--codex-dir` 时，决定默认目标 Codex 目录

### `defaultCodexDir` 写入策略

本版固定：

- 只有当次命令显式传入 `--codex-dir` 时，`init` 才允许写入 `defaultCodexDir`
- 写入值仅限于用户显式传入的 `--codex-dir`
- 若配置文件已存在，则 `init` 不覆盖已有 `defaultCodexDir`
- 若当次 `codexDir` 来自环境变量、已有 config、开发 sandbox 或 `~/.codex` fallback，则 `init` 不写入 `defaultCodexDir`
- 本版不引入单独的默认目录设置命令

### 默认目标 Codex 目录解析优先级

本版固定 CLI 解析优先级为：

1. `--codex-dir`
2. 环境变量 `CODEXS_CODEX_DIR`
3. `codex-switch.json.defaultCodexDir`
4. 开发环境默认 sandbox
5. `~/.codex`

### CLI 启动解析顺序

本版同时固定命令启动顺序：

1. 解析 CLI 参数与 flags
2. 先 resolve tool home
3. 读取并校验 `codex-switch.json`
4. 再按既定优先级 resolve `codexDir`
5. 构造完整 `CodexPaths`
6. 命令逻辑只消费已解析完成的 paths

### 本版明确不做的事

- 不在 `codex-switch.json` 中引入 per-upstream 复杂策略
- 不在 `codex-switch.json` 中引入 per-workspace / per-provider 规则
- 不把 provider registry 塞回 `codex-switch.json`

## CLI Changes

### 新增命令

新增命令：

- `codexs login <upstream>`

### v1 upstream 词汇

首版支持：

- `copilot`

可接受别名：

- `github-copilot`

内部二者归一为同一 upstream id。

### `login` 命令定位

`login` 是 upstream auth / onboarding 命令，不是 provider mutation 命令。

因此它：

- 不写入 `providers.json`
- 不直接改写 `config.toml`
- 不直接改写 `auth.json`
- 不创建或删除 provider

### `login copilot` 行为

`login copilot` 的主流程固定为：

1. 仅支持 TTY
2. 检查本地 Copilot SDK runtime 是否已安装
3. 缺失时询问是否立即安装 SDK
4. SDK 就绪后检查 auth readiness
5. 若已登录，则直接返回成功，不重复启动官方登录
6. 若未登录，则检查系统级官方 `copilot` CLI 是否可用
7. CLI 可用时启动官方 `copilot login`
8. 登录返回后执行一次显式 recheck
9. recheck 成功则完成；失败则返回明确错误与下一步提示

### SDK 与官方 CLI 的职责分离

本版固定以下模型：

- tool home 本地安装物是 `@github/copilot-sdk`
- `codex-switch` 只负责安装和探测本地 SDK
- 官方 `copilot` CLI 不由 `codex-switch` 安装
- `login copilot` 的真实登录动作只通过系统级 `copilot login` 完成
- 若系统中没有可用的 `copilot` CLI，则命令失败并提示用户自行安装官方 CLI

### `add --copilot` 新语义

`0.0.11` 后，`add --copilot` 只负责：

- 创建 Copilot provider
- 验证必要 runtime / auth 前提已满足
- 在满足前提时写入 provider registry

它不再负责：

- 安装 Copilot SDK
- 启动官方 Copilot login
- 用交互方式编排安装与登录全流程

### `add --copilot` 失败语义

当缺少前提时：

- 缺 runtime：
  - 返回 `COPILOT_SDK_MISSING`
  - 提示执行 `codexs login copilot`
- 缺 auth：
  - 返回 `COPILOT_AUTH_REQUIRED`
  - 提示执行 `codexs login copilot`

### `--install-copilot-sdk`

本版目标是让安装主流程从 `add --copilot` 中退出。因此：

- `add --copilot --install-copilot-sdk` 不再执行 SDK 安装
- 该 flag 保留为兼容输入壳层，但命令必须直接失败
- 失败时明确提示改用 `codexs login copilot`
- 文档和帮助文案必须把用户引导到 `codexs login copilot`

## `init` 语义调整

### 新语义

`init` 不再以“创建 `codexDir/providers.json`”为核心。

它应转为：

- 确保 tool home 已初始化
- 确保 `codex-switch.json` 与 `providers.json` 的最小存在性

### 结果语义

`init` 的成功结果应能解释：

- tool home 是否新建
- tool config 是否新建
- provider registry 是否新建

## 路径与架构变化

### 双路径模型

`createCodexPaths` 需要从“所有路径都由 `codexDir` 派生”的模型，重构为：

- tool home 路径
- 目标 Codex 路径

双路径模型。

### 需要统一迁移的接口语义

以下接口或字段不再应由 `codexDir` 推导：

- `providersPath`
- `backupsDir`
- `latestBackupPath`
- lock 文件路径
- runtime install 路径
- runtime state 路径

这些都应由 tool home 提供。

### 继续由目标 `codexDir` 提供的路径

以下路径继续属于目标 Codex runtime：

- `configPath`
- `authPath`

### lock 迁移

写锁从：

- `codexDir/.codex-switch.lock`

迁移到：

- tool home 下的 lock 文件

### backup 迁移

备份根目录从：

- `codexDir/backups`

迁移到：

- tool home 的 `backups/`

## 历史状态处理策略

### 开发期原则

本版不实现首次运行自动迁移，也不实现命令前自动迁移检查。

### 手动处理范围

对于旧布局状态：

- 不自动迁移旧 `providers.json`
- 不自动迁移旧 `backups/`
- 不自动迁移旧 lock 文件
- 不自动迁移旧 `~/.codex-switch` runtime/state

用户可自行：

- 手动删除旧状态
- 手动复制仍需保留的文件
- 直接重新 `add provider`

## Copilot Runtime And Login

### Runtime install 归属

Copilot runtime install 必须明确归属于 tool home：

- 位于 `runtimes/` 下

### Runtime state 归属

Copilot bridge runtime state 必须明确归属于 tool home：

- 位于 `runtime/` 下

### `login copilot` 的成功定义

`login copilot` 成功的定义是：

- 本地 runtime 已可用
- auth readiness recheck 成功

它不要求：

- 创建 provider
- 切换 active profile
- 修改当前 `config.toml`

### `login copilot` 的失败边界

至少要能清楚表达以下失败类型：

- 当前非 TTY，无法完成交互式登录
- SDK 安装失败
- 系统级 `copilot` CLI 缺失
- `copilot login` 启动失败
- 登录返回后 recheck 仍未通过

## Compatibility Goals

### 需要保持稳定的工作流

在新路径模型下，以下工作流需要保持行为稳定：

- direct provider add / edit / remove / switch
- backup / rollback
- `status`
- `doctor`
- `bridge start`
- `bridge stop`
- `bridge status`
- 端口恢复后 provider/config 投影写回

### 对 direct provider 的要求

本版虽然引入新的 tool home，但 direct provider 工作流不应出现行为回归。用户仍应能：

- 使用新 home 内的 provider registry
- 正常投影到目标 `config.toml`
- 正常写入或读取目标 `auth.json`

### 对 Copilot provider 的要求

Copilot provider 仍应保留当前 bridge / runtime 路由的核心语义，但其 install 与 login 入口改由 `login copilot` 承担。

## 错误语义

### 命令错误与诊断 issue 分层

本版继续保持两层语义：

- CLI command failure `error.code`
- `doctor` / `status` 中的 `issues[]`

二者不混为同一错误空间。

### 本版重点命令错误

本版重点涉及或需要保持清晰的错误语义包括：

- `COPILOT_LOGIN_REQUIRES_TTY`
- `COPILOT_SDK_MISSING`
- `COPILOT_AUTH_REQUIRED`
- `COPILOT_SDK_INSTALL_FAILED`
- `COPILOT_SDK_UNSUPPORTED`
- `COPILOT_CLI_MISSING`
- `COPILOT_LOGIN_LAUNCH_FAILED`
- `COPILOT_LOGIN_RECHECK_FAILED`
- `INVALID_ARGUMENT`

### `add --copilot` 的推荐下一步

当 `add --copilot` 因 runtime / auth 前提不足失败时，错误 details 或消息中应清楚提示：

- `codexs login copilot`

而不是再把用户引导回旧的 `add --install-copilot-sdk` 主流程。

## 公共契约

本版 PRD 需要显式固定以下对外契约：

- `providers.json`、`backups/`、runtime state、runtime install 均属于 tool home
- `config.toml` 与 `auth.json` 继续属于目标 Codex runtime
- `codex-switch.json` 是工具级配置文件，不承载 provider registry
- 默认目标 Codex 目录解析优先级为：
  - `--codex-dir`
  - `CODEXS_CODEX_DIR`
  - `codex-switch.json.defaultCodexDir`
  - 开发环境默认 sandbox
  - `~/.codex`
- `login` 是 upstream auth / onboarding 命令，不是 provider mutation 命令
- `login copilot` 的登录动作只通过系统级 `copilot login` 完成
- `add --copilot` 在缺 runtime / 缺 auth 时只失败并给出下一步，不再承担安装/登录编排
- 旧布局状态不属于 `0.0.11` 自动兼容范围

## 验收标准

达到以下条件时，`0.0.11` 可以认为完成：

- 默认运行后，`providers.json`、`backups/`、runtime state、runtime install 都位于 `~/.config/codex-switch`
- `config.toml` 与 `auth.json` 仍位于目标 `codexDir`
- 未传 `--codex-dir` 时，CLI 能按新的优先级稳定解析目标 Codex 目录
- `init` 只初始化 tool home，不混入 target runtime 检查
- `login copilot` 在缺 SDK 时能完成 SDK 安装引导
- `login copilot` 在缺 auth 且系统级 `copilot` CLI 可用时能启动官方登录
- `login copilot` 在已登录时不重复启动官方登录
- `add --copilot` 在缺 runtime / 缺 auth 时不再尝试安装或登录，只返回清楚下一步
- `switch`、`doctor`、`status`、`rollback` 在新路径模型下语义保持稳定
- 现有 direct provider 与 Copilot provider 工作流无行为回归

## 测试重点

### 路径解析

- 默认 tool home 解析到 `~/.config/codex-switch`
- `defaultCodexDir` 生效
- `--codex-dir` 覆盖 config 默认值
- `CODEXS_CODEX_DIR` 覆盖 tool config 默认值

### 存储初始化

- `init` 创建 `codex-switch.json`
- `init` 创建空 `providers.json`
- `init` 自动写入 `defaultCodexDir`
- 新 home 下 lock / backups / runtime / runtimes 目录按需创建

### `login copilot`

- SDK 缺失时可确认安装
- 已登录时不重复启动官方登录
- 未登录时通过系统级 `copilot login` 启动登录
- 系统级 `copilot` CLI 缺失时返回明确错误
- `copilot login` 启动失败时返回明确错误
- recheck 失败时返回明确错误

### `add --copilot`

- 缺 runtime 返回 `COPILOT_SDK_MISSING` 并提示 `codexs login copilot`
- 缺 auth 返回 `COPILOT_AUTH_REQUIRED` 并提示 `codexs login copilot`
- 不再通过 `add` 驱动安装 / 登录主流程

### 回归

- direct provider add / edit / remove / switch
- backup / rollback
- `status` / `doctor`
- `bridge start` / `stop` / `status`
- 端口恢复后 provider/config 投影写回

## 文档任务

- 新增本 PRD：`docs/PRD/codex-switch-prd-v0.0.11.md`
- 更正文档中所有“`providers.json` / `backups` 位于 `~/.codex`”的旧叙述
- 更正文档中所有“`add --copilot` 负责安装/登录编排”的旧叙述
- 明确 `login` 是 upstream onboarding 命令，不是 provider mutation 命令
- 明确 `config.toml` / `auth.json` 属于目标 Codex runtime

## 结论

`0.0.11` 的完成标准，不是“多了一个 `login copilot` 命令”，而是 `codex-switch` 终于拥有稳定、独立、可迁移的工具级 home 边界，并把上游登录从 provider 写操作里解耦出来。只有在这个基础上，后续多 upstream、多 runtime、甚至多 CLI 生态扩展，才不会继续被旧的路径和职责模型拖累。
