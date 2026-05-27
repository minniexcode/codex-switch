# codex-switch 技术架构设计

> 状态说明：这份文档是历史跨版本参考，不是当前 release contract。
> 当前事实源请改看 [`docs/cli-usage.md`](./cli-usage.md)、[`docs/PRD/codex-switch-prd-v0.1.0.md`](./PRD/codex-switch-prd-v0.1.0.md)、[`docs/Design/codex-switch-v0.1.0-design.md`](./Design/codex-switch-v0.1.0-design.md)。

## 文档信息

- 文档类型：技术架构设计文档
- 适用范围：`codex-switch` MVP / CLI First
- 对应产品文档：
  - [`codex-switch-product-overview.md`](./codex-switch-product-overview.md)
  - [`codex-switch-product-research.md`](./codex-switch-product-research.md)
  - [`PRD/codex-switch-prd.md`](./PRD/codex-switch-prd.md)
  - [`codex-switch-command-design.md`](./codex-switch-command-design.md)

## 1. 文档目标

这份文档用于把 `codex-switch` 当前已经实现的技术架构、代码组织、核心流程和设计取舍完整沉淀下来，作为后续维护、扩展和协作开发的基线。

它回答的不是“产品要做什么”，而是下面这些工程问题：

- 当前代码是如何分层的
- 每一层分别负责什么、不负责什么
- CLI 命令是如何被解析、执行和输出的
- 配置文件、备份、回滚和错误码是如何落到代码里的
- 模块之间的依赖关系是什么
- 核心流程的时序是什么
- 测试如何组织
- 后续如果新增命令、扩展数据模型或做 GUI / MCP / daemon，应沿着什么方向演进

## 2. 设计输入与参考

### 2.1 当前项目输入

`codex-switch` 的架构设计主要由以下输入共同约束：

- 产品目标：本地优先、默认安全、对 AI 友好的 provider/profile 切换 CLI
- PRD 约束：固定命令面、统一 JSON 输出、固定错误码、写操作必须备份、失败必须回滚
- 技术路线：Node.js + TypeScript
- 使用对象：本地 `~/.codex/` 目录，而不是云端控制面

### 2.2 对 `codex-auth` 的借鉴

根据 `codex-auth` 当前公开 README 和命令文档入口，它是一个已经产品化的 CLI-first 工具，优势主要在下面几类工程实践：

- 命令家族清晰：`list` / `login` / `switch` / `remove` / `status` / `import` / `config`
- npm 全局分发路径成熟，同时支持 `npx`
- 明确区分交互式能力和自动化可调用能力
- 文档按命令组织，降低学习和调用成本

`codex-switch` 借鉴的是这些“CLI 产品化方法”，但没有复制它的多账号体系、远程 usage 刷新、后台 auto-switch 等更重的职责。

### 2.3 对 `cc-switch` 的借鉴

根据 `cc-switch` 当前公开 README，它是一个跨平台的桌面 All-in-One 管理器，目标覆盖：

- Claude Code
- Codex
- Gemini CLI
- OpenCode
- OpenClaw
- Hermes Agent

其公开设计信息显示：

- 技术栈是 `React + TypeScript + Tauri + Rust`
- 前端与后端通过 Tauri IPC 通信
- 后端采用明确的分层：`Commands -> Services -> Database/Models`
- 数据层采用 SQLite 作为单一事实源，并配合 JSON 做设备级配置
- 具备桌面 GUI、系统托盘、云同步、用量统计、Session Manager、Proxy 等更重能力

对 `codex-switch` 的借鉴点主要有：

- 清晰的分层表达
- 文档中直接公开架构总览和项目结构
- 命令/服务/数据层职责拆分明确
- 把“管理器”能力和“切换器”能力区分成不同模块

不直接照搬的点也很明确：

- `cc-switch` 是桌面应用优先，`codex-switch` 是 CLI-first
- `cc-switch` 的职责明显更广，包含云同步、会话管理、代理模式、统计面板等
- `cc-switch` 的 SQLite + GUI 方案适合 All-in-One manager，不适合当前这个轻量本地切换工具的 MVP

