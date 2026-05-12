# codex-switch `0.1.0` 目标 PRD

## 文档信息

- 状态：Target PRD
- 产品名：`codex-switch`
- CLI 命令名：`codexs`
- 当前基线版本：`0.0.4`
- 目标版本：`0.1.0`
- 文档定位：从 `0.0.4` 走向 `0.1.0` 的目标规格与阶段性演进路线
- 历史基线 PRD：[`codex-switch-prd.md`](./codex-switch-prd.md)
- 对应研究稿：[`../codex-switch-product-research.md`](../codex-switch-product-research.md)
- 对应技术架构：[`../codex-switch-technical-architecture.md`](../codex-switch-technical-architecture.md)
- 对应命令设计：[`../codex-switch-command-design.md`](../codex-switch-command-design.md)

## 一句话定义

`codex-switch` 的 `0.1.0` 目标，是从一个已经可用的本地 provider/profile 管理 CLI，演进为一套对人类和 AI 都稳定、可初始化、可诊断、可恢复、可结构化管理配置、可持续扩展的发布级命令体系。

## 版本语义

- `0.0.x`：测试 / 验证阶段版本，用于收敛模型、命令面和失败语义
- `0.1.0`：第一条稳定发布规格线，不要求当前立刻完成，但要求目标边界清晰
- 当前仓库状态：`0.0.4` 已具备 bootstrap、provider 查看编辑、备份枚举和指定回滚等主线能力

这意味着本文件不是“下一版马上发布什么”的短期计划，而是 `0.0.4` 之后持续演进到 `0.1.0` 的目标 PRD。

## 当前基线：`0.0.4`

当前已落地能力：

- `list` / `current` / `status`
- `switch <provider>`
- `import <file>` / `import <file> --merge` / `export <file>`
- `add <provider>` / `edit <provider>` / `show <provider>` / `remove <provider>`
- `setup`
- `doctor`
- `backups list`
- `rollback` / `rollback <backup-id>`

当前基线已经具备的工程特征：

- 本地文件模型围绕 `~/.codex/`
- `providers.json` 作为 management SSOT
- `config.toml` 与 `auth.json` 作为 runtime state
- 写命令统一走备份、锁和失败回滚
- `--json` 输出固定 envelope
- 高频写命令支持 TTY 渐进式交互

当前基线仍然存在的边界：

- `config.toml` 仍以轻量字符串匹配方式处理
- 当前只能稳定读取顶层 `profile`、识别 `[profiles.xxx]`、替换顶层 `profile`
- provider 管理命令仍以 `providers.json` 为主，不能同步维护 linked profile sections
- 缺少结构化展示 `config.toml` 的稳定命令面
- 错误码体系仍带有一部分 MVP 阶段的复用痕迹
- 尚未进入第三方 auth / extension 集成阶段

## `0.1.0` 目标

`0.1.0` 需要同时满足以下目标：

- 保持当前 CLI 和 JSON 契约稳定
- 保持 `setup`、provider registry、备份恢复主线已经可用的能力不回退
- 把 `config.toml` 从“仅能浅层切换 current profile”推进到“可结构化读取、可受控同步 provider-linked profile sections”
- 让 provider registry 与 linked config sections 的一致性成为稳定能力，而不是手工维护
- 让备份与回滚继续覆盖所有关键写操作
- 为未来 auth / extension 集成保留明确边界，而不把远期需求提前塞进稳定主线

## 长期演进守则

如果继续扩展命令面，后续新增命令统一遵守下面三条：

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

`0.1.0` 之前默认不放宽这个模型：

- `profile` 仍然必填
- `apiKey` 仍然按完整 managed provider 处理
- 不引入“半初始化 provider”作为正式稳定状态

#### `config.toml`

到 `0.1.0` 为止，`config.toml` 的定位从纯运行态镜像调整为“部分受管的 runtime projection”：

- 顶层 active `profile = "..."` 继续受管
- 与 provider 关联的 `[profiles.<name>]` section 进入受管范围
- 非 provider 相关的顶层键、section 和注释仍然允许存在，但不进入通用编辑器范围

这里的“部分受管”有两个明确约束：

- `providers.json` 仍然是 provider 身份、凭据和管理元数据的 SSOT
- `config.toml` 不提升为与 `providers.json` 对等的事实源，而是受控投影

#### `ManagedProfileConfig`

`0.0.5` 到 `0.1.0` 的第一批稳定 profile 配置字段，先锁定为最小集合：

```json
{
  "name": "packycode",
  "model": "gpt-5",
  "linkedProviders": ["packycode"],
  "isActive": true
}
```

约束：

- 第一批正式受管字段只锁 `model`
- endpoint 类字段和更大 profile schema 先不在 `0.1.0` PRD 中写死
- 后续扩展 profile 字段时，只能做加法

### TOML 处理原则

为了支持结构化 config 管理，`0.1.0` 稳定主线要求：

- 不再以字符串匹配作为唯一 TOML 修改策略
- 对受管 section 的读取、创建、删除、重命名和字段更新，应采用 round-trip / AST 级结构化处理
- 修改受管部分时，不应破坏非受管 TOML 内容、顺序、空行和注释

