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

## 一句话定义

`codex-switch` 的 `0.1.0` 目标，是从一个已经具备 provider 管理和基础 config consistency 能力的本地 CLI，演进为一套对人类和 AI 都稳定、可初始化、可诊断、可恢复、可结构化管理配置、可持续扩展的发布级命令体系。

## 版本语义

- `0.0.x`：测试 / 验证阶段版本，用于收敛模型、命令面和失败语义
- `0.1.0`：第一条稳定发布规格线，不要求立即全部完成，但要求边界清晰
- 本文档描述的是 `0.0.5` 之后继续走向 `0.1.0` 的长期目标

## `0.1.0` 总体目标

`0.1.0` 需要同时满足以下目标：

- 保持 CLI 与 JSON 契约稳定
- 保持 `setup`、provider registry、备份恢复主线能力不回退
- 将 `config.toml` 从“可结构化读取与最小受管写入”推进到“稳定受管 provider-linked sections”
- 让 provider registry 与 linked config sections 的一致性成为默认能力
- 让备份与回滚继续覆盖所有关键写操作
- 为未来 auth / extension 集成保留明确边界

## 长期演进守则

后续新增命令统一遵守：

- 不破坏当前 JSON envelope
- 不复用语义不匹配的错误码
- 所有写命令默认纳入备份与回滚模型

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

到 `0.1.0` 为止，`config.toml` 的定位是“部分受管的 runtime projection”：

- 顶层 active `profile = "..."` 继续受管
- 与 provider 关联的 `[profiles.<name>]` section 进入受管范围
- 非 provider 相关的顶层键、section 和注释仍允许存在，但不进入通用编辑器范围

#### `ManagedProfileFields`

`0.1.0` 之前第一批稳定受管 profile 持久化字段先锁定为最小集合：

```json
{
  "model": "gpt-5"
}
```

约束：

- 第一批正式受管字段只锁 `model`
- `baseUrl` 等 endpoint 类字段继续只保留在 `providers.json`
- 后续扩展 profile 字段时，只能做加法

#### `ManagedProfileView`

面向 CLI、AI 和脚本输出的读取视图，与持久化字段分离：

```json
{
  "name": "packycode",
  "model": "gpt-5",
  "linkedProviders": ["packycode"],
  "isActive": true,
  "managed": true
}
```

### TOML 处理原则

为了支持结构化 config 管理，`0.1.0` 稳定主线要求：

- 不再以字符串匹配作为唯一 TOML 修改策略
- 对受管 section 的读取、创建、删除、重命名和字段更新，必须支持可验证的非破坏性结构化读取和修改
- 修改受管部分时，不应破坏非受管 TOML 内容、顺序、空行和注释

### 错误码演进原则

保留现有领域错误码，并把错误码体系从 MVP 复用模式收紧到语义匹配模式。

现有保留：

- `CONFIG_NOT_FOUND`
- `PROVIDERS_NOT_FOUND`
- `PROVIDERS_PARSE_ERROR`
- `PROVIDER_NOT_FOUND`
- `PROFILE_NOT_FOUND`
- `BACKUP_FAILED`
- `CODEX_LOGIN_FAILED`
- `ROLLBACK_FAILED`
- `LOCK_CONFLICT`
- `LIVE_STATE_DRIFT`

建议新增 / 预留：

- `INVALID_ARGUMENT`
- `UNKNOWN_COMMAND`
- `PROMPT_CANCELLED`
- `CODEX_NOT_INSTALLED`
- `CODEX_VERSION_UNSUPPORTED`
- `CODEX_DIR_NOT_FOUND`
- `CODEX_DIR_AMBIGUOUS`
- `PROVIDERS_ALREADY_EXISTS`
- `BACKUP_NOT_FOUND`
- `CONFIG_PARSE_ERROR`
- `PROFILE_IN_USE`
- `MANAGED_PROFILE_FIELDS_MISSING`

## 已落地能力的 `0.1.0` 稳定化要求

### `setup`

`setup` 在 `0.1.0` 主线中的要求是：

- 继续保持从环境检测到 registry 初始化的主流程
- 继续允许 `overwrite`、`merge` 和交互式补问缺失关键字段
- 与新的 config 管理能力保持兼容，不写出未来无法被结构化读取的受管状态
- 对历史遗留不一致状态给出 adopt / repair 建议，而不是静默忽略

### provider registry 命令

`show`、`edit`、`import --merge`、`backups list`、`rollback <backup-id>` 的 `0.1.0` 要求是：

- 保持命令名和基础 JSON 契约稳定
- 把错误语义继续收紧
- 让与 `config.toml` 关联的行为更完整

### `import --merge`

`import --merge` 在 `0.1.0` 主线中的要求是：