因此，`codex-switch` 在架构上更适合借鉴它的“分层清晰度”和“工程表达方式”，而不是直接复制它的技术栈和能力范围。

## 3. 架构总览

### 3.1 核心设计原则

当前实现严格围绕下面五个原则组织：

- `CLI First`
  - 核心能力全部通过命令完成
- `Local First`
  - 主对象是本地文件，不依赖远程控制面
- `Safe by Default`
  - 所有写操作先备份，失败后回滚
- `AI Friendly`
  - 关键命令支持统一 JSON envelope
- `Low Coupling`
  - 参数解析、业务编排、文件访问、错误模型彼此解耦
- `Split State Model`
- `providers.json` 是管理态事实源，`config.toml` 是运行态路由文件，`auth.json` 是 direct provider 的认证投影
- `Lightweight Transactions`
  - 单次写操作要有锁、备份、回滚边界

### 3.2 分层结构

当前代码采用 4 层结构：

```text
CLI 层
  负责参数解析、命令分发、输出渲染、进程退出语义

Application 层
  负责单个用例的编排流程，例如 switch / import / rollback

Domain 层
  负责数据模型、规则校验、错误码和纯函数逻辑

Infrastructure 层
  负责文件系统、路径、备份持久化、子进程调用
```

这四层的边界是当前架构最重要的维护基础。

当前实现还明确区分三类状态对象：

- 管理态单一事实源：`providers.json`
- 运行态路由：`config.toml`
- 当前 active direct provider 的认证投影：`auth.json`
- 回滚态：`backups/latest.json` 和对应 manifest

这意味着未来即使引入 GUI / MCP / HTTP 适配层，核心同步目标仍然是 runtime files，而不是把 runtime files 本身当成长期管理数据库。

`0.0.6` 的实现边界还需要区分“逻辑主层”和“兼容层”：

- 逻辑主层已经迁移到 `src/commands/`、`src/interaction/`、`src/storage/`、`src/runtime/`
- `src/cli/` 和 `src/infra/` 当前主要承担兼容 re-export 与入口收敛职责
- 这意味着 `0.0.6` 的完成标准是“边界和契约已经统一”，而不是“所有旧路径文件都物理删除”
- 后续版本可以在兼容窗口结束后继续删除旧 facade，但这不属于 `0.0.6` 的必须交付范围

### 3.3 模块依赖图

当前代码依赖关系可以抽象为：

```text
                +----------------------+
                |      CLI Layer       |
                |  cli.ts / cli/*      |
                +----------+-----------+
                           |
                           v
                +----------------------+
                |   Application Layer  |
                |    app/* use cases   |
                +----------+-----------+
                           |
            +--------------+--------------+
            |                             |
            v                             v
  +----------------------+      +----------------------+
  |     Domain Layer     |      | Infrastructure Layer |
  | rules / schema / err |      | fs / path / process  |
  +----------------------+      +----------------------+
```

依赖方向约束：

- `cli` 可以依赖 `app`、`domain`、`infra`
- `app` 可以依赖 `domain`、`infra`
- `infra` 可以依赖 `domain`
- `domain` 不依赖其他项目层

这保证领域规则不会反向耦合到 CLI 或具体文件系统实现。

### 3.4 命令调用生命周期

所有命令大体遵循同一个生命周期：

```text
argv
  -> parseArgs
  -> create CommandContext
  -> executeCommand
  -> app use case
  -> infra/domain collaboration
  -> CommandResult / CliErrorShape
  -> output renderer
  -> stdout/stderr + exitCode
```

这条链路的工程价值在于：

- 参数解析和业务行为分离
- 成功输出和失败输出统一渲染
- 业务层不直接操作终端
- CLI 层测试可以只验证 envelope 和渲染，而不重测业务细节

## 4. 代码目录与职责

当前目录结构如下：

```text
src/
  cli.ts
  commands/
  interaction/
  app/
  cli/
  domain/
  runtime/
  infra/
  storage/

tests/
  app.spec.js
  cli.spec.js
  domain.spec.js
  helpers.js
  run-tests.js

scripts/
  build.cjs
```

### 4.1 `src/cli.ts`

