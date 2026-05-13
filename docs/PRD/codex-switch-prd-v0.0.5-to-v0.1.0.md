# codex-switch `0.0.5 -> 0.1.0` 演进 PRD

## 文档信息

- 状态：Target PRD
- 产品名：`codex-switch`
- CLI 命令名：`codexs`
- 当前阶段基线：`0.0.5`
- 目标版本：`0.1.0`
- 文档定位：定义 `0.0.5` 之后持续演进到 `0.1.0` 的目标规格与路线
- 当前活跃 PRD：[`codex-switch-prd-v0.1.0.md`](./codex-switch-prd-v0.1.0.md)
- 历史基线 PRD：[`codex-switch-prd.md`](./codex-switch-prd.md)
- 对应研究稿：[`../codex-switch-product-research.md`](../codex-switch-product-research.md)
- 对应技术架构：[`../codex-switch-technical-architecture.md`](../codex-switch-technical-architecture.md)
- 对应命令设计：[`../codex-switch-command-design.md`](../codex-switch-command-design.md)

说明：

- 当前 active PRD 文件名沿用历史命名，但正文语义已更新为 `0.0.6`
- 本文档以“版本演进路线”而不是“文件名字面值”作为解释基准

## 一句话定义

`codex-switch` 的 `0.1.0` 目标，是从一个已经具备 provider 管理、config consistency 和本地事务能力的 CLI，演进为一套对人类、AI 和后续集成层都稳定的发布级命令体系，并能够承载第三方 auth、本地代理和外部依赖接入这类扩展能力。

## 版本语义

- `0.0.x`：测试 / 验证阶段版本，用于收敛命令面、错误契约、事务安全与模块边界
- `0.0.6`：稳定性修复 + 模块化重构里程碑，为后续 integration-ready 能力打基础
- `0.1.0`：第一条稳定发布规格线，要求公共契约、恢复能力和扩展边界清晰

## `0.1.0` 总体目标

`0.1.0` 需要同时满足以下目标：

- 保持 CLI 与 JSON 契约稳定
- 保持 `setup`、provider registry、备份恢复主线能力不回退
- 让 provider registry 与 linked config sections 的一致性成为默认能力
- 让备份、回滚和诊断继续覆盖所有关键写操作
- 让模块边界足以承载未来第三方 auth / proxy / SDK 集成
- 在不破坏主 CLI 契约的前提下扩展运行时能力边界

## 长期演进守则

后续新增能力统一遵守：

- 不破坏当前 JSON envelope
- 不复用语义不匹配的错误码
- 所有写命令默认纳入备份与回滚模型
- 所有交互都只是 TTY 增强层，不改变自动化显式契约

## 稳定公共契约

### JSON Envelope

`--json` 继续保持统一 envelope：

```json
{
  "ok": true,
  "command": "list",
  "data": {},
  "warnings": [],
  "error": null
}
```

约束：

- 顶层 shape 保持不变
- 后续字段扩展只做加法
- 详细结果进入 `data`
- 非致命提示进入 `warnings`
- 结构化失败信息继续进入 `error`

### 数据模型

#### `providers.json`

`providers.json` 继续是 managed registry 的单一事实源：

```json
{
  "providers": {
    "packycode": {
      "profile": "packycode",
      "apiKey": "sk-xxx",
      "baseUrl": "https://example.com/v1",
      "note": "primary free model route",
      "tags": ["free", "daily"]
    }
  }
}
```

到 `0.1.0` 为止默认不放宽：

- `profile` 仍然必填
- `apiKey` 仍按完整 managed provider 处理
- 不引入“半初始化 provider”作为正式稳定状态

#### `config.toml`

到 `0.1.0` 为止，`config.toml` 的定位继续是“部分受管的 runtime projection”：

- 顶层 active `profile = "..."` 继续受管
- 与 provider 关联的 `[profiles.<name>]` section 进入受管范围
- 非 provider 相关的顶层键、section 和注释仍允许存在，但不进入通用编辑器范围

#### `ManagedProfileFields`

`0.1.0` 之前第一批稳定受管 profile 持久化字段继续锁定为最小集合：

```json
{
  "model": "gpt-5",
  "modelProvider": "packycode"
}
```

约束：

- 第一批正式受管字段锁 `model` 与 `model_provider`
- `baseUrl` 作为读取视图字段，可由 `model_provider -> model_providers.<name>.base_url` 解析
- 后续扩展 profile 字段时，只能做加法

