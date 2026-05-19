# codex-switch CLI Usage

本文档详细介绍 `codex-switch` 在 `0.0.11` 版本中的命令、参数、交互规则和典型使用方式。

可执行命令名：

```bash
codexs
```

## 1. 概览

从 `0.0.11` 开始，`codex-switch` 使用双路径模型：

- tool home：保存 `codex-switch` 自己的管理态
- target Codex runtime：保存目标 Codex 的 `config.toml` 和 `auth.json`

核心设计：

1. 本地优先，不依赖远端服务保存管理态
2. 写入前先备份，异常时支持回滚
3. 同时兼容人类终端使用和脚本/Agent 自动化调用
4. 对 GitHub Copilot 这类交互式上游登录提供独立命令入口

tool home 默认路径：

```text
~/.config/codex-switch/
  codex-switch.json
  providers.json
  backups/
  runtime/
  runtimes/
```

target Codex runtime 默认路径：

```text
~/.codex/
  config.toml
  auth.json
```

## 2. 安装与入口

全局安装：

```bash
npm install -g @minniexcode/codex-switch
```

临时执行：

```bash
npx @minniexcode/codex-switch --help
```

查看总帮助：

```bash
codexs --help
```

查看版本：

```bash
codexs --version
```

## 3. 全局规则

### 3.1 全局参数

所有命令都支持以下全局参数：

```bash
--json
--codex-dir <path>
--help
--version
```

说明：

- `--json`：输出标准 JSON 结果，并禁用所有交互 prompt
- `--codex-dir <path>`：指定目标 Codex runtime 目录
- `--help`：查看命令帮助
- `--version`：输出当前 CLI 版本

### 3.2 环境变量

```bash
CODEXS_HOME
CODEXS_CODEX_DIR
```

说明：

- `CODEXS_HOME`：覆盖默认 tool home 目录
- `CODEXS_CODEX_DIR`：在未传 `--codex-dir` 时提供默认 Codex runtime 目录

### 3.3 交互规则

CLI 的交互行为遵循以下规则：

- 只有在真实 TTY 终端下才会出现 prompt
- 只要传入 `--json`，就绝不会出现 prompt
- 面向脚本或 CI 的调用应显式传参，并优先使用 `--json`
- 某些危险操作在交互模式下会确认，在非交互模式下则要求显式参数
- `login copilot` 必须在真实 TTY 中运行
- `migrate` 当前仍保留交互式 adopt 契约

### 3.4 备份与回滚

所有受管理的写操作都会先备份相关文件，再执行写入。

典型受影响命令包括：

- `migrate`
- `add`
- `edit`
- `switch`
- `bridge start`
- `remove`
- `import`

如果操作失败，命令内部会尽量自动回滚。你也可以稍后手动执行：

```bash
codexs rollback
codexs rollback <backup-id>
```

## 4. 读取类命令

### 4.1 `list`

列出 `providers.json` 中的全部 provider。

```bash
codexs list [--json] [--codex-dir <path>]
```

### 4.2 `show`

查看单个 provider 的完整记录。

```bash
codexs show <provider> [--json] [--codex-dir <path>]
```

说明：

- 普通文本输出默认隐藏 `apiKey`
- `--json` 模式会返回完整 provider 数据

### 4.3 `current`

查看 `config.toml` 当前激活的顶层 profile。

```bash
codexs current [--json] [--codex-dir <path>]
```

### 4.4 `status`

输出目标 Codex runtime 的快速状态摘要。

```bash
codexs status [--json] [--codex-dir <path>]
```

通常会覆盖这些信息：

- 关键文件是否存在
- 当前激活 profile 是什么
- 当前运行态是否能在受管理 provider 映射中找到
- Copilot SDK 是否已安装
- Copilot bridge runtime state 是否健康

### 4.5 `config show`

查看结构化 config profile 视图。

```bash
codexs config show [profile] [--json] [--codex-dir <path>]
```

说明：

- 不传 `[profile]` 时返回全部可识别 profile
- 可同时看到 managed、unmanaged 和 orphaned 引用

### 4.6 `config list-profiles`

列出可识别的 config profile 名称及其受管态提示。

```bash
codexs config list-profiles [--json] [--codex-dir <path>]
```

### 4.7 `bridge status`

查看当前受管 Copilot bridge 的运行状态。

```bash
codexs bridge status [provider] [--json] [--codex-dir <path>]
```