入口文件，只做三件事：

- 接收 `process.argv`
- 调用参数解析
- 根据命令分发到对应 use case，并调用输出渲染

它不直接做文件读写，不直接写业务逻辑，也不直接实现备份或校验规则。

### 4.2 `src/commands/`

这一层是 `0.0.6` 新增的命令表面层，负责把“公开 CLI 形态”收敛为单一 registry。

它承担的职责是：

- 定义每个命令的公开 token 形态，例如 `config show`、`config list-profiles`、`backups list`
- 统一保存 `summary`、`usage`、`details`、`examples`
- 绑定 command handler，供 dispatch 直接执行
- 让 help、解析和 dispatch 共享同一份事实源

它不负责：

- 具体文件读写
- prompt 交互细节
- human output 渲染

### 4.3 `src/interaction/`

这一层是 `0.0.6` 中显式抽出的交互层，负责所有 CLI 级 prompt 组合逻辑。

它承担的职责是：

- 判断哪些路径允许交互
- 组合 provider 选择、确认、rollback 预览等交互动作
- 组织 add/edit/setup 中的渐进式输入收集

它不负责：

- 业务状态变更
- 文件系统写入
- 运行时探测

`setup` 是这一层边界最强的命令之一。在 `0.0.6` 中，它的 adopt profile 选择和 provider 详情输入仍然是交互式 contract，因此非交互路径会显式失败，而不是隐式进入空输入分支。

### 4.4 `src/storage/`

这一层是 `0.0.6` 的文件和状态访问层，负责把以前分散在 `infra/` 的能力收口成稳定存储边界。

它承担的职责是：

- `config.toml` / `providers.json` / backup manifest / lock file 的读写
- Codex home 目录路径展开
- 原子写入、备份、回滚、锁定

`src/infra/` 在当前版本主要保留兼容 re-export，以便逐步迁移，不再作为新的业务入口继续扩张。

### 4.5 `src/runtime/`

这一层是 `0.0.6` 新增的运行时边界，负责本地 Codex CLI 的外部依赖探测和登录调用。

它承担的职责是：

- Codex 可用性检查
- Codex 版本检查
- Codex login 调用
- 未来可扩展为第三方 runtime adapter 的能力边界

### 4.6 `src/cli/`

#### `src/cli/args.ts`

负责：

- 解析全局参数 `--json`、`--codex-dir`
- 解析命令名、位置参数和命令选项
- 提供 `hasFlag` / `getSingleOption` 这种小型解析辅助函数

不负责：

- 命令实际行为
- 文件访问
- 输出格式化

#### `src/cli/prompt.ts`

负责：

- 对 `inquirer` 做轻量封装
- 提供 `input` / `password` / `select` / `confirm` 四类 typed 交互能力
- 把 prompt 取消统一转换成稳定 CLI 错误

不负责：

- 业务判断某个命令是否应该进入交互
- 直接读写 provider/config 文件

#### `src/cli/interactive.ts`

负责：

- 统一判定何时允许交互
- 组合 provider 选择、危险确认、rollback 摘要展示等 CLI 级辅助逻辑
- 保持命令分支对交互的接入方式一致

#### `src/cli/output.ts`

负责：

- 渲染统一 JSON envelope
- 渲染默认的人类可读输出
- 渲染失败输出和错误码

当前输出层还额外抽出了：

- `renderSuccess`
- `renderFailure`

这两个纯渲染入口的作用是让 CLI 层本身也能被测试，而不依赖真实子进程。

### 4.7 `src/app/`

这一层是应用服务 / 用例编排层。每个文件基本对应一个命令或一个用例：

- `list-providers.ts`
- `get-current-profile.ts`
- `get-status.ts`
- `switch-provider.ts`
- `import-providers.ts`
- `export-providers.ts`
- `add-provider.ts`
- `remove-provider.ts`
- `run-doctor.ts`
- `rollback-latest.ts`
- `run-mutation.ts`

这一层的职责是：

- 组合多个 infra 能力
- 串起校验、备份、写入、回滚、输出数据准备
- 为所有写操作提供统一 orchestration contract
- 保证命令行为满足 PRD 语义

