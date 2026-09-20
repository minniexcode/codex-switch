# codex-switch

`@minniexcode/codex-switch` 是一个本地优先的 CLI，用于管理和切换 Codex 与 Claude Code 的 provider 路由。

它把 `codex-switch` 自己的工具状态和目标运行时目录分开，让 provider 管理、备份和运行时投影通过明确命令完成，而不是手工编辑文件。

当前包版本：`0.3.1`

`0.3.1` 是 `0.3.0` 双目标线的安全修复版。`show --claude` 默认掩码 secret 类 env 值（除非显式传 `--reveal`），错误详情改为递归脱敏，工具写入的文件在 macOS / Linux 上使用仅属主可读权限，并修复了两处写入安全问题。`--claude` 路径、两个 registry 和命令面没有其他变化。

`0.3.0` 新增了 Claude Code provider 切换功能（通过 `--claude` flag）。工具同时支持 Codex（OpenAI-compatible provider 投影到 `config.toml`/`auth.json`）和 Claude Code（完整 `settings.json` 配置切换）。

## 安装

```bash
npm install -g @minniexcode/codex-switch
codexs --help
```

本地开发：

```bash
npm install
npm run build
node dist/cli.js --help
```

需要 Node.js `>=18`。

## 主工作流 (Codex)

```bash
codexs init
codexs add packycode --profile packycode --model gpt-5 --api-key sk-xxx --base-url https://api.example/v1
codexs switch packycode
codexs status
codexs doctor
```

- `init` 创建 `codex-switch` 工具状态文件。
- `add` 在 `providers.json` 中保存受管 provider，并创建或更新对应 `[model_providers.<id>]`。
- `switch` 写入目标 Codex 配置的顶层 `model` / `model_provider`，并把 `OPENAI_API_KEY` 投影到 `auth.json`。
- `status` 汇总当前映射、认证投影和漂移状态。
- `doctor` 输出问题优先的诊断结果。

`--profile` 是受管 Codex `model_provider` id 的 CLI alias，不是旧 Codex 顶层 `profile` selector。

## Claude Code 工作流

```bash
codexs add --claude opus --from-file ~/.claude/settings.json
codexs add --claude copilot --from-file ~/.claude/settings-copilot.json
codexs switch --claude copilot
codexs current --claude
codexs list --claude
codexs show --claude copilot
codexs show --claude copilot --reveal
```

- `add --claude` 导入完整的 Claude Code `settings.json` 为一个命名配置。
- `switch --claude` 原子替换 `~/.claude/settings.json` 为存储的配置。
- `current --claude` 检测当前活跃的 Claude 配置。
- `list --claude` 显示所有 Claude 配置及活跃标记。
- `show --claude` 显示单个配置，secret 类 env 值被掩码，原始 `settings` blob 不返回。

Claude provider 存储完整的 `settings.json` 内容（env 变量、模型映射、权限、插件），切换时替换整个文件。

### 查看 secret

`show --claude` 会掩码所有 key 名看起来像凭据的 env 值（`*_TOKEN`、`*_API_KEY`、`*_SECRET`、`*_PASSWORD`、`*_CREDENTIAL`，以及任何包含 `auth` 的 key），human 输出和 `--json` 输出都是如此。`ANTHROPIC_BASE_URL` 这类非 secret 的邻居字段照常显示。

`--reveal` 是全局 flag，用于打印真实值并附带 `settings` blob。它是显式的逃生口，不会被默认应用：

```bash
codexs show --claude copilot --reveal
```

工具写入的文件在 **macOS 和 Linux** 上使用仅属主可读权限（文件 `0600`，工具自己创建的目录 `0700`）。Windows 上跳过权限收紧 —— NTFS 没有供 `chmod` 设置的 group/other 位，访问由 ACL 决定，本工具不触碰 ACL。

在 macOS 和 Linux 上，升级前写入的文件会保持原有权限，直到下一次写入触及它。要一次性全部修正：

