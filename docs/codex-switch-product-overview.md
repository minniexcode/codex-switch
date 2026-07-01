# codex-switch 产品文档

## 文档定位

这份文档介绍当前活跃产品事实源下的 `codex-switch` 产品定位。

当前仓库开发线 fact source 以这些文档为准：

- [`cli-usage.md`](./cli-usage.md)
- [`PRD/codex-switch-prd-v0.1.0.md`](./PRD/codex-switch-prd-v0.1.0.md)
- [`PRD/codex-switch-prd-v0.1.1.md`](./PRD/codex-switch-prd-v0.1.1.md)
- [`PRD/codex-switch-prd-v0.1.2.md`](./PRD/codex-switch-prd-v0.1.2.md)
- [`PRD/codex-switch-prd-v0.1.3.md`](./PRD/codex-switch-prd-v0.1.3.md)
- [`PRD/codex-switch-prd-v0.1.5.md`](./PRD/codex-switch-prd-v0.1.5.md)
- [`Design/codex-switch-v0.1.2-design.md`](./Design/codex-switch-v0.1.2-design.md)
- [`Design/codex-switch-v0.1.3-design.md`](./Design/codex-switch-v0.1.3-design.md)
- [`Design/codex-switch-v0.1.5-design.md`](./Design/codex-switch-v0.1.5-design.md)

## 产品概述

`codex-switch` 是一个本地 provider 管理 CLI，用于管理和切换目标 Codex runtime 的 provider/model-provider 路由配置，同时把工具自己的管理态保存在独立 tool home 下。

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
codexs add <provider> --profile <model-provider-id> --model <model> --api-key <key> [--base-url <url>]
codexs switch <provider>
codexs status
codexs doctor
```

Copilot 主路径：

```bash
codexs init
codexs login copilot
codexs add <provider> --copilot --profile <model-provider-id> --model <model>
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

`0.1.1` 的重点不是再加新命令，而是让用户在 README、help 和输出第一屏就能理解：

- fresh install 应先走什么
- Copilot 路径和 direct 路径有什么区别
- 非交互命令为什么应显式传 `--profile`，以及 TTY 模式下哪些缺失项可以补问
- `migrate` 何时才该使用
- `status` / `doctor` 如何帮助定位下一步
- 当前运行态是用顶层 `model` 与 `model_provider` 选择活动路由

`0.1.5` 是当前仓库开发线，重点不是扩展 provider 面，而是让已有 Copilot bridge 实验路径具备过程可见性：SDK 事件被归一化为稳定运行态事件，Responses 流可以显示 commentary/reasoning 信号，未知事件摘要会被脱敏和截断。当前实现边界仍然是：Copilot 路径要求 Node.js `>=20`，受管安装默认固定到 `@github/copilot-sdk@1.0.2`，本地 bridge 仍然只是面向 simple text-oriented turns 的 experimental bridge；Direct provider 路径继续支持 Node.js `>=18`。