它不关心：

- 终端输出长什么样
- `stdout` / `stderr` 怎么写
- argv 怎么解析

### 4.8 `src/domain/`

#### `errors.ts`

定义当前 MVP 固定错误码：

- `CONFIG_NOT_FOUND`
- `PROVIDERS_NOT_FOUND`
- `PROVIDERS_PARSE_ERROR`
- `PROVIDER_NOT_FOUND`
- `PROFILE_NOT_FOUND`
- `BACKUP_FAILED`
- `CODEX_LOGIN_FAILED`
- `ROLLBACK_FAILED`
- `LOCK_CONFLICT`
- `LIVE_STATE_DRIFT`
- `INVALID_IMPORT_FILE`

并提供：

- `cliError`
- `normalizeError`

这是整个错误语义统一的基础。

#### `providers.ts`

负责 `providers.json` 的领域模型和规则：

- `ProviderRecord`
- `ProvidersFile`
- `validateProvidersShape`
- `cleanProviderRecord`
- `sortProviders`
- `findProviderByProfile`

这里是当前 provider 数据契约的唯一可信实现位置。

#### `config.ts`

负责 `config.toml` 相关的纯逻辑：

- 读取顶层 `profile`
- 提取 `[profiles.xxx]` 名称
- 替换顶层 `profile`

它只做字符串级和结构级处理，不做真实文件 IO。

#### `backup.ts`

定义备份 manifest 的结构：

- `FileBackupEntry`
- `BackupManifest`

### 4.5 `src/infra/`

#### `codex-paths.ts`

负责路径集中管理：

- `resolveCodexDir`
- `createCodexPaths`

它把下面这些路径收敛为一个统一对象：

- `config.toml`
- `providers.json`
- `auth.json`
- `backups/`
- `backups/latest.json`

这样上层命令不再自己拼路径。

#### `providers-repo.ts`

负责 `providers.json` 的文件级读写：

- 读取文件
- 解析 JSON
- 套用 domain schema 校验
- 序列化写回

#### `config-repo.ts`

负责 `config.toml` 的文件级访问：

- 读取配置文件
- 获取当前 profile
- 校验 profile 是否存在
- 更新顶层 profile

#### `backup-repo.ts`

负责备份和恢复落盘：

- 创建按时间戳命名的备份目录
- 保存 `manifest.json`
- 记录 `latest.json`
- 依据 manifest 恢复文件

#### `lock-repo.ts`

负责轻量并发控制：

- 在 `~/.codex/.codex-switch.lock` 上建立单操作锁
- 并发写入时快速失败
- 为 CLI、脚本和 AI agent 并发调用提供最小安全边界

#### `codex-cli.ts`

负责调用真实 `codex` CLI：

- `runCodexLogin`
- `checkCodexAvailable`

这里还提供了测试友好的可注入实现：

- `setCodexSpawnImplementation`
- `resetCodexSpawnImplementation`

这样应用层测试可以验证 `switch` 和 `doctor` 的行为，而不用依赖本机一定装好了真正的 `codex`。

#### `fs-utils.ts`

负责通用文件工具：

- `ensureDir`
- `writeTextFileAtomic`
- `readRequiredFile`
- 输出细节格式化

## 5. 关键数据模型

### 5.1 `providers.json`

当前系统围绕下面这个结构工作：

```json
{
  "providers": {
    "packycode": {
      "profile": "packycode",
      "apiKey": "sk-xxx",
      "baseUrl": "https://example.com/v1",
      "note": "primary free model route",
      "tags": ["free", "daily"]
    }
  }
}
```

#### 字段语义

- `profile`
  - 必填
  - 必须映射到 `config.toml` 中已存在的 profile
- `apiKey`
  - 必填
  - 用于 `codex login --with-api-key`
- `baseUrl`
  - 选填
  - 当前版本只存储在 `providers.json`；`config show` 中展示的 runtime `baseUrl` 由 `model_provider -> model_providers.*.base_url` 解析
- `note`
  - 选填
  - 面向人类和 AI 的说明字段
- `tags`
  - 选填
  - 预留给未来筛选与推荐