这条要求不意味着 `codex-switch` 要变成 full TOML editor，而是要求它在“自己声明受管的部分”上能稳定修改。

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
- `IMPORT_MERGE_CONFLICT`
- `BACKUP_NOT_FOUND`
- `CONFIG_PARSE_ERROR`
- `PROFILE_IN_USE`
- `MANAGED_PROFILE_FIELDS_MISSING`

约束：

- `CODEX_LOGIN_FAILED` 只表示登录失败
- codex 缺失与版本过低必须使用环境类错误码
- rollback 找不到目标备份时必须使用恢复类错误码
- TOML 结构化解析失败必须使用 `CONFIG_PARSE_ERROR`
- 因 profile 仍被引用而不能删除时，必须使用 `PROFILE_IN_USE`

## 已落地能力的 `0.1.0` 稳定化要求

### `setup`

`setup` 已是当前基线能力，在 `0.1.0` 主线中的要求是：

- 继续保持从环境检测到 registry 初始化的主流程
- 继续允许 `overwrite`、`merge` 和交互式补问缺失关键字段
- 与新的 config 管理能力保持兼容，不写出未来无法被结构化读取的受管状态

### provider registry 命令

`show`、`edit`、`import --merge`、`backups list`、`rollback <backup-id>` 已经是当前基线能力。

`0.1.0` 的要求不是重新定义它们是否存在，而是：

- 保持命令名和基础 JSON 契约稳定
- 把错误语义继续收紧
- 让与 `config.toml` 关联的行为更完整

## `0.0.5` 功能里程碑：Config Management & Provider-Config Consistency

`0.0.5` 是从 `0.0.4` 走向 `0.1.0` 的下一条主线，核心不是再加几个孤立命令，而是补齐 `config.toml` 的结构化管理能力。

### 1. 目标

`0.0.5` 需要解决以下核心问题：

- 当前 TOML 处理主要依赖字符串匹配，无法稳定编辑 provider-linked profile sections
- 当前 `add` / `edit` / `remove` 只维护 `providers.json`，可能把 `config.toml` 留在不一致状态
- 当前缺少结构化展示 config 的命令，AI 和脚本无法稳定读取 profile section 视图

### 2. 受管范围

`0.0.5` 的 config 管理范围只锁到 provider-linked 部分：

- 顶层 active `profile`
- `[profiles.<name>]` 受管 section
- 第一批正式受管字段：`model`

明确不在 `0.0.5` 范围内的内容：

- 整个 `config.toml` 的通用编辑器
- 任意顶层键的自由增删改
- endpoint 等更大 profile schema 的首版正式规格

### 3. 共享与引用规则

多个 provider 指向同一个 profile 在 `0.1.0` 之前继续合法。

这意味着：

- profile section 不默认归某一个 provider 独占
- 只有当没有任何 provider 继续引用某个 profile 时，才允许删除对应 section
- remove / edit 不能因为操作单个 provider 就误删共享 profile

### 4. 新增命令面

#### `codexs config show`

目标：

- 结构化展示受管 config 视图
- 同时服务人类和 AI / 自动化读取

建议输入：

```bash
codexs config show [profile] [--json] [--codex-dir <path>]
```

建议 JSON `data` 至少包含：

- `activeProfile`
- `profiles`
- `linkedProviders`
- `managedFields`

当显式给出 `[profile]` 时，应返回单 profile 视图而不是完整列表。

#### `codexs config list-profiles`

目标：

- 列出当前 `config.toml` 中可受管的 profile 视图
- 明确显示 profile 与 provider 的关联关系

建议输入：

```bash
codexs config list-profiles [--json] [--codex-dir <path>]
```

建议 JSON `data.profiles[]` 至少包含：

- `name`
- `isActive`
- `linkedProviders`
- `model`

### 5. 现有写命令的升级语义

#### `codexs add <provider>`

`add` 在 `0.0.5` 中升级为 provider + linked config 双写操作：

- 继续写入 `providers.json`
- 当目标 profile 已存在时，允许直接建立 provider 到 profile 的映射
- 当目标 profile 不存在时，只有在显式提供最小受管字段 `model` 的前提下，才允许创建新的 `[profiles.<name>]` section
- 若缺少创建 section 所需的最小字段，返回 `MANAGED_PROFILE_FIELDS_MISSING`

#### `codexs edit <provider>`

`edit` 的 `--profile` 在 `0.0.5` 中不再只是改 registry 映射，还要维护 linked section 一致性：

- 当 provider 改绑到新 profile 时，需要同步迁移关联关系
- 若旧 profile 仍有其他 provider 引用，则旧 section 保留
- 若旧 profile 已无其他引用，且不再是 active profile，则旧 section 可以删除
- 若新 profile 不存在，则只有在显式提供最小受管字段 `model` 时才允许创建

#### `codexs remove <provider>`

`remove` 在 `0.0.5` 中升级为一致性删除：

- 继续删除 `providers.json` 中的 provider 记录
- 若对应 profile 仍被其他 provider 引用，则保留该 section
- 若对应 profile 已无任何 provider 引用，则允许删除该 section
- 若该 profile 仍是当前 active profile，不能直接把 config 留成悬空状态，必须阻断