## `0.1.0` 模块化目标

### 核心结构方向

到 `0.1.0` 为止，`codex-switch` 不应只停留在“`cli / app / domain / infra` 四层可用”这个层次，而应进一步收敛出稳定的能力边界：

- `Command Surface`
- `Interaction Layer`
- `Application Use Cases`
- `Domain Policies`
- `Storage Repositories`
- `Runtime Integrations`

这些边界的意义不是强制锁死具体类名，而是保证未来新增能力不会继续把复杂度堆回单一 CLI 入口。

### Runtime Integrations 的长期定位

`Runtime Integrations` 是 `0.1.0` 目标线中必须预留清楚的能力域，负责：

- `codex` CLI 调用与可用性检查
- 第三方 auth adapter
- 本地 proxy runtime
- 外部 SDK / 二进制依赖可用性探测
- integration 级错误语义收敛

## 已落地能力的 `0.1.0` 稳定化要求

### `setup`

`setup` 在 `0.1.0` 主线中的要求是：

- 继续保持从环境检测到 registry 初始化的主流程
- 继续允许 `overwrite`、`merge` 和交互式补问缺失关键字段
- 与 config 管理能力和未来 runtime integration 边界保持兼容
- 对历史遗留不一致状态给出 adopt / repair 建议，而不是静默忽略

### provider registry 命令

`show`、`edit`、`import --merge`、`backups list`、`rollback <backup-id>` 的 `0.1.0` 要求是：

- 保持命令名和基础 JSON 契约稳定
- 把错误语义继续收紧
- 让与 `config.toml` 关联的行为更完整
- 不因引入第三方集成而改变现有 provider/config 的领域边界

### `import --merge`

`import --merge` 在 `0.1.0` 主线中的要求是：

- 保持“导入侧覆盖本地同名 provider”的默认 merge 语义
- 不能只更新 `providers.json` 而放任 linked profile sections 漂移
- 当导入结果引用了缺失 profile 时，必须进入与 `add` / `edit` 一致的受管规则
- 非交互模式下，如果导入内容不能满足受管 profile 创建条件，应明确失败
- 交互模式下可以进入 adopt 辅助流，但不会为缺失 `model_providers` runtime section 做隐式 repair

## `0.1.0` 主线能力域

下面这些方向不要求在 `0.0.6` 全部交付，但它们不再只是模糊远期方向，而是 `0.1.0` 主线需要承接的能力域。

### Config Management & Consistency

目标：

- 巩固结构化 TOML 读写
- 稳定 `config-show`、`config-list-profiles`
- 让 provider 管理命令可靠同步 linked profile sections
- 明确共享 profile、孤儿 section 和 active profile 安全规则

### Backup / Recovery Evolution

目标：

- 保持 `backups` 与指定回滚能力稳定
- 确保跨 `providers.json`、`config.toml`、`auth.json` 的多文件写入仍可完整恢复
- 为更复杂的 runtime 变更继续复用同一事务模型

### Error Contract Hardening

目标：

- 收紧错误码语义
- 区分环境错误、参数错误、配置解析错误、集成错误和恢复错误
- 保持 TTY / 非交互模式下的错误结果可预测

### Third-Party Auth Adapters

目标：

- 支持把第三方认证来源封装为独立 integration 能力
- 不把第三方 auth 状态直接混入 provider registry 事实源
- 对 token 获取、刷新、失效和依赖缺失提供稳定诊断语义

### Local Proxy Runtime

目标：

- 为需要本地代理的上游保留运行时承载能力
- 允许启动、检查、停止或探测代理状态的能力进入集成层
- 不破坏现有 provider/profile 切换和回滚模型

### External Dependency Lifecycle

目标：

- 识别和诊断外部 SDK、CLI、二进制依赖是否可用
- 把依赖缺失、版本不兼容、环境不可执行等问题映射到清晰错误语义
- 为未来的依赖安装或引导能力留出接口，但不强制 `0.0.x` 提前产品化

## GitHub Copilot 代表性场景

GitHub Copilot 在演进 PRD 中的定位是代表性用例，而不是唯一目标：

- 可作为第三方 auth adapter 的首个高价值案例
- 可作为本地 proxy runtime 需求的首个真实驱动
- 可用来验证 `Runtime Integrations` 分层是否足够清楚

当前不提前锁定：