从建模角度看，`providers.json` 是管理态 SSOT。未来如果支持 backfill，也应是显式命令把受控的 live 信息反向写回 registry，而不是默认把 runtime file 当成事实源。

### 5.2 `config.toml`

当前实现只关心两类信息：

- 顶层 `profile = "..."`
- `[profiles.xxx]` 段是否存在

当前版本不负责：

- 创建新的 profile section
- 深度解析 profile 内部更多字段
- 管理 base URL 或模型等 profile 内容

它在当前架构里是 direct provider 的认证投影文件，不承担 provider 选择职责，也不作为 provider registry 的事实源。

### 5.3 `auth.json`

当前实现不直接建模其内部字段，但它有明确架构角色：

- 属于 direct provider 的认证投影
- 在存在时纳入备份与回滚
- 不是 provider registry 的事实源

### 5.4 备份 manifest

当前备份 manifest 记录：

- 备份创建时间
- 备份原因
- 根目录
- 备份目录
- 每个文件的相对路径
- 原文件是否存在
- 备份文件名

这使得回滚不依赖目录猜测，而是依赖显式清单恢复。

## 6. 核心命令工作流

### 6.1 `list`

流程：

1. CLI 解析参数
2. `listProviders` 调用 `readProvidersFile`
3. 按名称排序并返回 provider 列表
4. 输出层渲染 JSON 或人类可读格式

失败点：

- 文件不存在：`PROVIDERS_NOT_FOUND`
- JSON 结构不合法：`PROVIDERS_PARSE_ERROR`

### 6.2 `current`

流程：

1. 读取 `config.toml`
2. 解析顶层 `profile`
3. 输出当前 profile

失败点：

- 文件不存在：`CONFIG_NOT_FOUND`
- 没有顶层 profile：`PROFILE_NOT_FOUND`

### 6.3 `switch <provider>`

这是当前最关键的命令，也是架构设计的中心流程。

流程如下：

1. CLI 层在 TTY 且 `<provider>` 缺失时，先用 selector 选 provider
2. 获取单操作写锁
3. 读取并解析 `providers.json`
4. 校验目标 provider 是否存在
5. 读取 `config.toml`
6. 校验 provider 对应的 `profile` 在配置中存在
7. 创建备份：
   - `config.toml`
- `auth.json` 仅在历史备份清单已包含时由 rollback 兼容恢复
8. 更新顶层 `profile`
9. 如果未传 `--no-login`，执行 `codex login --with-api-key`
10. 成功后把这次备份记录为 `latest.json`
11. 若任何步骤失败，按 manifest 回滚
12. 释放写锁

#### 为什么 `switch` 必须由应用层编排

因为它同时跨越了：

- provider 仓储
- config 仓储
- 备份系统
- 外部 CLI 调用
- 失败回滚语义

这是典型的应用层编排问题，不能直接塞回 CLI 文件里。

#### `switch` 时序图

```text
User/Agent
  -> CLI parseArgs
  -> executeCommand("switch")
  -> app/switchProvider
  -> app/runMutation
  -> providers-repo.readProvidersFile
  -> config-repo.ensureProfileExists
  -> backup-repo.createBackup
  -> config-repo.updateTopLevelProfile
  -> codex-cli.runCodexLogin   (unless --no-login)
  -> backup-repo.saveLatestManifest
  -> CLI output renderer

failure path:
  -> codex-cli.runCodexLogin throws
  -> backup-repo.restoreManifest
  -> app throws normalized error with rollbackApplied=true
  -> CLI output renderer
```

#### `switch` 事务边界

从实现角度看，`switch` 的“事务”并不是数据库事务，而是一个文件系统级补偿事务：

- 事务开始点：
  - 备份成功生成 manifest
- 事务提交点：
  - 配置更新成功且登录成功
  - `latest.json` 被更新为本次备份
- 事务补偿点：
  - 发生异常时按 manifest 恢复文件

这是当前版本最关键的安全设计。

### 6.4 `status`

这是浅状态概览，不是深诊断。

当前输出包含：

- `codexDir`
- `configExists`
- `providersExists`
- `currentProfile`
- `currentProfileMapped`
- `provider`
- `liveState`
- `storage`

