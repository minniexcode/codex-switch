# codex-switch CLI Usage

本文档详细介绍 `codex-switch` 在 `0.0.4` 版本中的命令、参数、交互规则和典型使用方式。

可执行命令名：

```bash
codexs
```

## 1. 概览

`codex-switch` 用来管理本地 Codex 目录中的 provider/profile 配置，默认目标目录是 `~/.codex`。

它的核心设计有三点：

1. 本地优先，不依赖远端服务保存状态
2. 写入前先备份，异常时支持回滚
3. 同时兼容人类终端使用和脚本/Agent 自动化调用

默认管理的文件：

```text
~/.codex/
  config.toml
  auth.json
  providers.json
  backups/
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
- `--codex-dir <path>`：将目标目录从默认 `~/.codex` 改成指定路径
- `--help`：查看命令帮助
- `--version`：输出当前 CLI 版本

### 3.2 交互规则

CLI 的交互行为遵循以下规则：

- 只有在真实 TTY 终端下才会出现 prompt
- 只要传入 `--json`，就绝不会出现 prompt
- 面向脚本或 CI 的调用应显式传参，并优先使用 `--json`
- 某些危险操作在交互模式下会确认，在非交互模式下则要求显式参数

### 3.3 备份与回滚

所有受管理的写操作都会先备份相关文件，再执行写入。

典型受影响命令包括：

- `setup`
- `add`
- `edit`
- `switch`
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

示例：

```bash
codexs list
codexs list --json
```

适用场景：

- 查看当前已管理 provider 列表
- 给后续 `switch`、`show`、`edit`、`remove` 提供候选名称

### 4.2 `show`

查看单个 provider 的完整记录。

```bash
codexs show <provider> [--json] [--codex-dir <path>]
```

示例：

```bash
codexs show packycode
codexs show packycode --json
```

说明：

- 普通文本输出会默认隐藏 `apiKey`
- `--json` 模式会输出完整 provider 数据，适合本地自动化

### 4.3 `current`

查看 `config.toml` 当前激活的顶层 profile。

```bash
codexs current [--json] [--codex-dir <path>]
```

示例：

```bash
codexs current
codexs current --json
```

说明：

- 如果缺少 `config.toml`，或配置中没有顶层 profile，会直接报错

### 4.4 `status`

输出本地 Codex 目录的快速状态摘要。

```bash
codexs status [--json] [--codex-dir <path>]
```

示例：

```bash
codexs status
codexs status --json
```

通常会覆盖这些信息：

- 关键文件是否存在
- 当前激活 profile 是什么
- 当前运行态是否能在受管理的 provider 映射中找到

### 4.5 `backups list`

查看历史备份清单。

```bash
codexs backups list [--json] [--codex-dir <path>]
```

示例：

```bash
codexs backups list
codexs backups list --json
```

说明：

- 返回结果按 `createdAt` 倒序排列
- 损坏的备份 manifest 会被跳过，并给出 warning，不会导致整个命令失败

## 5. 变更类命令

### 5.1 `setup`

从现有 Codex 目录初始化 `providers.json`。

```bash
codexs setup [--json] [--codex-dir <path>] [--merge|--overwrite]
```

示例：

```bash
codexs setup
codexs setup --overwrite --json
codexs setup --merge --codex-dir ./.tmp-codex
```

行为说明：

- 读取 `config.toml` 中已有 profile
- 仅 adopt 已具备 `model`、`model_provider` 且能解析到匹配 `model_providers.*.base_url` 的 profile
- 收集每个 profile 对应的 provider 记录
- 在受管备份流程下写入 `providers.json`
- 成功后会自动运行一次 `doctor`

交互模式：

- 如果 `providers.json` 已存在，会让你选择 `merge`、`overwrite` 或取消
- 如果需要补全 provider 细节，会在 TTY 中询问

非交互模式：

- `providers.json` 已存在时，必须显式传入 `--merge` 或 `--overwrite`
- `--json` 模式下不会进入任何引导式输入

### 5.2 `add`

新增一个 provider。

```bash
codexs add <provider> --profile <name> --api-key <key> [--base-url <url>] [--note <text>] [--tag <tag> ...]
codexs add [--profile <name>] [--api-key <key>] [--base-url <url>] [--note <text>] [--tag <tag> ...]
```

示例：

```bash
codexs add packycode --profile packycode --api-key sk-xxx
codexs add packycode --profile packycode --api-key sk-xxx --tag paid --tag daily
codexs add
```

字段说明：

- `provider`：provider 名称，也是后续 `switch/show/edit/remove` 的标识
- `--profile`：写入到 `config.toml` 的 profile 名称
- `--api-key`：provider API key
- `--base-url`：可选的 provider 元数据，不会写回 `[profiles.*]`
- `--note`：备注
- `--tag`：标签，可重复传多次

交互模式：

- 如果缺少 `provider`、`profile`、`apiKey`，会在 TTY 中补问
- profile 选择会优先复用现有 `config.toml` profile
- API key 的隐藏输入会做二次确认
- tag 仅支持预设选项多选

非交互模式：

- 必须显式传入所有必填字段

### 5.3 `edit`

编辑单个 provider 的字段。

```bash
codexs edit <provider> [--profile <name>] [--api-key <key>] [--base-url <url>] [--note <text>] [--tag <tag> ...] [--json] [--codex-dir <path>]
```

示例：

```bash
codexs edit packycode --note primary
codexs edit packycode --api-key sk-new --base-url https://example.com/v1
codexs edit packycode --tag daily --tag paid
```

行为说明：

- 只会更新你显式传入的字段
- 未传入的字段保持不变
- `--tag` 会替换整组标签，而不是追加单个 tag
- 写入前会备份 `providers.json`

交互模式：

- 如果没有传任何可编辑字段，TTY 下会进入交互编辑

非交互模式：

- 至少要提供一个需要修改的字段

### 5.4 `switch`

切换当前使用的 provider/profile。

```bash
codexs switch <provider> [--no-login] [--json] [--codex-dir <path>]
```

示例：

```bash
codexs switch freemodel
codexs switch freemodel --no-login
codexs switch --no-login
```

行为说明：

- 根据 `providers.json` 找到目标 provider
- 更新相关运行态配置
- 默认会执行 Codex 登录刷新流程
- 会先备份 `config.toml` 和 `auth.json`

参数说明：

- `--no-login`：切换后不执行登录刷新

交互模式：

- 如果没有传 `<provider>`，TTY 下会弹出 provider 选择器
- 如果已经传了 `<provider>`，则直接执行，不再额外确认

### 5.5 `remove`

删除一个 provider 记录。

```bash
codexs remove <provider> [--force] [--json] [--codex-dir <path>]
```

示例：

```bash
codexs remove freemodel
codexs remove freemodel --force --json
```

行为说明：

- 删除的是 `providers.json` 中的记录
- 删除前会备份 `providers.json`

交互模式：

- 如果没传 provider，可以在 TTY 中选择
- 无论是否显式传入 provider，交互模式下都会要求确认删除

非交互模式：

- 必须同时传入 `<provider>` 和 `--force`

### 5.6 `import`

从外部 JSON 文件导入 provider 配置。

```bash
codexs import <file> [--merge] [--json] [--codex-dir <path>]
```

示例：

```bash
codexs import ./providers.json
codexs import ./providers.json --merge
codexs import ./providers.json --merge --json
```

行为说明：

- 默认会用导入文件替换当前 `providers.json`
- 加上 `--merge` 后，会按 provider 名称做浅合并
- 冲突时，以导入文件中的 provider 记录为准

交互模式：

- 会在写入前确认是替换还是合并结果

非交互模式：

- 不会弹出路径向导或确认框
- 会先验证输入文件，再执行写入

### 5.7 `export`

导出当前 `providers.json` 到指定文件。

```bash
codexs export <file> [--force] [--json] [--codex-dir <path>]
```

示例：

```bash
codexs export ./providers-backup.json
codexs export ./providers-backup.json --force
```

行为说明：

- 将当前受管理 provider 注册表导出为外部 JSON 文件

覆盖规则：

- 如果目标文件不存在，直接导出
- 如果目标文件已存在，交互模式下会询问是否覆盖
- 非交互模式下必须显式传 `--force`

## 6. 诊断与恢复

### 6.1 `doctor`

运行本地配置与环境诊断。

```bash
codexs doctor [--json] [--codex-dir <path>]
```

示例：

```bash
codexs doctor
codexs doctor --json
```

通常会检查：

- 必要文件是否存在
- provider/profile 映射是否一致
- 当前运行态是否有漂移
- Codex CLI 是否可用

### 6.2 `rollback`

回滚到最近一次备份，或者指定备份 ID。

```bash
codexs rollback [<backup-id>] [--json] [--codex-dir <path>]
```

示例：

```bash
codexs rollback
codexs rollback 20260511-221457-switch
codexs rollback 20260511-221457-switch --json
```

行为说明：

- 不带参数时，默认回滚最近一次受管备份
- 传入 `<backup-id>` 时，回滚到指定备份

交互模式：

- 会先展示目标备份和受影响文件，再要求确认

非交互模式：

- 直接执行，不会二次确认

## 7. JSON 输出与自动化建议

如果你是在脚本、CI 或 Agent 环境中调用，建议遵循以下约束：

```bash
codexs <command> --json
```

推荐实践：

- 始终显式传入必需参数，不依赖交互输入
- 使用 `--json` 获取稳定输出
- 对危险命令显式传入控制参数，例如 `--force`、`--merge`、`--overwrite`
- 对多环境调试使用 `--codex-dir <path>`，避免误改默认 `~/.codex`

适合自动化的例子：

```bash
codexs list --json
codexs show packycode --json
codexs switch packycode --no-login --json
codexs export ./providers.snapshot.json --force --json
codexs rollback 20260511-221457-switch --json
```

## 8. 典型使用流程

### 8.1 第一次接管现有 Codex 配置

```bash
codexs setup
codexs list
codexs doctor
```

### 8.2 新增并切换到一个 provider

```bash
codexs add my-provider --profile my-provider --api-key sk-xxx
codexs switch my-provider
codexs current
```

### 8.3 批量迁移 provider 配置

```bash
codexs export ./providers.backup.json
codexs import ./team.providers.json --merge
codexs doctor
```

### 8.4 出现错误后恢复

```bash
codexs backups list
codexs rollback
```

或者：

```bash
codexs rollback <backup-id>
```

## 9. 危险命令说明

以下命令会修改本地配置或覆盖文件，使用前应明确预期：

- `setup`
- `add`
- `edit`
- `switch`
- `remove`
- `import`
- `export`（目标文件已存在时）
- `rollback`

建议：

- 人工操作先执行 `backups list`
- 自动化操作统一加 `--json`
- 在测试目录中先用 `--codex-dir <path>` 验证流程

## 10. 查看命令帮助

可以查看总帮助：

```bash
codexs --help
```

也可以查看单个命令帮助：

```bash
codexs help setup
codexs help add
codexs help switch
codexs help backups
codexs help rollback
```