- 具体命令名
- 具体交互流程
- `@github/copilot-sdk` 的封装形态
- 本地代理协议和生命周期细节

## 主题里程碑

从 `0.0.5` 走向 `0.1.0`，建议按能力主题推进：

### 里程碑 A：`0.0.5` / Config Management & Consistency

目标：

- 巩固结构化 TOML 读写
- 稳定 `config-show`、`config-list-profiles`
- 让 provider 管理命令可靠同步 linked profile sections
- 明确共享 profile、孤儿 section 和 active profile 安全规则

### 里程碑 B：`0.0.6` / Stability & Modularization

目标：

- 修复 `0.0.5` 已落地命令的稳定性问题
- 统一 help、交互、错误语义和恢复模型
- 解决 `cli.ts` 过重问题，明确 command / interaction / application / integration 边界
- 为第三方 auth / proxy / SDK 集成建立 integration-ready 架构基础

### 里程碑 C：Backup / Recovery Evolution

目标：

- 保持历史备份、显式回滚和多文件恢复稳定
- 让更复杂的 runtime 变更继续复用同一事务模型

### 里程碑 D：Error Contract Hardening

目标：

- 收紧错误码语义
- 区分环境错误、参数错误、配置解析错误和恢复错误
- 对第三方 integration 的失败提供清晰可预测的错误契约

### 里程碑 E：Integrations & Runtime Expansion

目标：

- 逐步引入第三方 auth adapter
- 逐步引入本地 proxy runtime
- 逐步引入外部依赖可用性管理
- 在不破坏主 CLI 契约的前提下扩展能力边界

## 对实现的要求

从 `0.0.5` 到 `0.1.0` 的所有新增能力，默认遵守：

- 命令帮助必须明确人类模式和 `--json` 模式行为
- 非交互环境不允许依赖 prompt 才能完成核心自动化流程
- 所有写命令默认走锁、备份、回滚
- 所有新增错误码都必须语义清晰
- 所有新增 JSON 返回都只能扩展 `data` 和 `warnings`
- 结构化 TOML 写回不能破坏非受管部分
- 第三方 integration 不得直接破坏 provider registry 作为 SSOT 的边界
- 多候选目录发现和依赖可用性检查必须在交互与非交互模式下给出一致且可预测的行为

## `0.1.0` 目标完成标准

达到下面这些条件时，可以认为 `0.1.0` 主线目标基本收敛：

- 用户可以通过 `setup` 完成首次初始化
- `setup` 在多候选 Codex 目录场景下可交互选择或手动输入，在非交互场景下返回明确歧义错误
- provider registry 的查看、编辑、导入合并能力完整
- 用户和 AI 可以通过稳定命令结构化查看受管 `config.toml`
- `add` / `edit` / `remove` 执行后，`providers.json` 与 linked profile sections 不再出现预期内的一致性漂移
- 共享 profile 场景不会误删仍被引用的 section
- active profile 不会因为 provider 删除或 profile 迁移而变成悬空状态
- 历史 `0.0.4` / `0.0.5` / `0.0.6` 状态可以被识别，并通过 adopt / repair 路径逐步收敛
- 历史备份可被显式枚举和恢复
- CLI 错误码不再存在明显语义复用问题
- 第三方 auth / proxy / 外部依赖能力可以通过独立 integration 边界接入，而不破坏主 CLI 契约

## 建议测试场景

至少需要覆盖：

- `config-show` 与 `config-list-profiles` 的稳定输出
- 共享 profile 场景下的 `add` / `edit` / `remove` 行为
- `setup` 在多目录候选下的交互和非交互分支
- `import --merge` 在缺失 profile / adopt / repair 下的一致性行为
- 结构化 TOML 修改后，非受管内容、顺序和注释保持稳定
- 双写失败时 `providers.json`、`config.toml` 与 `auth.json` 能整体回滚
- 历史 workspace、共享 profile、孤儿 profile section、缺失 linked section 都能被 `doctor` / `status` 正确识别
- 外部 CLI / SDK / auth integration 缺失或不可用时，错误语义清晰且不污染核心 provider/config 状态

## 结论

`0.1.0` 不是简单把 `0.0.x` 重命名为稳定版，而是在保持当前本地事务式切换模型不变的前提下，进一步收敛 config 管理、错误契约、恢复能力和模块化扩展边界，并把第三方 auth、本地代理和外部依赖接入正式纳入主线能力域。