### 6.5 `doctor`

这是显式问题检测。

当前至少检查：

- `config.toml` 是否存在
- `providers.json` 是否存在
- `providers.json` 是否可解析
- provider 映射的 profile 是否存在
- 当前 live profile 是否已经脱离 `providers.json` 映射
- `codex` CLI 是否可执行

当前实现里，如果 `codex` 不可执行，会返回：

- `CODEX_LOGIN_FAILED`

从语义上看这足够满足 PRD 的“CLI 是否可执行”检查要求，但后续若要更精细，可以单独引入一个更专门的 `CODEX_CLI_NOT_FOUND` 类型。

### 6.6 `import`

流程：

1. CLI 层保留显式路径参数
2. TTY 中写入前先确认
3. 读取外部文件
4. 校验 JSON 和 schema
5. 备份当前 `providers.json`
6. 整体替换写入
7. 写失败则恢复旧文件

当前明确不支持 merge import。

### 6.7 `export`

流程：

1. 读取当前 `providers.json`
2. 检查目标文件是否存在
3. TTY 中若文件已存在且未传 `--force`，先确认是否覆盖
4. 默认拒绝覆盖
5. 传入 `--force` 或确认覆盖时允许写入

### 6.8 `add`

流程：

1. CLI 层仅在缺失必填字段且当前是 TTY 时进入交互
2. provider 名在 prompt 阶段尽早做重名检查
3. profile 优先从 `config.toml` 里解析出的现有 profile 列表选择
4. apiKey 通过隐藏输入采集并二次确认
5. 读取现有 provider 集合
6. 校验重名
7. 备份旧文件
8. 追加一条 provider 记录
9. 写回 `providers.json`

### 6.9 `remove`

流程：

1. CLI 层在 TTY 且缺少 provider 时可先选择 provider
2. CLI 层在 TTY 中始终做删除确认
3. 非 TTY 或 `--json` 场景继续要求显式 `--force`
4. 校验 provider 存在
5. 备份 `providers.json`
6. 删除目标 provider
7. 写回

### 6.10 `rollback`

流程：

1. TTY 中先读取 `backups/latest.json`
2. 展示备份目录和待恢复文件摘要
3. 请求确认
4. 加载最近一次 manifest
5. 按 manifest 恢复文件
6. 返回恢复文件列表和备份目录

#### `rollback` 时序图

```text
CLI
  -> executeCommand("rollback")
  -> app/rollbackLatest
  -> backup-repo.loadLatestManifest
  -> backup-repo.restoreManifest
  -> output renderer
```

## 7. 输出设计

### 7.1 统一 JSON envelope

关键命令支持统一结构：

```json
{
  "ok": true,
  "command": "switch",
  "data": {},
  "warnings": [],
  "error": null
}
```

成功和失败的 envelope 都由 `src/cli/output.ts` 统一渲染。

### 7.2 人类可读输出

人类模式下，输出尽量保持：

- 短
- 稳定
- 无敏感值
- 可快速扫描

当前并未做彩色输出、表格对齐或交互式 UI，这符合 MVP 的工程约束。

## 8. 错误处理设计

### 8.1 统一错误码

错误码集中定义在 `src/domain/errors.ts`，所有层最终都要收敛到这一套固定代码上。

这样做的意义是：

- AI 自动化更稳定
- CLI 输出更一致
- 测试断言更明确
- 后续做 GUI / HTTP / MCP 适配时不用重建错误体系

### 8.2 应用层回滚策略

当前回滚策略不是“失败就把目录整体还原”，而是：

- 在写操作之前先生成明确的 manifest
- 失败后按 manifest 恢复受影响文件

这样更安全，也更容易扩展到未来多文件事务。

当前进一步把“事务”固定为单操作窗口：

- 先拿锁
- 再备份
- 再变更
- 失败则补偿恢复
- 最后释放锁

### 8.3 错误传播路径

当前错误传播采用“低层抛错，高层归一”的方式：

```text
infra/domain throws cliError(...)
  -> app catch/augment if needed
  -> cli normalizeError(...)
  -> output layer renderFailure(...)
```