```bash
# 仅 macOS / Linux —— 在 Windows 上是 no-op。
chmod -R go-rwx ~/.config/codex-switch ~/.codex/config.toml ~/.codex/auth.json ~/.claude/settings.json
```

## 命令面

`0.3.1` 当前命令：

```text
codexs init
codexs migrate
codexs list [--claude]
codexs show <provider> [--claude] [--reveal]
codexs current [--claude]
codexs status
codexs config show
codexs config list-profiles
codexs add <provider> --profile <id> --model <model> --api-key <key> [--base-url <url>]
codexs add --claude <name> --from-file <settings.json>
codexs edit <provider> [options]
codexs switch <provider> [--claude]
codexs remove <provider> [--claude] --force
codexs import <file>
codexs export <file>
codexs backups list
codexs rollback [backup-id]
codexs doctor
codexs setup
```

`setup` 已废弃，只保留为指向 `init` 或 `migrate` 的兼容入口。

## Runtime 投影

Codex `0.134.0+` 的活动路由由 `config.toml` 顶层 `model` 和 `model_provider` 决定。

受管 provider 的投影形态：

```toml
model = "gpt-5"
model_provider = "packycode"

[model_providers.packycode]
name = "packycode"
base_url = "https://api.example/v1"
wire_api = "responses"
requires_openai_auth = true
```

`codex-switch` 不为新受管 provider 写入旧 `[profiles.*]`，并会在写入受管投影时清理旧 `env_key` / `env_key_instructions` 字段。

认证会投影到目标 Codex `auth.json`，使用 API-key 模式和 `OPENAI_API_KEY`。不要提交真实 API key、`auth.json` 或私有 provider 导出。

## 状态位置

工具 home：

```text
~/.config/codex-switch/
  codex-switch.json
  providers.json
  claude-providers.json
  backups/
```

目标 Codex 目录：

```text
~/.codex/
  config.toml
  auth.json
```

目标 Claude Code 目录：

```text
~/.claude/
  settings.json
```

环境变量：

- `CODEXS_HOME` 覆盖 `codex-switch` 工具 home。
- `CODEXS_CODEX_DIR` 在未传 `--codex-dir` 时提供默认目标 Codex 目录。
- `CODEXS_CLAUDE_DIR` 覆盖 Claude Code 目录（默认：`~/.claude`）。
- 开发环境下，`NODE_ENV=development` 且没有显式覆盖时默认使用 `./dev-codex/local-sandbox`。

## 迁移与采用

只有当你已经有 Codex 配置，并希望把它 adopt 到受管 `providers.json` 时才使用 `migrate`。新安装默认使用 `init`。

```bash
codexs migrate
codexs migrate --overwrite --codex-dir ~/.codex
```

## 当前非目标

`0.3.1` 不实现也不预留以下 runtime 代码路径：

- GitHub Copilot SDK 集成。
- GitHub device-flow 登录。
- HTTP proxy bridge 或本地 bridge worker 命令。
- 后台 runtime service、bridge log 或 bridge runtime state。
- 内置第三方 router 封装。
- 账号系统或云同步。
- Claude Code 插件市场管理。
- 泛化的 "target" 抽象或可插拔 provider 类型系统。

## 开发

```bash
npm run build
npx tsc --noEmit
npm test
node dist/cli.js --help
node dist/cli.js --version
npm pack --dry-run
```

## 当前事实源

- [PRD 0.3.1](./docs/PRD/codex-switch-prd-v0.3.1.md)
- [Design 0.3.1](./docs/Design/codex-switch-v0.3.1-design.md)
- [PRD 0.3.0](./docs/PRD/codex-switch-prd-v0.3.0.md)
- [Design 0.3.0](./docs/Design/codex-switch-v0.3.0-design.md)
- [PRD 0.2.1](./docs/PRD/codex-switch-prd-v0.2.1.md)
- [Design 0.2.1](./docs/Design/codex-switch-v0.2.1-design.md)
- [CLI usage](./docs/cli-usage.md)

旧 `0.1.x` / `0.2.x` 文档保留为历史记录。
