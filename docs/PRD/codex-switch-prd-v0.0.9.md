# codex-switch `0.0.9` PRD

## 文档信息

- 状态：Active PRD
- 产品名：`codex-switch`
- CLI 命令名：`codexs`
- 当前基线版本：`0.0.8`
- 目标版本：`0.0.9`
- 文档定位：定义 `0.0.8 -> 0.0.9` 的直接需求范围
- 关联设计文档：`../Design/codex-switch-v0.0.9-design.md`（待产出）
- 关联上一版设计：[`../Design/codex-switch-v0.0.8-design.md`](../Design/codex-switch-v0.0.8-design.md)

## 一句话定义

`0.0.9` 的目标，是把 GitHub Copilot 的本地 bridge 从“切换时临时可用”收敛成“可按需自动拉起、可手动管理、可诊断恢复”的稳定运行态能力。

## In Scope

- 官方 `@github/copilot-sdk`
- 本地 Node/TypeScript bridge
- detached 用户态 bridge 守护进程
- `switch` 的 bridge 自动启动 / 复用
- `bridge start`
- `bridge stop`
- `bridge status`
- 单实例 bridge 生命周期管理
- 5 位数 bridge 端口默认策略
- 端口冲突自动探测与自动换端口
- runtime state manifest 的持久化与诊断
- `status` / `doctor` 的 bridge 生命周期诊断
- direct provider 回归稳定性

## Out of Scope

- 开机自启动
- 登录自启动
- Windows Service / 系统服务注册
- 多实例 bridge 编排
- 非官方 SDK
- 独立 GUI / TUI
- Responses API、Embeddings、图像/音频接口
- 持久化 GitHub token 到 `providers.json` / `auth.json`

## 运行形态

- bridge 是由 `codex-switch` 启动和管理的本地后台进程
- bridge 不是系统服务，也不注册开机或登录自动启动项
- `switch` 到 Copilot provider 时，bridge 应自动启动或复用
- 用户也可以通过 `bridge` 命令族手动启动、停止和查看状态
- `0.0.9` 的“守护进程”语义仅指 detached 用户态后台进程，不等同于 OS service

## 命令面

新增命令：

- `codexs bridge start [provider]`
- `codexs bridge stop [provider]`
- `codexs bridge status [provider]`

命令规则：

- `bridge` 命令族只服务于 Copilot runtime-backed provider
- `provider` 可显式传入；未传入时优先使用当前 active provider
- 如果未传入且当前 active provider 不是 Copilot provider：
  - TTY 下允许交互选择目标 Copilot provider
  - 非交互或 `--json` 下必须明确失败
- `bridge start` 必须先完成：
  - provider 解析
  - runtime 配置校验
  - SDK probe
  - Copilot auth state 校验
  - bridge 启动或复用
  - healthcheck
- `bridge stop` 只停止当前受管 bridge 进程并清理 runtime state manifest，不修改 provider registry
- `bridge status` 返回 runtime state、provider 绑定关系、healthcheck 结果与异常原因

## 生命周期规则

- `add --copilot` 只负责创建 provider 和可选安装 SDK，不负责启动 bridge
- `switch <copilot-provider>` 仍然是最常见的自动启动入口
- `bridge start` 与 `switch` 共享同一套 bridge 启动与复用逻辑
- 同一时刻只允许一个 bridge 实例处于受管运行状态
- 如果 bridge 已为同一 provider 运行且健康，则 `bridge start` 和 `switch` 都直接复用
- 如果已有 bridge 为另一 Copilot provider 运行：
  - `bridge start <new-provider>` 先停止旧实例，再启动新实例
  - `switch <new-provider>` 也遵守同样的单实例替换规则
- `bridge stop` 应该是幂等的：bridge 已停止时不报致命错误

## 端口策略

