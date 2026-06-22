# @minniexcode/codex-switch

`@minniexcode/codex-switch` 是一个本地优先的 CLI，用来安全地管理和切换 Codex 的 provider 与 model-provider 路由配置。

它把 `codex-switch` 自己的工具状态和目标 Codex runtime 明确分开，让 provider 管理、备份与 runtime 投影有一套受管流程，而不是依赖手工改文件。

## 版本定位

当前包版本：`0.1.2`

这是当前稳定发布线。`0.1.2` 是 Copilot runtime 修复版本，包含受管 SDK 固定版本与 Copilot 专用的 `stream_idle_timeout_ms = 300000` 投影，用于避免长 prompt 的空闲超时。

## 安装

```bash
npm install -g @minniexcode/codex-switch
```

不全局安装时也可以直接运行：

```bash
npx @minniexcode/codex-switch --help
```

CLI 命令名：

```bash
codexs --help
```

## 主工作流

Direct provider 主路径：

```bash
codexs init
codexs add my-provider --model gpt-5.5 --base-url https://gateway.example.com/v1 --api-key sk-xxx
codexs switch my-provider
codexs status
codexs doctor
```

GitHub Copilot 主路径：

```bash
codexs init
codexs login copilot
codexs add copilot-main --copilot --model gpt-4.1
codexs switch copilot-main
codexs status
codexs doctor
```

说明：

- `init` 负责初始化 `codex-switch` 的 tool home 与受管状态文件。
- `login copilot` 负责上游 Copilot onboarding 和登录可用性检查。
- `add --copilot` 不负责替你登录，它假设上游 Copilot 已经 ready。
- `switch` 会把选中的 provider 投影到目标 Codex runtime 的顶层 `model` 与 `model_provider`。
- `status` 是切换后的主读取命令。
- `doctor` 是主诊断命令，用于解释问题和下一步修复动作。

## Runtime 路由模型

对于 Codex `0.134.0+`，活动 runtime route 由 `config.toml` 顶层的 `model` 和 `model_provider` 决定。

`codex-switch` 按这套 contract 管理运行态：

- 顶层 `model` 表示当前活动模型
- 顶层 `model_provider` 表示当前活动 provider route
- 受管的 `[model_providers.<id>]` 是 runtime provider 定义投影
- `--profile` 只作为受管 `model_provider` id 的 alias，不再是主 runtime selector

Direct provider 的运行态投影会写入：

- 顶层 `model`
- 顶层 `model_provider`
- `[model_providers.<id>]`
- 带 `OPENAI_API_KEY` 的 `auth.json`

受管 direct provider 投影不会再保留 `env_key` 或 `env_key_instructions`。`switch`、`add` 和 `edit` 会在写入活动路由前清理这些旧字段。

对受管的 OpenAI-compatible route，投影后的 provider 结构固定为：

```toml
model = "gpt-5.5"
model_provider = "my-provider"

[model_providers.my-provider]
name = "my-provider"
base_url = "https://gateway.example.com/v1"
wire_api = "responses"
requires_openai_auth = true
```

## Advanced Adopt 路径

如果你已经有现成的 Codex runtime 状态，希望把它 adopt 到受管 `providers.json`，再使用：

```bash
codexs init
codexs migrate
```

`migrate` 是高级 adopt helper，不是 fresh install 的默认第一步。

## 命令面

```bash
codexs init
codexs login copilot
codexs migrate
codexs list
codexs show <provider>
codexs current
codexs status
codexs config show [profile]
codexs config list-profiles
codexs add <provider> --model <model> --api-key <key> [--base-url <url>]
codexs add <provider> --copilot --model <model>
codexs edit <provider>
codexs switch <provider>
codexs remove <provider> [--force] [--switch-to <provider>]
codexs import <file>
codexs export <file> [--force]
codexs bridge start [provider]
codexs bridge status [provider]
codexs bridge stop [provider]
codexs backups list
codexs rollback [backup-id]
codexs doctor
```

`setup` 仍然存在，但只作为已弃用兼容入口，用来提示调用方改用 `init` 或 `migrate`。

## 双路径模型

tool home：

```text
~/.config/codex-switch/
  codex-switch.json
  providers.json
  backups/
  runtime/
  runtimes/
```

目标 Codex runtime：

```text
~/.codex/
  config.toml
  auth.json
```

关键边界：

- `providers.json` 是受管 provider 注册表，位于 tool home。
- `codex-switch.json` 保存工具级元数据，例如 `defaultCodexDir`。
- `config.toml` 仍然是目标 runtime 里的活动路由文件。
- `auth.json` 仍然是目标 runtime 里的活动认证投影文件。
- Direct provider 切换会改写活动 runtime 中的 `OPENAI_API_KEY`。
- Copilot provider 保持上游 GitHub 登录留在官方 Copilot runtime 中，`codex-switch` 只管理本地 bridge 状态与路由。

路径控制：

- `--codex-dir <path>` 显式指定目标 Codex runtime 目录。
- `CODEXS_CODEX_DIR` 在未传 `--codex-dir` 时提供默认目标目录。
- `CODEXS_HOME` 用于覆盖 tool home 位置。

## 自动化说明

这个 CLI 同时支持人类终端使用和非交互自动化。

全局参数：

```bash
--json
--codex-dir <path>
--help
--version
```

当前实现边界：

- `login copilot` 必须运行在真实 TTY 下，不支持 `--json`。
- `migrate` 在需要人工补齐 adopt 信息时仍然保持交互式语义。
- 自动化调用应尽量显式传参，并优先使用 `--json`。

## 本地开发

```bash
npm run build
npm test
npx tsc --noEmit
node dist/cli.js --help
npm pack --dry-run
```

## 相关文档

- [English README](./README.md)
- [AI README](./README.AI.md)
- [详细 CLI 文档](./docs/cli-usage.md)
- [产品概览](./docs/codex-switch-product-overview.md)
- [测试说明](./docs/Tests/testing.md)
- [PRD 0.1.1](./docs/PRD/codex-switch-prd-v0.1.1.md)
- [Design 0.1.1](./docs/Design/codex-switch-v0.1.1-design.md)
- [PRD 0.1.2](./docs/PRD/codex-switch-prd-v0.1.2.md)
- [Design 0.1.2](./docs/Design/codex-switch-v0.1.2-design.md)

## License

MIT
