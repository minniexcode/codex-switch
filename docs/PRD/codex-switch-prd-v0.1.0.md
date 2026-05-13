# codex-switch `0.0.5` PRD

## 文档信息

- 状态：Active PRD
- 产品名：`codex-switch`
- CLI 命令名：`codexs`
- 当前基线版本：`0.0.4`
- 目标版本：`0.0.5`
- 文档定位：定义 `0.0.4 -> 0.0.5` 的直接需求范围
- 历史基线 PRD：[`codex-switch-prd.md`](./codex-switch-prd.md)
- 后续演进 PRD：[`codex-switch-prd-v0.0.5-to-v0.1.0.md`](./codex-switch-prd-v0.0.5-to-v0.1.0.md)
- 对应研究稿：[`../codex-switch-product-research.md`](../codex-switch-product-research.md)
- 对应技术架构：[`../codex-switch-technical-architecture.md`](../codex-switch-technical-architecture.md)
- 对应命令设计：[`../codex-switch-command-design.md`](../codex-switch-command-design.md)

## 一句话定义

`0.0.5` 的目标不是继续堆命令，而是把 `config.toml` 从“只能浅层切换 active profile”升级为“可以结构化读取、受控维护 provider-linked profiles，并与 `providers.json` 保持一致”。

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

当前基线已具备的工程特征：

- 本地文件模型围绕 `~/.codex/`
- `providers.json` 作为 management SSOT
- `config.toml` 与 `auth.json` 作为 runtime state
- 写命令统一走备份、锁和失败回滚
- `--json` 输出固定 envelope

当前主要缺口：

- `config.toml` 仍以轻量字符串匹配方式处理
- provider 管理命令不能稳定同步 linked profile sections
- 缺少结构化展示 config 的稳定命令面
- 历史 profile、共享 profile、缺失 section 的一致性规则还不完整

## `0.0.5` 目标

`0.0.5` 需要完成四件事：

- 引入结构化 TOML 读取与非破坏性修改能力
- 增加稳定的 config 查看命令，供人类、AI 和脚本消费
- 让 provider 写命令同步维护 linked profile sections
- 补齐历史状态、一致性信号和安全删除规则

## 范围

### In Scope

- 顶层 active `profile`
- `[profiles.<name>]` 受管 section
- 第一批正式受管字段：`model`
- `config show`
- `config list-profiles`
- `add` / `edit` / `remove` / `setup` / `import --merge` 的 provider-config 一致性
- `doctor` / `status` 的一致性信号

### Out of Scope

- 整个 `config.toml` 的通用编辑器
- 任意顶层键的自由增删改
- 更大 profile schema 的首版正式规格
- 第三方 auth / extension 集成

## 数据与契约

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

要求：

- 顶层 shape 不变
- 新字段只追加到 `data` / `warnings`
- 错误信息继续进入 `error`

### `providers.json`

`providers.json` 继续是 provider registry 的单一事实源：

- `profile` 必填
- `apiKey` 仍按完整 managed provider 处理
- 不引入“半初始化 provider”作为稳定状态

### `config.toml`

到 `0.0.5` 为止，`config.toml` 的受管范围限定为：

- 顶层 active `profile`
- 与 provider 关联的 `[profiles.<name>]`
- section 内最小正式字段：`model`、`model_provider`

约束：

- `providers.json` 仍是 provider 身份、凭据和管理元数据的 SSOT
- `config.toml` 只承载运行态投影，不升级为对等事实源
- `base_url` 不属于 `[profiles.*]`；它通过 `model_provider -> [model_providers.*].base_url` 解析
- 非受管 TOML 内容允许存在，但不进入通用编辑范围

### Managed Profile View

读取命令应围绕稳定视图返回，而不是直接暴露内部持久化细节。最小视图建议包含：

```json
{
  "name": "packycode",
  "model": "gpt-5",
  "linkedProviders": ["packycode"],
  "isActive": true,
  "managed": true
}
```

## Config Management 规则

### 受管与非受管

- managed profile：被至少一个 provider 引用，允许被写命令同步维护
- unmanaged profile：存在于 `config.toml`，但当前没有任何 provider 引用，默认只读展示
- orphaned managed reference：`providers.json` 引用了 profile，但 `config.toml` 缺失对应 section，属于不一致状态

### 共享 profile

多个 provider 指向同一个 profile 在 `0.0.5` 继续合法：

- profile section 不归单个 provider 独占
- 只有当没有任何 provider 引用时，才允许删除对应 section
- `remove` / `edit` 不能因单个 provider 操作误删共享 profile

### TOML 处理原则

- 不再以字符串匹配作为唯一修改策略
- 对受管 section 的读取、创建、删除、字段更新必须可验证
- 修改受管部分时，不应破坏非受管内容、顺序、空行和注释

## 新增命令

### `codexs config show`

用途：

- 展示结构化 config 视图
- 同时服务人类和 AI / 自动化读取

输入：

```bash
codexs config show [profile] [--json] [--codex-dir <path>]
```

最小返回要求：

- `activeProfile`
- `profiles`
- `includedProfiles`

`profiles[]` 中每项至少包含：