- `--bridge-host` 默认 `127.0.0.1`
- `--bridge-port` 默认值必须是 5 位数端口
- Copilot provider 的默认端口不再使用 `4141`
- 如果 provider 指定端口已被占用：
  - bridge 启动阶段必须自动检测冲突
  - 自动选择新的可用 5 位数端口
  - 自动更新 provider 的 runtime 配置和对应 `baseUrl`
  - 自动保持 `config.toml` runtime projection 与 provider 配置一致
- 自动换端口后的新端口必须持久化，避免下一次启动再次撞到旧端口
- 端口自动切换只允许在 Copilot bridge provider 路径发生，不能影响 direct provider

## 依赖策略

- `@github/copilot-sdk` 继续不进入 core CLI 默认依赖
- 命中 Copilot 路径时才 probe SDK
- SDK 自动安装仍然只允许发生在 `add --copilot`
- `bridge start`、`switch`、`status`、`doctor` 都不能隐式安装 SDK
- `bridge start` 在 SDK 缺失时必须明确失败，并提示回到 `add --copilot --install-copilot-sdk`
- SDK 运行前提仍然是用户本机已具备可用的 GitHub Copilot CLI / login 状态，`codex-switch` 不托管这部分登录数据

## 数据边界

- `providers.json` 保存 Copilot provider、bridge host/port、`baseUrl` 与 shared secret
- `config.toml` 保存 Copilot provider 对应的 runtime `base_url` 与 `env_key`
- `auth.json` 只保存 Codex 到本地 bridge 的 shared secret
- runtime state manifest 保存当前 bridge 进程状态、provider 绑定、最后健康检查时间
- runtime state manifest 不进入 managed backup 事务
- GitHub/Copilot 上游认证状态仍然只由官方 SDK 管理，不进入受管 registry

## 错误语义

`0.0.9` 继续稳定并收敛以下错误码：

- `COPILOT_SDK_MISSING`
- `COPILOT_SDK_INSTALL_FAILED`
- `COPILOT_SDK_INSTALL_REQUIRES_TTY`
- `COPILOT_SDK_UNSUPPORTED`
- `COPILOT_AUTH_REQUIRED`
- `COPILOT_PREMIUM_UNAVAILABLE`
- `BRIDGE_PORT_CONFLICT`
- `BRIDGE_START_FAILED`
- `BRIDGE_HEALTHCHECK_FAILED`
- `RUNTIME_PROVIDER_INVALID`
- `PROVIDER_BASE_URL_MISMATCH`

新增要求：

- `bridge start`、`switch`、`bridge status` 对同一类 bridge 失败应尽量映射到同一类错误码
- 端口冲突在自动恢复成功时不应向上冒泡为致命失败
- 只有在无法找到可用端口或无法持久化新端口时，才允许保留 `BRIDGE_PORT_CONFLICT` 失败

## 验收标准

- `add --copilot` 可以创建 Copilot provider，并写入 5 位数默认端口
- `switch` 到 Copilot provider 时完成 `probe -> auth check -> start or reuse bridge -> healthcheck -> config/auth write`
- `codexs bridge start [provider]` 可以手动启动或复用 bridge
- `codexs bridge stop [provider]` 可以手动停止当前 bridge，并清理 runtime state
- `codexs bridge status [provider]` 可以给出 bridge 是否运行、绑定哪个 provider、端口是多少、是否健康
- 当 bridge 目标端口被占用时，系统会自动切换到新的可用 5 位数端口，并持久化该变更
- direct provider 不经过 Copilot 特有的 runtime gate
- `status` / `doctor` 能诊断 SDK 缺失、认证缺失、bridge 不健康、stale runtime state、runtime base_url 漂移

## 测试重点

- `bridge start/stop/status` 参数解析与帮助文案
- 省略 provider 时的 active provider 解析路径
- TTY 下的 Copilot provider 交互选择路径
- 非交互下目标 provider 不明确时的失败路径
- 单实例 bridge 的复用路径
- 单实例 bridge 的替换路径
- `switch` 与 `bridge start` 共享生命周期逻辑的回归
- 端口占用时的自动换端口与持久化
- stale runtime state 的诊断与清理
- `bridge stop` 幂等性
- direct provider 回归
