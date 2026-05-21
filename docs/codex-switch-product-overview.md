# codex-switch 产品文档

## 文档定位

这份文档介绍当前活跃产品事实源下的 `codex-switch` 产品定位。

当前 release contract 以这些文档为准：

- [`cli-usage.md`](./cli-usage.md)
- [`PRD/codex-switch-prd-v0.0.12.md`](./PRD/codex-switch-prd-v0.0.12.md)
- [`Design/codex-switch-v0.0.12-design.md`](./Design/codex-switch-v0.0.12-design.md)

## 产品概述

`codex-switch` 是一个本地 provider 管理 CLI，用于管理和切换目标 Codex runtime 的 provider/profile 配置，同时把工具自己的管理态保存在独立 tool home 下。

它不是旧 `setup` 小工具，也不是围绕单目录 `~/.codex` 组织全部状态的脚本集合。

## 产品工作方式

`codex-switch` 使用 dual-path model。

tool home：

```text
~/.config/codex-switch/
  codex-switch.json
  providers.json
  backups/
  runtime/
  runtimes/
```

target Codex runtime：

```text
~/.codex/
  config.toml
  auth.json
```

说明：

- `providers.json` 不位于 `~/.codex`
- `backups/` 不位于 `~/.codex`
- tool home 承担管理态 SSOT
- target runtime 承担受管运行态投影

## 核心使用流程

Direct 主路径：

```bash
codexs init
codexs add <provider> --profile <name> --api-key <key>
codexs switch <provider>
codexs status
codexs doctor
```

Copilot 主路径：

```bash
codexs init
codexs login copilot
codexs add <provider> --copilot --profile <name>
codexs switch <provider>
codexs status
codexs doctor
```

Advanced adopt helper：

```bash
codexs init
codexs migrate
```

## 当前产品判断

`0.0.12` 的重点不是再加新命令，而是让用户在 README、help 和输出第一屏就能理解：

- fresh install 应先走什么
- Copilot 路径和 direct 路径有什么区别
- `migrate` 何时才该使用
- `status` / `doctor` 如何帮助定位下一步