其中应用层只在两类场景下增强错误：

- 需要补充上下文细节
- 需要把回滚结果附加到错误上

## 9. 测试架构

### 9.1 当前测试目录

```text
tests/
  domain.spec.js
  app.spec.js
  cli.spec.js
  helpers.js
  run-tests.js
```

### 9.2 为什么当前没有直接使用 `node --test`

当前运行环境下，Node 内建 test runner 会触发 worker / spawn 路径上的 `EPERM` 限制，因此当前采用：

- 标准 `tests/` 目录结构
- 串行测试 runner `tests/run-tests.js`

这不是长期唯一方案，但在当前环境里是务实且稳定的选择。

### 9.3 当前测试覆盖

#### `domain.spec.js`

覆盖：

- profile 解析
- profile section 提取
- top-level profile 替换
- provider schema 校验
- provider 清洗与 profile 反查

#### `app.spec.js`

覆盖：

- `list/current/status`
- `add/export/import/remove`
- `switch` 成功路径
- `switch` 登录失败回滚
- `rollback`
- `doctor`
- `PROVIDER_NOT_FOUND`
- `PROFILE_NOT_FOUND`
- `INVALID_IMPORT_FILE`
- `PROVIDERS_NOT_FOUND`
- `PROVIDERS_PARSE_ERROR`

#### `cli.spec.js`

覆盖：

- argv 解析
- JSON success envelope
- JSON failure envelope
- `CONFIG_NOT_FOUND` 的 CLI 层失败渲染

### 9.4 测试分层策略

当前测试策略遵循：

- domain 层测纯规则
- app 层测命令行为和回滚语义
- cli 层测参数解析和输出契约

这样可以避免所有测试都退化成“起一个子进程跑命令”的高成本方式，也避免纯单元测试完全失去真实业务价值。

## 10. 打包与发布设计

### 10.1 构建脚本

当前构建脚本在：

- `scripts/build.cjs`

它先清理 `dist/`，再执行 `tsc`。这样可以避免旧编译产物残留进 npm 包。

### 10.2 npm 包入口

当前 npm 二进制入口定义在 `package.json`：

```json
"bin": {
  "codexs": "dist/cli.js"
}
```

这保证：

- 全局安装后可执行 `codexs`
- `npx @minniexcode/codex-switch ...` 可以走同一入口

### 10.3 打包验证

当前工程已经通过 `npm pack --dry-run` 验证：

- `dist/` 中只包含当前源码对应的编译产物
- `docs/`、`README.md`、`LICENSE` 和 `package.json` 进入包
- 已删除的旧构建文件不会混进 tarball

### 10.4 为什么构建脚本单独放在 `scripts/build.cjs`

最初如果仅使用 `tsc`，旧的编译产物可能残留在 `dist/` 并混入 npm 包。单独脚本的意义是：

- 显式清理 `dist/`
- 再调用 TypeScript 编译
- 让打包输出和当前源码状态严格一致

## 11. 架构优点

当前架构的主要优点有：

- 命令行为和文件系统副作用解耦
- 输出层与业务层解耦
- 错误码统一
- 备份/回滚是独立能力，不被嵌入某一个命令实现里
- 测试可以分别打到 domain / app / cli 三层
- 后续新增命令时，能复用现有 repository、错误码和输出体系

## 12. 与 `codex-auth` / `cc-switch` 的架构对比

### 12.1 与 `codex-auth` 的对比

`codex-auth` 更接近已经产品化的 CLI 账号管理器，而 `codex-switch` 更聚焦 provider/profile 切换：

- 相同点：
  - 都是 CLI-first
  - 都适合 npm 分发
  - 都适合自动化和 AI 调用
- 不同点：
  - `codex-auth` 的主对象是账号 / auth
  - `codex-switch` 的主对象是 provider/profile 和本地配置

因此 `codex-auth` 对本项目的主要参考价值在于“命令产品化”，不是数据模型本身。

### 12.2 与 `cc-switch` 的对比

`cc-switch` 是桌面 All-in-One manager，`codex-switch` 是轻量 CLI 工具：

