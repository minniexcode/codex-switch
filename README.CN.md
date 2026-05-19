# @minniexcode/codex-switch

`@minniexcode/codex-switch` 是一个本地优先的 CLI，用来安全地管理和切换 Codex 的 provider/profile 配置。

从 `0.0.11` 开始，它不再把整个管理态都塞进 `~/.codex/`，而是把工具自己的状态拆到独立的 tool home 里，同时继续对目标 Codex runtime 做受控写入。

## 这个仓库是做什么的

这个仓库包含 `codex-switch` 的 CLI 实现、npm 包配置，以及相关产品和技术文档。

项目目标：

- 在本地完成 provider/profile 管理与切换
- 写入前先备份
- 出错时可回滚
- 同时兼顾终端用户和 AI/自动化调用
- 为 GitHub Copilot 这类交互式上游登录提供独立入口

## 现在可以做什么

当前公开命令面如下：

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
codexs edit <provider>
codexs switch <provider>
codexs import <file>
codexs export <file>
codexs add <provider>
codexs remove <provider>
codexs bridge start [provider]
codexs bridge status [provider]
codexs bridge stop [provider]
codexs backups list
codexs doctor
codexs rollback [backup-id]
codexs setup
```

对应能力包括：

- 初始化独立的 tool home 与空的受管 `providers.json`
- 从已有 `config.toml` adopt 可管理的 runtime profile
- 查看本地已管理 provider
- 查看结构化 config profile 视图
- 编辑、切换、导入、导出、删除 provider
- 为 GitHub Copilot 完成上游 SDK 安装与登录检查
- 显式启动、查看和停止本地 Copilot bridge
- 检查配置漂移和常见本地问题
- 在变更前自动备份，并在失败时回滚
- 保留 `setup` 作为弃用入口，并引导到 `init` / `migrate`

## 简单用法

全局安装：

```bash
npm install -g @minniexcode/codex-switch
```

或者直接执行：

```bash
npx @minniexcode/codex-switch --help
```

检查 CLI 是否可用：

```bash
codexs --help
```

典型使用方式：

```bash
codexs init
codexs migrate
codexs list
codexs config show
codexs add my-provider --profile my-provider --api-key sk-xxx
codexs switch my-provider
codexs status
```

GitHub Copilot 路径：

```bash
codexs login copilot
codexs add copilot-main --copilot --profile copilot-main
codexs bridge start copilot-main
```

给脚本或 AI 使用时建议加上：

```bash
codexs list --json
codexs status --json
codexs config list-profiles --json
```

通用参数：

```bash
--json
--codex-dir <path>
```

环境变量：

```bash
CODEXS_HOME
CODEXS_CODEX_DIR
```

## 交互式体验

这个 CLI 同时支持显式命令和交互式终端流程。

- `codexs add` 在 TTY 里会补问缺失的必填项
- `codexs switch` 在未传 provider 时可以弹出选择列表
- `codexs remove` 支持交互式选择和确认删除
- `import`、`export`、`rollback` 在交互模式下会要求确认
- `login copilot` 必须在真实 TTY 中执行
- `migrate` 当前仍保留交互式 adopt 语义
- `--json` 模式保持非交互，适合自动化

## 管理哪些文件

从 `0.0.11` 开始，`codex-switch` 使用双路径模型。

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

存储模型：

- `providers.json` 是管理态的单一事实来源，位于 tool home
- `codex-switch.json` 存放工具级配置，例如 `defaultCodexDir`
- `config.toml` 是目标 Codex runtime 的受管路由文件
- `auth.json` 是当前认证投影文件
- `backups/latest.json` 记录最近一次可回滚窗口
- `runtime/` 保存受管 bridge runtime state
- `runtimes/` 用于存放可选本地 runtime，例如 Copilot SDK

注意：`providers.json` 可能包含 API key，本地使用时应视为敏感文件。

## 最近版本更新

### 0.0.11

- 引入独立 tool home，正式把管理态从 `~/.codex` 中拆出
- 新增 `login copilot`，把 GitHub Copilot 上游登录从 `add --copilot` 中解耦
- 新增 `bridge start/status/stop` 与 `config show/list-profiles`
- README、CLI usage 和发布元数据统一按新命令契约更新

### 0.0.10

- 正式拆分 `setup`：新增 `init` 和 `migrate`，`setup` 变为弃用命令
- 收紧迁移、诊断、回滚和发布正确性边界
- 清理 provider/runtime 管理语义，CLI 聚焦静态 profile 与 `base_url` 层配置

### 0.0.7

- 完成 command-surface 重构
- 校正 env key / auth mirror 相关模型
- 推进 `setup` 向 `init` + `migrate` 的拆分

## 相关文档

- [English README](./README.md)
- [AI README](./README.AI.md)
- [详细 CLI 文档](./docs/cli-usage.md)
- [产品概览](./docs/codex-switch-product-overview.md)
- [产品调研](./docs/codex-switch-product-research.md)
- [PRD 0.0.11](./docs/PRD/codex-switch-prd-v0.0.11.md)
- [技术架构](./docs/codex-switch-technical-architecture.md)
- [0.0.11 设计文档](./docs/Design/codex-switch-v0.0.11-design.md)
- [测试说明](./docs/Tests/testing.md)

## 本地开发

```bash
npm install
npm run build
npm test
npx tsc --noEmit
node dist/cli.js --help
```

## License

MIT