- `name`
- `managed`
- `isActive`
- `linkedProviders`
- `managedFields`
- `source`

### `codexs config list-profiles`

用途：

- 列出当前 `config.toml` 中的 profile 视图
- 明确显示 profile 与 provider 的关联关系

输入：

```bash
codexs config list-profiles [--json] [--codex-dir <path>]
```

`data.profiles[]` 至少包含：

- `name`
- `managed`
- `isActive`
- `linkedProviders`
- `model`

## 现有写命令升级

### `codexs add <provider>`

新增或锁定：

- `--model <name>`
- `--create-profile`

规则：

- 当目标 profile 已存在时，允许直接建立映射
- 当目标 profile 不存在时，只有显式传入 `--create-profile --model <name>` 且存在同名 `model_providers` runtime section 时才允许创建 section
- 缺少最小受管字段时，返回 `MANAGED_PROFILE_FIELDS_MISSING`

### `codexs edit <provider>`

新增或锁定：

- `--profile <name>`
- `--model <name>`
- `--create-profile`

规则：

- `edit --profile <missing>` 且未传 `--create-profile` 时失败
- `edit --profile <missing> --create-profile` 但未传 `--model` 时失败
- `edit --profile <missing> --create-profile` 若缺少同名 `model_providers` runtime section 或其 `base_url`，也必须失败
- 旧 profile 若仍被其他 provider 引用，则保留
- 旧 profile 若已无引用且不是 active profile，则可以删除
- 不隐式 rename 或 copy 旧 section 到新 profile

### `codexs remove <provider>`

新增或锁定：

- `--switch-to <profile>`

规则：

- 删除 provider 记录后，若 profile 仍被其他 provider 引用，则保留 section
- 若 profile 已无任何引用，则允许删除 section
- 若该 profile 仍是当前 active 且最后一个引用，必须先 `switch` 或显式传 `--switch-to`
- 不允许把 active profile 留成悬空状态

### `codexs switch <provider>`

- 继续只负责切换顶层 active profile
- 不负责修复 profile section 内容
- 执行前提仍是目标 profile section 必须存在且可识别

## `setup` 升级

`setup` 在 `0.0.5` 需要与新一致性模型兼容：

- 支持扫描多个候选 Codex 目录
- 多候选下，TTY 允许选择或手动输入目录
- 非交互模式下，多候选且未显式传 `--codex-dir` 时返回 `CODEX_DIR_AMBIGUOUS`
- 未发现任何候选目录时，TTY 可手动输入；非交互返回 `CODEX_DIR_NOT_FOUND`
- 对从现有 `config.toml` 发现的 profile，允许 adopt 为受管 profile
- 不制造新的 registry-config 不一致

## Write Result Contract

下列写命令成功时，建议在 JSON `data` 中稳定返回结果字段：

- `add`
- `edit`
- `remove`
- `setup`
- `import --merge`

建议字段：

- `provider`
- `profile`
- `createdProfileSections`
- `deletedProfileSections`
- `keptSharedProfiles`
- `switchedActiveProfile`
- `adoptedProfiles`
- `repairedProfiles`

## 事务与回滚

所有可能同时修改 `providers.json` 和 `config.toml` 的命令，默认遵守：

- 单次锁
- 单次备份
- 单次失败整体回滚

不能接受的结果：

- `providers.json` 已更新但 `config.toml` 未同步
- `config.toml` 已更新但 `providers.json` 未同步
- active profile 指向已不存在的 section

## 迁移与诊断

需要识别的历史状态：

- `providers.json` 可用，但 `config.toml` 中只有手工维护 profile
- `providers.json` 引用了 profile，但对应 section 不存在
- `config.toml` 存在历史 profile，但没有任何 provider 引用
- 当前 active profile 指向 unmanaged profile

迁移原则：

- 不要求用户先手工清空历史状态
- `setup`、`import --merge`、`doctor`、`status` 必须能识别这些状态
- 可安全 adopt 的 unmanaged profile，允许纳入受管
- 对悬空引用或缺失 section，默认不静默修复，必须告知用户下一步建议

`doctor` / `status` 至少需要覆盖：

- orphaned profile reference
- unmanaged active profile
- shared profile reference count
- orphaned profile section
- destructive remove blocked

## 验收标准

达到以下条件时，`0.0.5` 可以认为完成：

- `config show` 在文本和 `--json` 模式下返回稳定结构
- `config list-profiles` 能稳定展示 `managed`、`isActive`、`linkedProviders` 和 `model`
- `add` / `edit` / `remove` 会同步维护 linked profile sections
- 共享 profile 场景不会误删仍被引用的 section
- active profile 不会因删除 provider 或迁移 profile 而悬空
- 历史 `0.0.4` 状态可被识别，并通过 adopt / repair 路径收敛
- 结构化 TOML 修改后，非受管内容、顺序和注释保持稳定
- 双写失败时 `providers.json` 与 `config.toml` 能整体回滚

## 结论

`0.0.5` 是 `codex-switch` 从 provider registry 工具走向 config-aware CLI 的第一步。它的重点不是扩张命令面，而是建立稳定的 config 管理、一致性事务和可诊断能力，为后续 `0.0.5 -> 0.1.0` 演进打基础。