### 4.8 `backups list`

查看历史备份清单。

```bash
codexs backups list [--json] [--codex-dir <path>]
```

说明：

- 返回结果按 `createdAt` 倒序排列
- 损坏的备份 manifest 会被跳过，并给出 warning，不会导致整个命令失败

## 5. 变更类命令

### 5.1 `init`

初始化 codex-switch tool home 和 registry 文件。

```bash
codexs init [--json] [--codex-dir <path>]
```

行为说明：

- 不依赖 `codex` 可执行文件
- 不要求目标 `config.toml` 或 `auth.json` 已存在
- `codex-switch.json` 不存在时创建
- `providers.json` 不存在时创建空 registry：`{ "providers": {} }`
- 若显式传入 `--codex-dir` 且 `codex-switch.json` 尚不存在，`init` 会把它持久化为 `defaultCodexDir`
- 成功结果围绕 tool home 返回，不再承诺旧的 `createdCodexDir`、`configExists`、`authExists` 等字段

### 5.2 `login copilot`

完成 GitHub Copilot 上游安装与登录就绪检查。

```bash
codexs login copilot
codexs login github-copilot
```

行为说明：

- 当前支持 `copilot` 与 `github-copilot` 两种拼写
- 若本地 Copilot SDK runtime 未安装，会先确认是否安装
- 若登录尚未就绪，会调用官方 `copilot login`，完成后做一次 recheck
- 该命令要求真实 TTY，不支持 `--json`
- 登录状态是共享的；切换 GitHub 账号会影响所有 Copilot provider

### 5.3 `migrate`

从现有 `config.toml` adopt unmanaged profiles，并写入受管理的 `providers.json`。

```bash
codexs migrate [--json] [--codex-dir <path>] [--merge|--overwrite]
```

行为说明：

- 读取 `config.toml` 中已有 profile
- 仅 adopt 已具备 `model`、`model_provider` 且能解析到匹配 `base_url` 的 unmanaged profile
- 收集每个 profile 对应的 provider 记录
- 保持受管备份、锁和 post-run `doctor` 流程
- 非交互模式下，profile 选择和 provider 细节收集仍不会自动化展开

### 5.4 `setup`

`setup` 已弃用，不再执行实际初始化或迁移工作。

```bash
codexs setup
```

### 5.5 `add`

新增一个 provider。`add` 同时支持 direct provider 和 Copilot bridge provider。

```bash
codexs add <provider> --profile <name> --api-key <key> [--base-url <url>] [--note <text>] [--tag <tag> ...]
codexs add <provider> --copilot --profile <name> [--bridge-host <host>] [--bridge-port <port>] [--bridge-api-key <secret>]
codexs add <provider> --profile <name> --api-key <key> --create-profile --model <name> --base-url <url>
codexs add
```

说明：

- direct provider 必须提供 `provider`、`profile`、`apiKey`
- `--create-profile` 可在 profile 缺失时一并创建目标 profile
- direct provider 创建新 profile 时需要同时给出 `--model` 与 `--base-url`
- Copilot provider 创建新 profile 时需要 `--create-profile` 与 `--model`
- `--copilot` 下禁止 `--api-key`，应使用 `--bridge-api-key`
- `add --copilot` 不再负责安装 SDK 或触发登录，应先执行 `codexs login copilot`
- `--install-copilot-sdk` 现在只保留为 rejected compatibility flag

交互模式：

- direct provider 缺少必填项时会在 TTY 中补问
- Copilot provider 的交互流不会要求 direct API key
- tags 交互使用 preset multi-select

### 5.6 `edit`

编辑单个 provider 的字段。

```bash
codexs edit <provider> [--profile <name>] [--api-key <key>] [--base-url <url>] [--note <text>] [--tag <tag> ...] [--json] [--codex-dir <path>]
codexs edit <provider> --profile <name> --create-profile --model <name> --base-url <url>
```

说明：

- 只更新显式传入的字段
- `--tag` 会替换整组标签，而不是追加单个 tag
- 当目标 profile 不存在时，可配合 `--create-profile`、`--model`、`--base-url` 完成重绑定

### 5.7 `switch`

切换当前使用的 provider/profile。

```bash
codexs switch <provider> [--json] [--codex-dir <path>]
```

行为说明：

