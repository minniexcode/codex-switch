# codex-switch

`@minniexcode/codex-switch` 是一个本地优先的 Codex provider/model-provider 管理 CLI。

它把 `codex-switch` 自己的工具状态和目标 Codex 目录分开，让 provider 管理、备份和 `model_provider` 投影通过明确命令完成，而不是手工编辑文件。

当前包版本：`0.2.1`

`0.2.1` 是当前仓库开发线，也是 provider-management-only 收敛版本：只管理本地 OpenAI-compatible provider 记录，并把它们投影到 Codex `config.toml` / `auth.json`。本版本不包含之前实验过的账号登录、本地 bridge 或后台 runtime 能力。

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

## 主工作流

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

## 命令面

`0.2.1` 当前命令：

```text
codexs init
codexs migrate
codexs list
codexs show <provider>
codexs current
codexs status
codexs config show
codexs config list-profiles
codexs add <provider> --profile <model-provider-id> --model <model> --api-key <key> [--base-url <url>]
codexs edit <provider> [options]
codexs switch <provider>
codexs remove <provider> --force
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
~/.codex-switch/
  codex-switch.json
  providers.json
  backups/
```

目标 Codex 目录：

```text
~/.codex/
  config.toml
  auth.json
```

环境变量：

- `CODEXS_HOME` 覆盖 `codex-switch` 工具 home。
- `CODEXS_CODEX_DIR` 在未传 `--codex-dir` 时提供默认目标 Codex 目录。
- 开发环境下，`NODE_ENV=development` 且没有显式覆盖时默认使用 `./dev-codex/local-sandbox`。

## 迁移与采用

只有当你已经有 Codex 配置，并希望把它 adopt 到受管 `providers.json` 时才使用 `migrate`。新安装默认使用 `init`。

```bash
codexs migrate
codexs migrate --overwrite --codex-dir ~/.codex
```

本仓库按开发版本处理，包括 `0.2.1`。旧实验状态不会自动迁移；从旧本地实验切换过来时，请手动清理或重新添加 provider。

## 当前非目标

`0.2.1` 不实现也不预留以下 runtime 代码路径：

- GitHub Copilot SDK 集成。
- GitHub device-flow 登录。
- `login copilot`。
- `add --copilot`。
- HTTP proxy bridge 或本地 bridge worker 命令。
- 后台 runtime service、bridge log 或 bridge runtime state。
- 内置第三方 router 封装。
- 账号系统或云同步。
- 旧 Copilot / bridge 状态的自动迁移。

未来版本可能接入类似第三方 router 的能力，但 `0.2.1` 不承诺工作流、schema 或 runtime 行为。

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

- [PRD 0.2.1](./docs/PRD/codex-switch-prd-v0.2.1.md)
- [Design 0.2.1](./docs/Design/codex-switch-v0.2.1-design.md)
- [CLI usage](./docs/cli-usage.md)

旧 `0.1.x` / `0.2.0` 文档保留为历史记录。