#### `codexs switch <provider>`

`switch` 继续只负责切换顶层 active profile：

- 不负责改写 profile section 内部字段
- 不承担 profile 内容修复职责
- 但其执行前提仍是目标 profile section 必须存在且可被结构化识别

### 6. 事务与回滚要求

所有可能同时触发 `providers.json` 和 `config.toml` 变更的命令，默认遵守：

- 单次锁
- 单次备份
- 单次失败整体回滚

不能接受的结果：

- `providers.json` 已更新但 `config.toml` 未同步
- `config.toml` 已更新但 `providers.json` 未同步
- active profile 指向一个已不存在的 section

## `0.1.0` 远期能力域

下面这些方向明确有价值，但当前不进入 `0.0.5` 里程碑，只作为继续走向 `0.1.0` 的远期能力域。

### 第三方 auth / extension 集成

示例方向：

- 接入 Copilot auth
- 在本地启动代理服务，使特定上游可在 Codex 中使用
- 安装和管理第三方依赖

当前定位：

- 作为单独能力域保留
- 不在当前主 PRD 中锁定具体命令名和具体交互细节
- 不进入 `0.1.0` 稳定主线的验收标准

### 更大范围的 profile schema 管理

未来如果需要扩展：

- 可以逐步纳入 `model` 之外的 profile 字段
- 但必须保持增量式 schema 扩展
- 不能在未定义字段契约前把 `config.toml` 直接提升为 full config manager

## 主题里程碑

从 `0.0.4` 走向 `0.1.0`，建议按能力主题推进，而不是现在就预写死每个小版本号。

### 里程碑 A：`0.0.4` / Stable Baseline

目标：

- 巩固 `setup`、provider CRUD、`show`、`backups list`、指定回滚等已落地能力
- 保持 CLI 契约、TTY 行为和 JSON envelope 稳定
- 继续清理错误码语义复用

### 里程碑 B：`0.0.5` / Config Management & Consistency

目标：

- 引入结构化 TOML 读取与 round-trip 写回能力
- 增加 `config show`、`config list-profiles`
- 让 provider 管理命令同步维护 linked profile sections
- 明确共享 profile、孤儿 section 和 active profile 安全规则

### 里程碑 C：Backup / Recovery Evolution

目标：

- 保持 `backups list` 与指定回滚能力稳定
- 确保跨 `providers.json` 与 `config.toml` 的双写场景仍可完整恢复
- 为后续更复杂的 config 变更继续复用同一事务模型

### 里程碑 D：Extensions / Auth Integration

目标：

- 评估第三方 auth 与本地代理集成
- 评估交互式依赖安装与 extension 管理
- 在不破坏主 CLI 契约的前提下扩展能力边界

## 对实现的要求

从现在到 `0.1.0` 的所有新增能力，默认遵守：

- 命令帮助必须明确人类模式和 `--json` 模式行为
- 非交互环境不允许依赖 prompt 才能完成核心自动化流程
- 所有写命令默认走锁、备份、回滚
- 所有新增错误码都必须语义清晰
- 所有新增 JSON 返回都只能扩展 `data` 和 `warnings`
- 结构化 TOML 写回不能破坏非受管部分

## `0.1.0` 目标完成标准

达到下面这些条件时，可以认为 `0.1.0` 主线目标基本收敛：

- 用户可以通过 `setup` 完成首次初始化
- provider registry 的查看、编辑、导入合并能力完整
- 用户和 AI 可以通过稳定命令结构化查看受管 `config.toml`
- `add` / `edit` / `remove` 执行后，`providers.json` 与 linked profile sections 不再出现预期内的一致性漂移
- 共享 profile 场景不会误删仍被引用的 section
- active profile 不会因为 provider 删除或 profile 迁移而变成悬空状态
- 历史备份可被显式枚举和恢复
- CLI 错误码不再存在明显语义复用问题
- 主 CLI 契约对 AI 和脚本调用保持稳定

## 建议测试场景

至少需要覆盖：

- `config show` 在文本和 `--json` 模式下返回稳定结构
- `config list-profiles` 能展示 `isActive`、`linkedProviders` 和 `model`
- `add` 在目标 profile 不存在时，只有提供最小受管字段才会创建 section
- `edit --profile` 在共享 profile 与非共享 profile 下的迁移行为不同且符合规则
- `remove` 删除最后一个引用时会删除孤儿 section
- `remove` 删除共享 profile 的单个 provider 时不会误删 section
- `remove` 触碰当前 active 且最后一个引用的 profile 时会被阻断
- TOML round-trip 写回后，非受管内容、顺序和注释保持稳定
- 双写失败时 `providers.json` 与 `config.toml` 能整体回滚

## 结论

`0.1.0` 不是简单地把现有 `0.0.4` 重命名为稳定版，而是要在保持当前本地事务式切换模型不变的前提下，把 `config.toml` 从“仅可浅层切换”推进到“可结构化查看、可受管同步 linked sections”的下一阶段，并继续收紧错误契约，为未来更大范围的 auth / extension 集成留出清晰边界。