- 根据 `providers.json` 找到目标 provider
- direct provider 会切换 active profile，并将 `auth.json` 重写为 `auth_mode=apikey` 与 `OPENAI_API_KEY=<provider.apiKey>`
- Copilot bridge provider 会维护本地 bridge 路由，并将认证投影写到本地 bridge secret
- Copilot bridge provider 会在切换前检查 SDK 和上游登录状态
- 切换前会备份 `config.toml` 与 `auth.json`

### 5.8 `bridge start`

启动或复用受管 Copilot bridge。

```bash
codexs bridge start [provider] [--json] [--codex-dir <path>]
```

说明：

- 可通过显式 provider、当前 active provider、唯一 provider 或 TTY 选择来解析目标
- 如果预期端口被占用，会自动寻找新的 5 位端口并持久化

### 5.9 `bridge stop`

停止受管 Copilot bridge。

```bash
codexs bridge stop [provider] [--json] [--codex-dir <path>]
```

说明：

- 不修改 `providers.json`
- 在没有运行中的受管 bridge 时保持幂等

### 5.10 `remove`

删除一个 provider 记录。

```bash
codexs remove <provider> [--force] [--switch-to <profile>] [--json] [--codex-dir <path>]
```

说明：

- 删除的是 `providers.json` 中的记录
- 如果删除的 provider 是当前 active profile 的最后一个绑定项，可先传 `--switch-to`
- 非交互模式下必须同时传入 `<provider>` 和 `--force`

### 5.11 `import`

从外部 JSON 文件导入 provider 配置。

```bash
codexs import <file> [--merge] [--json] [--codex-dir <path>]
```

### 5.12 `export`

导出当前 `providers.json` 到指定文件。

```bash
codexs export <file> [--force] [--json] [--codex-dir <path>]
```

说明：

- 目标文件已存在时，非交互模式下必须显式传 `--force`

## 6. 诊断与恢复

### 6.1 `doctor`

运行本地配置与环境诊断。

```bash
codexs doctor [--json] [--codex-dir <path>]
```

通常会检查：

- 必要文件是否存在
- provider/profile 映射是否一致
- 当前运行态是否有漂移
- Codex CLI 是否可用
- Copilot SDK、登录状态和 bridge runtime 是否健康

### 6.2 `rollback`

回滚到最近一次备份，或者指定备份 ID。

```bash
codexs rollback [<backup-id>] [--json] [--codex-dir <path>]
```

## 7. JSON 输出与自动化建议

如果你是在脚本、CI 或 Agent 环境中调用，建议遵循以下约束：

```bash
codexs <command> --json
```

推荐实践：

- 始终显式传入必需参数，不依赖交互输入
- 使用 `--json` 获取稳定输出
- 对危险命令显式传入控制参数，例如 `--force`、`--merge`、`--overwrite`
- 对多环境调试使用 `--codex-dir <path>` 和 `CODEXS_HOME`
- 不要在自动化环境中调用 `login copilot`

## 8. 典型使用流程

### 8.1 第一次接管现有 Codex 配置

```bash
codexs init
codexs migrate
codexs list
codexs doctor
```

### 8.2 新增并切换到一个 direct provider

```bash
codexs add my-provider --profile my-provider --api-key sk-xxx
codexs switch my-provider
codexs current
```

### 8.3 接入 GitHub Copilot provider

```bash
codexs login copilot
codexs add copilot-main --copilot --profile copilot-main
codexs switch copilot-main
codexs bridge status copilot-main
```

### 8.4 检查 config profile 与受管态映射

```bash
codexs config list-profiles
codexs config show
```

### 8.5 出现错误后恢复

```bash
codexs backups list
codexs rollback
```

## 9. 危险命令说明

以下命令会修改本地配置或覆盖文件，使用前应明确预期：

- `init`
- `migrate`
- `add`
- `edit`
- `switch`
- `bridge start`
- `remove`
- `import`
- `export`（目标文件已存在时）
- `rollback`

建议：

- 人工操作先执行 `backups list`
- 自动化操作统一加 `--json`
- 在测试目录中先用 `--codex-dir <path>` 与 `CODEXS_HOME` 验证流程

## 10. 查看命令帮助

可以查看总帮助：

```bash
codexs --help
```

也可以查看单个命令帮助：

```bash
codexs help init
codexs help login
codexs help bridge
codexs help config
codexs help add
codexs help switch
codexs help rollback
```
