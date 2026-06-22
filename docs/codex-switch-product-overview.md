# codex-switch 产品文档

## 文档定位

这份文档介绍当前活跃产品事实源下的 `codex-switch` 产品定位。

当前稳定 release contract 以这些文档为准：

- [`cli-usage.md`](./cli-usage.md)
- [`PRD/codex-switch-prd-v0.1.0.md`](./PRD/codex-switch-prd-v0.1.0.md)
- [`PRD/codex-switch-prd-v0.1.1.md`](./PRD/codex-switch-prd-v0.1.1.md)
- [`PRD/codex-switch-prd-v0.1.2.md`](./PRD/codex-switch-prd-v0.1.2.md)（规划中）
- [`Design/codex-switch-v0.1.2-design.md`](./Design/codex-switch-v0.1.2-design.md)（规划中）

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
codexs add <provider> --model <model> --api-key <key> [--base-url <url>]
codexs switch <provider>
codexs status
codexs doctor
```

Copilot 主路径：

```bash
codexs init
codexs login copilot
codexs add <provider> --copilot --model <model>
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
- `migrate` 何时才该使用
- `status` / `doctor` 如何帮助定位下一步
- 当前运行态是用顶层 `model` 与 `model_provider` 选择活动路由

`0.1.2` 是规划中的 Copilot runtime 修复线，不是当前已发布包版本。当前实现边界是：Copilot 路径要求 Node.js `>=20`，受管安装默认固定到 `@github/copilot-sdk@1.0.2`，运行时会额外拒绝过旧版本和 prerelease 版本，并在真正创建 client 或 session 时验证 SDK API shape；本地 bridge 仍然只是面向 simple text-oriented turns 的 experimental bridge。Direct provider 路径继续支持 Node.js `>=18`。