- 保持“导入侧覆盖本地同名 provider”的默认 merge 语义
- 不能只更新 `providers.json` 而放任 linked profile sections 漂移
- 当导入结果引用了缺失 profile 时，必须进入与 `add` / `edit` 一致的受管规则
- 非交互模式下，如果导入内容不能满足受管 profile 创建条件，应明确失败
- 交互模式下可以进入 adopt / repair 辅助流，但最终写入结果仍必须满足一致性约束

## `0.1.0` 远期能力域

下面这些方向明确有价值，但不进入 `0.0.5` 当前里程碑，只作为继续走向 `0.1.0` 的能力域。

### 第三方 auth / extension 集成

示例方向：

- 接入 Copilot auth
- 在本地启动代理服务，使特定上游可在 Codex 中使用
- 安装和管理第三方依赖

当前定位：

- 作为单独能力域保留
- 不在当前主 PRD 中锁定具体命令名和交互细节
- 不进入 `0.1.0` 稳定主线的验收标准

### 更大范围的 profile schema 管理

未来如果需要扩展：

- 可以逐步纳入 `model` 之外的 profile 字段
- 必须保持增量式 schema 扩展
- 不能在未定义字段契约前把 `config.toml` 直接提升为 full config manager

## 主题里程碑

从 `0.0.5` 走向 `0.1.0`，建议按能力主题推进：

### 里程碑 A：`0.0.5` / Config Management & Consistency

目标：

- 巩固结构化 TOML 读写
- 稳定 `config show`、`config list-profiles`
- 让 provider 管理命令可靠同步 linked profile sections
- 明确共享 profile、孤儿 section 和 active profile 安全规则

### 里程碑 B：Backup / Recovery Evolution

目标：

- 保持 `backups list` 与指定回滚能力稳定
- 确保跨 `providers.json` 与 `config.toml` 的双写场景仍可完整恢复
- 为更复杂的 config 变更继续复用同一事务模型

### 里程碑 C：Error Contract Hardening

目标：

- 收紧错误码语义
- 区分环境错误、参数错误、配置解析错误和恢复错误
- 保持 TTY / 非交互模式下的错误结果可预测

### 里程碑 D：Extensions / Auth Integration

目标：

- 评估第三方 auth 与本地代理集成
- 评估交互式依赖安装与 extension 管理
- 在不破坏主 CLI 契约的前提下扩展能力边界

## 对实现的要求

从 `0.0.5` 到 `0.1.0` 的所有新增能力，默认遵守：

- 命令帮助必须明确人类模式和 `--json` 模式行为
- 非交互环境不允许依赖 prompt 才能完成核心自动化流程
- 所有写命令默认走锁、备份、回滚
- 所有新增错误码都必须语义清晰
- 所有新增 JSON 返回都只能扩展 `data` 和 `warnings`
- 结构化 TOML 写回不能破坏非受管部分
- 多候选目录发现必须在交互和非交互模式下给出一致且可预测的行为

## `0.1.0` 目标完成标准

达到下面这些条件时，可以认为 `0.1.0` 主线目标基本收敛：

- 用户可以通过 `setup` 完成首次初始化
- `setup` 在多候选 Codex 目录场景下可交互选择或手动输入，在非交互场景下返回明确歧义错误
- provider registry 的查看、编辑、导入合并能力完整
- 用户和 AI 可以通过稳定命令结构化查看受管 `config.toml`
- `add` / `edit` / `remove` 执行后，`providers.json` 与 linked profile sections 不再出现预期内的一致性漂移
- 共享 profile 场景不会误删仍被引用的 section
- active profile 不会因为 provider 删除或 profile 迁移而变成悬空状态
- 历史 `0.0.4` / `0.0.5` 状态可以被识别，并通过 adopt / repair 路径逐步收敛
- 历史备份可被显式枚举和恢复
- CLI 错误码不再存在明显语义复用问题
- 主 CLI 契约对 AI 和脚本调用保持稳定

## 建议测试场景

至少需要覆盖：

- `config show` 与 `config list-profiles` 的稳定输出
- 共享 profile 场景下的 `add` / `edit` / `remove` 行为
- `setup` 在多目录候选下的交互和非交互分支
- `import --merge` 在缺失 profile / adopt / repair 下的一致性行为
- 结构化 TOML 修改后，非受管内容、顺序和注释保持稳定
- 双写失败时 `providers.json` 与 `config.toml` 能整体回滚
- 历史 workspace、共享 profile、孤儿 profile section、缺失 linked section 都能被 `doctor` / `status` 正确识别

## 结论

`0.1.0` 不是简单把 `0.0.x` 重命名为稳定版，而是在保持当前本地事务式切换模型不变的前提下，进一步收敛 config 管理、错误契约和恢复能力，并为未来更大范围的 auth / extension 集成留出清晰边界。
