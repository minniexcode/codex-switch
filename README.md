# @minniexcode/codex-switch

`codex-switch` is a local-first CLI for managing and switching Codex provider/profile configuration safely.

`codex-switch` 是一个本地优先的 CLI，用来安全地管理和切换 Codex 的 provider/profile 配置。

It is designed for users who work with multiple Codex providers, API keys, or profiles and want a repeatable, backup-first workflow instead of manually editing files under `~/.codex/`.

它面向同时维护多个 Codex provider、API key 或 profile 的用户，目标是用可重复、先备份再写入的方式替代手动修改 `~/.codex/` 下的文件。

## Overview | 简介

What it does:

- Initialize `providers.json` from an existing Codex directory
- List, show, add, edit, and remove provider records
- Switch the active provider/profile safely
- Import and export provider definitions
- Run diagnostics and detect local drift
- List backups and rollback to a previous managed state

它可以完成的事情：

- 从现有 Codex 目录初始化 `providers.json`
- 查看、新增、编辑、删除 provider 记录
- 安全切换当前激活的 provider/profile
- 导入和导出 provider 配置
- 运行诊断并识别本地配置漂移
- 查看备份并回滚到之前的受管状态

Current version: `0.0.4`

当前版本：`0.0.4`

## Install | 安装

Install globally:

```bash
npm install -g @minniexcode/codex-switch
```

Or run directly:

```bash
npx @minniexcode/codex-switch --help
```

全局安装：

```bash
npm install -g @minniexcode/codex-switch
```

或者直接运行：

```bash
npx @minniexcode/codex-switch --help
```

CLI entry:

```bash
codexs --help
```

命令入口：

```bash
codexs --help
```

## Quick Start | 快速开始

Take over an existing Codex directory:

```bash
codexs setup
```

接管当前已有的 Codex 目录：

```bash
codexs setup
```

Inspect managed providers:

```bash
codexs list
codexs show my-provider
```

查看已管理的 provider：

```bash
codexs list
codexs show my-provider
```

Add and switch:

```bash
codexs add my-provider --profile my-provider --api-key sk-xxx
codexs switch my-provider
```

新增并切换：

```bash
codexs add my-provider --profile my-provider --api-key sk-xxx
codexs switch my-provider
```

Check runtime state:

```bash
codexs current
codexs status
codexs doctor
```

检查当前运行状态：

```bash
codexs current
codexs status
codexs doctor
```

## Common Commands | 常用命令

```bash
codexs setup
codexs list
codexs show <provider>
codexs current
codexs status
codexs add <provider> --profile <name> --api-key <key>
codexs edit <provider> [--profile <name>] [--api-key <key>]
codexs switch <provider>
codexs remove <provider>
codexs import <file> [--merge]
codexs export <file>
codexs backups list
codexs rollback [backup-id]
codexs doctor
```

Command help:

```bash
codexs help switch
codexs help setup
```

命令帮助：

```bash
codexs help switch
codexs help setup
```

## How It Works | 工作方式

By default, `codex-switch` operates on `~/.codex/`, and you can override the target with `--codex-dir`.

`codex-switch` 默认围绕 `~/.codex/` 工作，也可以通过 `--codex-dir` 指向其他目录。

Managed files:

```text
~/.codex/
  config.toml
  auth.json
  providers.json
  backups/
```

说明：

- `providers.json` is the managed provider registry
- `config.toml` and `auth.json` represent runtime state
- mutating commands back up before writing
- rollback is available after failed or undesired changes

- `providers.json` 是受管理的 provider 注册表
- `config.toml` 和 `auth.json` 代表当前运行态
- 所有写操作都会先备份再写入
- 变更失败或结果不符合预期时可以回滚

## Automation | 自动化

This CLI supports both human TTY use and non-interactive automation.

这个 CLI 同时支持人工交互和非交互自动化。

Recommended global flags:

```bash
--json
--codex-dir <path>
--help
--version
```

建议：

- use `--json` for stable machine-readable output
- pass all required arguments explicitly in scripts or CI
- use `--codex-dir <path>` for sandbox or test environments

- 在脚本或 CI 中使用 `--json` 获取稳定输出
- 在非交互环境中显式传入所有必需参数
- 在测试环境中优先配合 `--codex-dir <path>` 使用

## Documentation | 文档

- [Detailed CLI Usage](./docs/cli-usage.md)
- [详细 CLI 使用文档](./docs/cli-usage.md)
- [Changelog](./CHANGELOG.md)
- [更新日志](./CHANGELOG.md)
- [AI README](./README.AI.md)
- [中文 README（历史版）](./README.CN.md)
- [Product Overview](./docs/codex-switch-product-overview.md)
- [Technical Architecture](./docs/codex-switch-technical-architecture.md)
- [0.0.4 Design Doc](./docs/codex-switch-v0.0.4-design.md)

## License | 许可证

MIT