| 维度 | `codex-switch` | `cc-switch` |
| --- | --- | --- |
| 产品形态 | CLI | Desktop App |
| 核心对象 | provider/profile + 本地配置 | 多工具统一管理平台 |
| 技术栈 | Node.js + TypeScript | React + TypeScript + Tauri + Rust |
| 主数据层 | 本地文件 + 备份 manifest | SQLite + JSON |
| 核心能力 | 切换、导入导出、诊断、回滚 | GUI 管理、云同步、代理、统计、会话管理 |
| 适用场景 | 轻量切换、自动化、AI 调用 | 可视化统一管理 |

这个对比说明：

- `cc-switch` 值得借鉴的是架构表达方式和模块化意识
- `codex-switch` 当前不应该为了“完整平台化”而抬高技术复杂度

## 13. 当前限制与工程债

当前版本仍有一些明确边界：

### 13.1 TOML 处理仍是轻量字符串策略

当前没有引入完整 TOML parser，而是：

- 解析顶层 `profile`
- 识别 `[profiles.xxx]`
- 替换顶层 `profile`

这对 MVP 足够，但如果未来要修改更多 TOML 字段，建议引入真正的 TOML AST 级处理。

### 13.2 `doctor` 的错误码还不够细

当前 `codex` CLI 不可执行会复用：

- `CODEX_LOGIN_FAILED`

从 MVP 可用性上没问题，但长期更推荐拆成专门的 CLI availability 错误。

### 13.3 当前交互式命令层范围仍然受控

当前 CLI 仍以显式参数模式为主，但已经把 `inquirer` 交互扩展到了高频写命令：

- `add` 缺失必填字段时的渐进式提问
- `switch` 的 provider 选择
- `remove` 的 provider 选择与确认
- `import` / `export` 的危险确认
- `rollback` 的恢复确认

当前仍然没有：

- 路径向导式 import/export
- TUI 状态面板
- 脱离显式参数契约的自动化交互

这继续保持了 CLI-first 和自动化优先的主体边界。

### 13.4 尚未引入持久化审计日志

当前只有：

- 备份文件
- `latest.json`

没有单独的操作日志或事件审计记录。

## 14. 后续演进建议

### 14.1 短期

- 为 `doctor` 拆出更细的 issue code
- 增加 CLI 级更多命令覆盖测试
- 清理测试夹具和本地 cache 目录的仓库管理策略
- 为文档增加命令级技术说明页

### 14.2 中期

- 引入真正的 TOML parser
- 支持更细粒度的 provider 编辑命令
- 支持 `import --merge` 等增强模式
- 增加更显式的备份历史查看与指定版本恢复

### 14.3 长期

- 增加 GUI / TUI 壳层，但复用同一 application/domain/infra
- 增加 MCP 或 HTTP 适配层，让 AI 工具和桌面前端复用核心逻辑
- 增加多设备 / 多工作区隔离策略

如果未来确实需要进入桌面形态，`cc-switch` 的做法提供了一个现实参考：

- 前端：React + TS
- 壳层：Tauri
- 本地系统能力：Rust backend

但这应该是 `codex-switch` 在 CLI 版本稳定之后的下一阶段选择，而不是当前 MVP 的前提。

## 15. 结论

`codex-switch` 当前的技术架构已经从“单脚本/单文件 CLI”进入了一个可维护、可测试、可扩展的工程化形态。

它的核心技术结论可以归纳为：

- 使用 TypeScript + Node.js 做 CLI-first MVP 是合理的
- 以 `cli / app / domain / infra` 四层作为长期架构边界是合理的
- 以 `providers.json`、`config.toml`、`backups/` 为核心对象的本地事务式切换方案是合理的
- 以统一错误码、统一 JSON envelope 和显式备份 manifest 支撑 AI 调用与安全回滚，是当前版本最有价值的工程资产

如果后续继续演进，这份架构最需要被保护的不是“具体文件名”，而是这三件事：

- 分层边界不能塌回单文件 CLI
- 错误码和输出契约不能随意漂移
- 写操作必须持续保持“先备份、后修改、失败回滚”的默认安全语义
