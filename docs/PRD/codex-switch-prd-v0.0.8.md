# codex-switch `0.0.8` PRD

## 文档信息

- 状态：Active PRD
- 产品名：`codex-switch`
- CLI 命令名：`codexs`
- 当前基线版本：`0.0.7`
- 目标版本：`0.0.8`
- 文档定位：定义 `0.0.7 -> 0.0.8` 的直接需求范围
- 关联设计文档：[`../Design/codex-switch-v0.0.8-design.md`](../Design/codex-switch-v0.0.8-design.md)

## 一句话定义

`0.0.8` 的目标，是让用户可以把 GitHub Copilot 作为受管 provider 接入 Codex：通过官方 `@github/copilot-sdk` 完成上游鉴权与请求执行，并通过本地 OpenAI 兼容 bridge 供 Codex 使用。

## In Scope

- 官方 `@github/copilot-sdk`
- 本地 Node/TypeScript bridge
- `POST /v1/chat/completions`
- JSON 和 stream 返回
- premium request 默认开启
- `add --copilot`
- `switch` 的 runtime gate
- `status` / `doctor` 的 Copilot runtime 诊断
- lazy-load SDK
- TTY 确认后自动安装 SDK
- 非交互 `--install-copilot-sdk`

## Out of Scope

- 非官方 SDK
- 独立 `copilot` / `proxy` 命令族
- Responses API、Embeddings、图像/音频接口
- 持久化 GitHub token 到 `providers.json` / `auth.json`
- 多实例 bridge 编排
- GUI、后台控制台

## 依赖策略

- `@github/copilot-sdk` 不进入 core CLI 默认依赖
- 命中 Copilot 路径时才 probe SDK
- SDK 运行前提是用户本机已具备可用的 GitHub Copilot CLI / login 状态，`codex-switch` 不托管这部分登录数据
- TTY 下缺失 SDK 时提示确认，确认后允许自动安装
- 安装目录固定为用户级 runtime 目录
- 非交互或 `--json` 默认失败
- 非交互只有在显式 `--install-copilot-sdk` 时才允许安装

## 数据边界

- `providers.json` 保存本地 bridge 配置与 bridge shared secret
- `config.toml` 保存 bridge `base_url` 和 `env_key`
- `auth.json` 只保存 Codex 到 bridge 的 shared secret
- GitHub/Copilot 上游认证状态只由官方 SDK 管理，不进入受管 registry

## 验收标准

- `add --copilot` 可以创建 Copilot provider
- `switch` 到 Copilot provider 时完成 `probe -> install if allowed -> auth check -> bridge health -> config/auth write`
- `status` / `doctor` 能诊断 SDK 缺失、安装失败、认证缺失、bridge 不健康、runtime base_url 漂移
- 现有 direct provider 行为不回退
