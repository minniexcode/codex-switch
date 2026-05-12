# codex-switch `0.0.5` 设计文档

## 文档信息

- 文档类型：详细设计文档
- 适用版本：`0.0.5`
- 目标范围：`0.0.4 -> 0.0.5`
- 主对齐 PRD：[`../PRD/codex-switch-prd-v0.1.0.md`](../PRD/codex-switch-prd-v0.1.0.md)
- 远期边界参考：[`../PRD/codex-switch-prd-v0.0.5-to-v0.1.0.md`](../PRD/codex-switch-prd-v0.0.5-to-v0.1.0.md)
- 风格基线：[`codex-switch-v0.0.4-design.md`](./codex-switch-v0.0.4-design.md)

## 1. 文档目标

这份文档回答的是 `0.0.5` 应该怎样落地，而不是继续讨论长期愿景：

- `config.toml` 怎样从字符串级切换升级为结构化读取与局部受控写回
- provider 管理命令怎样与 linked profile sections 保持一致
- `config show` / `config list-profiles` 的命令契约和返回边界是什么
- 历史状态、不一致状态、adopt / repair 流程怎样进入现有 CLI
- 当前代码结构上具体改哪些模块、补哪些错误码、补哪些测试

目标是让实现阶段不再重复拍板关键技术决策。

## 2. 版本定位与设计原则

### 2.1 当前基线

当前 `0.0.4` 已具备：

- provider registry 管理：`list`、`show`、`add`、`edit`、`remove`
- 运行态切换：`current`、`switch`
- 导入导出：`import`、`import --merge`、`export`
- 初始化与诊断：`setup`、`status`、`doctor`
- 备份恢复：`backups list`、`rollback`
- 统一 JSON envelope
- 写操作统一走锁、备份、失败回滚

当前实现短板主要在 `config.toml`：

- 仅支持浅层读取顶层 active `profile`
- profile section 仍靠轻量字符串匹配
- 不能安全维护注释、空行和未受管内容
- provider 写命令没有稳定的 provider-config 双写一致性模型

### 2.2 `0.0.5` 的一句话定义

`0.0.5` 的核心不是再堆一批命令，而是建立 `config.toml` 的结构化读取、provider-linked profile 管理和一致性诊断能力。

### 2.3 设计原则

`0.0.5` 继续沿用现有工程原则：

- `CLI First`
- `Local First`
- `Safe by Default`
- `AI Friendly`
- `Split State Model`
- `Lightweight Transactions`

在此基础上新增四条版本原则：

- 不把 `config.toml` 提升为 full config editor
- 不新增独立 `repair` 命令
- 不做全量 TOML parse -> stringify 写回
- 所有 provider-config 双写仍必须纳入同一备份与回滚事务

## 3. 范围与边界

### 3.1 `0.0.5` 范围内

本设计覆盖：

- `config.toml` 结构化读取
- `[profiles.<name>]` 的最小受管写入能力
- 顶层 active `profile` 与 provider-linked profile section 的一致性
- `config show`
- `config list-profiles`
- `add` / `edit` / `remove` / `setup` / `import --merge` 的 config-aware 升级
- `doctor` / `status` 的一致性信号升级
- 多候选 Codex 目录发现与交互选择

### 3.2 明确不在 `0.0.5` 范围内

下面这些内容不进入本设计：

- 通用 `config edit` 命令族
- `model` / `base_url` 之外的大 profile schema 首版规格
- 独立 `repair` 命令
- 第三方 auth / extension 集成
- 任意顶层 TOML 键的自由增删改
- 自动化的“全量历史 profile 收编”

### 3.3 数据边界

`0.0.5` 继续坚持状态分层：

- `providers.json`：provider registry 的单一事实源
- `config.toml`：运行态配置投影，部分受管
- `auth.json`：认证态
- `backups/` + `latest.json`：恢复态

不引入数据库，不引入新的长期状态仓库。

## 4. `0.0.5` 功能总览

`0.0.5` 需要完成四件事：

- 引入结构化 TOML 读取与非破坏性局部 patch 写回能力
- 增加稳定的 config 读取命令，供人类、AI 和脚本消费
- 让 provider 写命令同步维护 linked profile sections
- 补齐历史状态、不一致状态、共享 profile 和安全删除规则

## 5. 数据模型设计

### 5.1 `ManagedProfileFields`

`ManagedProfileFields` 表示真正写入 `[profiles.<name>]` 的受管字段。

`0.0.5` 只正式锁定：

```ts
type ManagedProfileFields = {
  model: string;
  baseUrl: string;
};
```

规则：

- `model` 和 `base_url` 是当前唯一正式受管字段
- 写命令创建 profile section 时，必须同时具备 `model` 和 `base_url`
- 未提供任一必需字段时，不允许创建新的受管 section
- `apiKey` 继续只保存在 `providers.json`
- `note`、`tags` 等 provider 管理字段不进入 `config.toml`

字段归属直接锁定如下：

- `[profiles.<name>]`：`model`、`base_url`
- `providers.json`：`profile`、`apiKey`、可选 `note`、`tags`
- `auth.json`：当前激活 provider 对应的运行态认证内容

设计原因：

- 你的使用场景是“中转站”，`model` 和 `base_url` 共同定义真正的上游路由
- 如果 `base_url` 只放在 `providers.json`，而 `config.toml` 的 profile section 不受控，切换后就可能出现 profile 名变了但请求仍落到旧 endpoint 的分裂状态
- 因此 `0.0.5` 必须把 `base_url` 与 `model` 一起视为 profile runtime projection 的正式字段

### 5.2 `ManagedProfileView`

`ManagedProfileView` 是读取命令返回的稳定视图，不等同于持久化结构。

建议内部和输出层统一围绕以下字段：

```ts
type ManagedProfileView = {
  name: string;
  managed: boolean;
  isActive: boolean;
  linkedProviders: string[];
  model: string | null;
  baseUrl: string | null;
  managedFields: string[];
  source: "managed" | "unmanaged" | "orphaned-reference";
};
```

字段语义：

- `name`：profile 名
- `managed`：是否至少被一个 provider 引用
- `isActive`：是否为顶层 active profile
- `linkedProviders`：引用该 profile 的 provider 名列表
- `model`：可识别的受管 `model` 值；不存在或不受管时为 `null`
- `baseUrl`：可识别的受管 `base_url` 值；不存在或不受管时为 `null`
- `managedFields`：当前识别到并纳入正式受管的字段名数组；`0.0.5` 只可能为 `[]`、`["model"]`、`["base_url"]` 或 `["model", "base_url"]`
- `source`：
  - `managed`：section 存在且被 provider 引用
  - `unmanaged`：section 存在但没有 provider 引用
  - `orphaned-reference`：provider 引用了该 profile，但 `config.toml` 中缺少对应 section

### 5.3 `ConfigConsistencyIssue`

`ConfigConsistencyIssue` 是 `doctor` / `status` 的问题抽象。

最少覆盖以下问题类型：

```ts
type ConfigConsistencyIssue =
  | { code: "ORPHANED_PROFILE_REFERENCE"; profile: string; providers: string[] }
  | { code: "UNMANAGED_ACTIVE_PROFILE"; profile: string }
  | { code: "SHARED_PROFILE_REFERENCE"; profile: string; providers: string[] }
  | { code: "ORPHANED_PROFILE_SECTION"; profile: string }
  | { code: "DESTRUCTIVE_REMOVE_BLOCKED"; profile: string; provider: string; activeProfile: string };
```

说明：

- `ORPHANED_PROFILE_REFERENCE`：`providers.json` 引用了不存在的 profile section
- `UNMANAGED_ACTIVE_PROFILE`：当前 active profile 存在，但没有 provider 映射
- `SHARED_PROFILE_REFERENCE`：多个 provider 指向同一 profile；本身不一定是错误，但必须被识别
- `ORPHANED_PROFILE_SECTION`：`config.toml` 存在 profile section，但没有 provider 引用
- `DESTRUCTIVE_REMOVE_BLOCKED`：删除 provider 会导致 active profile 悬空，必须先切换

### 5.4 配置文档内部抽象

为了支撑非破坏性写回，`0.0.5` 在 infra 层引入下列内部抽象：

```ts
type ParsedConfigDocument = {
  rawText: string;
  lineEnding: "\n" | "\r\n";
  activeProfile: string | null;
  profiles: ProfileSectionRef[];
};

type ProfileSectionRef = {
  name: string;
  headerStart: number;
  sectionStart: number;
  sectionEnd: number;
  modelValueRange: { start: number; end: number } | null;
  baseUrlValueRange: { start: number; end: number } | null;
  model: string | null;
  baseUrl: string | null;
};

type ConfigPatchOperation =
  | { kind: "replace-range"; start: number; end: number; text: string }
  | { kind: "insert-at"; index: number; text: string }
  | { kind: "delete-range"; start: number; end: number };

type ConfigMutationPlan = {
  operations: ConfigPatchOperation[];
  createdProfileSections: string[];
  deletedProfileSections: string[];
  updatedProfiles: string[];
  switchedActiveProfile: boolean;
};
```

这些抽象只作为实现内部契约，不直接暴露给 CLI 输出。

## 6. TOML 处理路线

### 6.1 技术决策

`0.0.5` 直接锁定 TOML 技术路线：

- 采用 `@toml-tools/parser` 一类的 CST / 结构化 parser 路线
- 目标是获得 section / field 的稳定位置边界
- 最终对原始文本执行局部 patch 写回

不采用：

- 全量 parse -> stringify
- 重新序列化整个 `config.toml`
- 继续只靠字符串正则拼接

### 6.2 为什么不做全量 stringify

全量 stringify 不符合当前产品目标，因为它会带来下面这些不可接受的副作用：

- 破坏注释
- 破坏空行
- 改写未受管内容的顺序
- 让用户手工维护的 config 漂移过大

`0.0.5` 的目标是受控管理 provider-linked sections，而不是接管整份配置文件。

### 6.3 Patch 规则

patch 规则直接锁定：

- 所有 patch 操作基于原始文本坐标生成
- 应用时按文本区间从后往前执行
- 这样可以避免前面 patch 影响后面 patch 的 offset

示例策略：

1. 先生成完整 `ConfigMutationPlan`
2. 将 `replace-range` / `delete-range` / `insert-at` 按起始偏移倒序排序
3. 统一在一次写回中应用

### 6.4 结构化读取边界

`0.0.5` 结构化识别的范围只包括：

- 顶层 `profile = "..."`
- `[profiles.<name>]`
- `model = "..."`
- `base_url = "..."`

其余字段允许原样存在，但：

- 不在 `0.0.5` 的正式受管写入范围内
- 不要求被完整解析成稳定 schema
- 不允许在写入时被误删或重排

## 7. 目录发现与 `setup` 候选策略

### 7.1 候选集算法

`setup` 的目录发现采用保守候选集，不做全盘扫描。

优先规则：

- 若显式传入 `--codex-dir`，只使用该目录
- 否则候选集来自：
  - `CODEXS_CODEX_DIR`
  - `dev-codex/local-sandbox`，但仅在 `NODE_ENV=development`
  - `~/.codex`

候选处理：

- 去重
- 过滤不存在路径
- 保留顺序，形成最终候选列表

### 7.2 交互规则

TTY 模式：

- 单候选：自动继续
- 多候选：让用户选择现有候选或手动输入
- 无候选：允许手动输入

非交互模式：

- 多候选：返回 `CODEX_DIR_AMBIGUOUS`
- 无候选：返回 `CODEX_DIR_NOT_FOUND`

### 7.3 设计取舍

这里明确不做：

- 扫描整个用户目录
- 递归搜索所有潜在 config 路径
- 推断多个工作区下的任意历史目录

原因是这类扫描成本高、噪声大、可预测性差，不适合作为稳定 CLI 契约。

## 8. 命令设计

### 8.1 新增命令面

`0.0.5` 新增：

```bash
codexs config show [profile] [--json] [--codex-dir <path>]
codexs config list-profiles [--json] [--codex-dir <path>]
```

### 8.2 现有命令新增 flags

`add <provider>` 新增：

- `--create-profile`
- `--model <name>`
- `--base-url <url>`

`edit <provider>` 新增：

- `--create-profile`
- `--model <name>`
- `--base-url <url>`
- 继续支持 `--profile`

`remove <provider>` 新增：

- `--switch-to <profile>`

### 8.3 不新增命令

`0.0.5` 明确不新增独立 `repair` 命令。

repair / adopt 路径通过以下方式承接：

- `doctor` 暴露问题和建议动作
- `setup` 在交互模式下承接 adopt
- `import --merge` 在交互模式下承接 adopt / repair
- 现有写命令在交互模式下承接必要确认

## 9. 读取命令契约

### 9.1 `config show`

#### 用途

返回结构化 config 视图，可选聚焦单个 profile。

#### 命令形态

```bash
codexs config show [profile] [--json] [--codex-dir <path>]
```

#### 返回边界

默认返回 `config.toml` 中全部可识别 profiles，而不是只返回 managed profiles。

JSON 最小字段：

```json
{
  "activeProfile": "packycode",
  "selectedProfile": null,
  "profiles": [
    {
      "name": "packycode",
      "managed": true,
      "isActive": true,
      "linkedProviders": ["packycode"],
      "model": "gpt-5",
      "baseUrl": "https://relay.example.com/v1",
      "managedFields": ["model", "base_url"],
      "source": "managed"
    }
  ]
}
```

若传入 `[profile]`：

- `selectedProfile` 返回目标 profile
- `profiles` 仍建议保持数组 shape，但只包含目标视图
- 若目标来自 orphaned reference，也允许返回 `source = "orphaned-reference"` 的单条视图

#### 失败语义

- 读取失败：`CONFIG_NOT_FOUND` 或 `CONFIG_PARSE_ERROR`
- 指定 profile 不可识别：`PROFILE_NOT_FOUND`

### 9.2 `config list-profiles`

#### 用途

返回 profile 的轻量列表视图。

#### 命令形态

```bash
codexs config list-profiles [--json] [--codex-dir <path>]
```

#### 返回边界

也必须返回全部可识别 profiles，而不是只返回 managed profiles。

最小字段：

- `name`
- `managed`
- `isActive`
- `linkedProviders`
- `model`
- `baseUrl`
- `source`

与 `config show` 的差异：

- `list-profiles` 是轻量列表
- `show` 允许更完整的单 profile 语义和问题上下文

## 10. 写命令一致性规则

### 10.1 `add <provider>`

规则锁定如下：

- 当目标 profile 已存在时，只建立 provider -> profile 映射
- 当目标 profile 缺失时，只有同时传入 `--create-profile --model <name> --base-url <url>` 才允许创建 section
- 只传 `--create-profile` 但缺少 `--model` 或 `--base-url`，返回 `MANAGED_PROFILE_FIELDS_MISSING`
- 不允许写出 provider 指向缺失 profile 的新状态

### 10.2 `edit <provider>`

规则锁定如下：

- 改绑到已有 profile：更新 provider 映射并重新计算 active / shared 关系
- 改绑到缺失 profile：只有 `--create-profile --model <name> --base-url <url>` 才允许
- 旧 section 不做隐式 rename
- 旧 section 不做隐式 copy
- 旧 section 不做隐式 `model` / `base_url` 迁移

删除旧 section 的规则：

- 若旧 profile 仍被其他 provider 引用：保留
- 若旧 profile 无其他引用且不是 active profile：可删除
- 若旧 profile 无其他引用但仍是 active profile：必须先切换或交互确认后显式切换

### 10.3 `remove <provider>`

规则锁定如下：

- 若删除后 profile 仍被其他 provider 引用：保留 section
- 若删除后已无任何 provider 引用：允许删除 section
- 若会删掉当前 active profile 且这是最后一个引用：必须先 `switch` 或显式 `--switch-to`
- 不允许把 active profile 留成悬空状态

这里新增明确错误码：

- `PROFILE_IN_USE`：对共享 profile 或 active profile 进行危险删除时阻止继续

### 10.4 `switch <provider>`

`switch` 在 `0.0.5` 继续只负责：

- 修改顶层 active `profile`

它不负责：

- 修复 profile section 内容
- 创建缺失 section
- 迁移 profile schema

### 10.5 `setup`

`setup` 在 `0.0.5` 的要求：

- 支持多候选目录发现与 TTY 选择
- 支持 adopt 现有 unmanaged profiles
- 不要求一次性把所有历史 profile 全部变为 managed
- 不能制造新的 registry-config 不一致

当发现 unmanaged profile 时：

- 交互模式可选择 adopt 或跳过
- 非交互模式不得静默 adopt；只有在输入已足够明确时才继续

### 10.6 `import --merge`

`import --merge` 继续保持“导入侧覆盖本地同名 provider”的语义。

新增一致性规则：

- 如果导入结果引用缺失 profile，进入与 `add` / `edit` 相同的 create / adopt 规则
- 非交互模式下，无法满足 create 条件则失败
- 交互模式下，可进入 adopt / repair 辅助流
- 最终写入结果不得留下新的 orphaned reference

## 11. 写结果契约

`0.0.5` 要求以下写命令在 JSON `data` 中稳定返回新字段：

- `add`
- `edit`
- `remove`
- `setup`
- `import --merge`

新增字段：

```json
{
  "createdProfileSections": [],
  "deletedProfileSections": [],
  "keptSharedProfiles": [],
  "switchedActiveProfile": false,
  "adoptedProfiles": [],
  "repairedProfiles": []
}
```

约束：

- 未发生时返回空数组或 `false`
- 不用缺省省略字段
- 顶层 envelope 结构不变

## 12. 错误语义

### 12.1 `0.0.5` 需要新增的错误码

设计明确要求实现中新增：

- `CONFIG_PARSE_ERROR`
- `PROFILE_IN_USE`
- `MANAGED_PROFILE_FIELDS_MISSING`

继续使用已有：

- `CODEX_DIR_NOT_FOUND`
- `CODEX_DIR_AMBIGUOUS`
- `CONFIG_NOT_FOUND`
- `PROFILE_NOT_FOUND`
- `PROVIDERS_NOT_FOUND`
- `PROVIDERS_PARSE_ERROR`
- `BACKUP_FAILED`
- `ROLLBACK_FAILED`

### 12.2 错误码语义

`CONFIG_PARSE_ERROR`：

- `config.toml` 存在，但结构化读取失败
- 应包含文件路径和 parser 原因

`PROFILE_IN_USE`：

- 删除 / 改绑操作会破坏共享 profile 或 active profile 安全约束
- 应包含 `profile`、`provider`、`activeProfile`、`linkedProviders`

`MANAGED_PROFILE_FIELDS_MISSING`：

- 需要创建新的受管 profile section，但缺少最小字段
- `0.0.5` 至少用于缺少 `model` 或 `base_url`

### 12.3 明确不进入 `0.0.5` 的错误语义

`IMPORT_MERGE_CONFLICT` 不进入 `0.0.5`。

原因：

- `import --merge` 继续采用导入侧覆盖策略
- 不引入逐条冲突解决语义

## 13. 模块设计与代码落点

### 13.1 总体结构

保持当前四层结构不变：

- CLI 层
- Application 层
- Domain 层
- Infrastructure 层

### 13.2 `src/domain/config.ts`

当前 `src/domain/config.ts` 主要还是字符串 helper。

`0.0.5` 升级为 config 领域规则入口，负责：

- active profile 规则
- managed / unmanaged / orphaned 视图拼装
- 写操作前校验
- shared profile 与 destructive remove 规则判断

建议新增：

- `buildManagedProfileViews(...)`
- `collectConfigConsistencyIssues(...)`
- `validateManagedProfileCreation(...)`
- `planProfileLifecycleOutcome(...)`

### 13.3 `src/infra/config-repo.ts`

当前 `src/infra/config-repo.ts` 主要负责读取 active profile、列出 section 名、改写顶层 profile。

`0.0.5` 升级为结构化读取 + patch 应用中心，至少暴露：

- `readStructuredConfig`
- `listStructuredProfiles`
- `planConfigMutation`
- `applyConfigMutation`
- `findCodexDirCandidates`

职责包括：

- 读取原始 `config.toml`
- 通过 CST parser 建立 section / field 边界
- 生成 `ConfigMutationPlan`
- 应用局部 patch
- 保持注释、空行和未受管内容稳定

说明：

- 当前仓库已有 `src/infra/codex-discovery.ts` 的目录发现逻辑
- `0.0.5` 设计上允许把候选目录规则下沉整合进 config-aware 路径解析，但不要求强行删除旧文件
- 实现时可以保留 `codex-discovery.ts` 作为薄封装，底层委托给 `config-repo` 或共用 helper

### 13.4 `src/app/`

新增：

- `src/app/show-config.ts`
- `src/app/list-config-profiles.ts`

更新：

- `src/app/add-provider.ts`
- `src/app/edit-provider.ts`
- `src/app/remove-provider.ts`
- `src/app/setup-codex.ts`
- `src/app/import-providers.ts`
- `src/app/get-status.ts`
- `src/app/run-doctor.ts`

应用层需要承担：

- 组合 provider repo 与 config repo
- 组装双写事务输入
- 生成写结果契约字段
- 把 doctor / status 的 issue 转换为稳定输出结构

### 13.5 `src/cli.ts`

需要新增：

- `config show` 分派
- `config list-profiles` 分派

同时更新现有：

- `add` 参数接收 `--create-profile`、`--model`、`--base-url`
- `edit` 参数接收 `--create-profile`、`--model`、`--base-url`
- `remove` 参数接收 `--switch-to`
- `setup` 接入多候选目录交互

### 13.6 `src/cli/args.ts`

需要把新子命令归一化为稳定 command key，方式与现有 `backups list` 类似。

建议新增 command key：

- `config-show`
- `config-list-profiles`

### 13.7 `src/cli/help.ts` / `src/cli/output.ts` / `src/cli/interactive.ts`

需要增加：

- 新命令帮助文案
- `config show` / `config list-profiles` 的文本渲染
- `setup` 多候选目录选择交互
- adopt / repair 辅助交互的最小提示

## 14. 关键流程时序

### 14.1 `config show` 只读流程

```text
argv
  -> parseArgs
  -> executeCommand("config-show")
  -> app/show-config
  -> infra/config-repo.readStructuredConfig
  -> infra/providers-repo.readProvidersFileIfExists
  -> domain/config.buildManagedProfileViews
  -> output
```

### 14.2 `add` 创建缺失 profile 的双写流程

```text
argv
  -> parseArgs
  -> executeCommand("add")
  -> app/add-provider
  -> read providers.json + structured config
  -> validate create-profile + model/base_url preconditions
  -> domain/config.planProfileLifecycleOutcome
  -> infra/config-repo.planConfigMutation
  -> app/run-mutation
  -> write providers.json + apply config patch
  -> success result with createdProfileSections
```

### 14.3 `edit --profile` 重绑定流程

```text
argv
  -> parseArgs
  -> executeCommand("edit")
  -> app/edit-provider
  -> load provider + structured config
  -> resolve new profile target
  -> create missing profile only when --create-profile --model --base-url is present
  -> update provider mapping
  -> keep or delete old section based on shared/active rules
  -> single mutation transaction
  -> success result with created/deleted/kept fields
```

### 14.4 `remove --switch-to` 安全删除流程

```text
argv
  -> parseArgs
  -> executeCommand("remove")
  -> app/remove-provider
  -> load provider + structured config
  -> detect whether target profile is last reference and active
  -> require explicit switch target when destructive
  -> switch active profile first in mutation plan when needed
  -> delete provider mapping
  -> delete profile section only if no remaining references
  -> success result with switchedActiveProfile + deletedProfileSections
```

### 14.5 `setup` 多候选目录 + adopt 流程

```text
argv
  -> parseArgs
  -> executeCommand("setup")
  -> findCodexDirCandidates
  -> TTY choose candidate or manual path
  -> read structured config
  -> collect unmanaged profiles and active profile
  -> interactive adopt decision when applicable
  -> build provider drafts
  -> single mutation write
  -> run doctor
  -> output adopt/repair summary
```

## 15. 兼容、迁移与诊断

### 15.1 历史状态识别

`0.0.5` 需要识别至少四类历史状态：

- `providers.json` 可用，但 `config.toml` 只有手工维护 profile
- provider 引用了缺失 section
- `config.toml` 存在没有任何 provider 引用的历史 section
- 当前 active profile 指向 unmanaged profile

### 15.2 收敛路线

在没有独立 `repair` 命令的前提下，收敛路线明确为：

- `doctor` 识别问题并给出问题码
- `status` 给出浅层信号，不做静默修复
- `setup` / `import --merge` 在交互模式下承接 adopt / repair
- 非交互模式遇到不可自动收敛状态时失败，并返回明确原因

### 15.3 `doctor` 与 `status` 的责任差异

`status`：

- 给出当前 active profile、是否映射、是否存在浅层漂移信号
- 输出面向日常查看

`doctor`：

- 给出结构化 `ConfigConsistencyIssue[]`
- 明确问题码、上下文和建议动作
- 输出面向修复和自动化诊断

## 16. 测试设计

### 16.1 总体原则

测试继续采用当前 plain Node specs 模式：

- 不引入 Jest / Vitest
- fixture 继续放在 `tests/` / `dev-codex/` 现有模式中

### 16.2 CLI 测试

最少覆盖：

- `config show` 文本输出
- `config show --json` 输出
- `config list-profiles` 文本输出
- `config list-profiles --json` 输出
- `setup` 单候选目录
- `setup` 多候选目录 + TTY 选择
- `setup` 无候选目录 + TTY 手动输入
- `setup` 多候选目录 + 非交互失败 `CODEX_DIR_AMBIGUOUS`
- `add --create-profile --model --base-url`
- `edit --profile <missing> --create-profile --model --base-url`
- `remove --switch-to`

### 16.3 Application 测试

最少覆盖：

- provider + config 双写成功
- provider + config 双写失败整体回滚
- `import --merge` 后 linked section 一致性
- `setup` adopt unmanaged profile

### 16.4 Domain / Infra 测试

最少覆盖：

- structured config 读取
- patch 计划生成
- patch 应用后注释、空行、未受管内容保持
- managed / unmanaged / orphaned 视图计算
- `doctor` / `status` issue 计算

### 16.5 Fixture 设计

最少新增：

- 带注释和空行的 `config.toml`
- 共享 profile fixture
- orphaned reference fixture
- unmanaged active profile fixture
- 多候选 Codex 目录 fixture

## 17. Deferred 到 `0.1.0`

下面这些内容作为 `0.0.5 -> 0.1.0` 后续项单列，不混入当前实现：

- 更大的 profile schema
- 真正的 `config edit` 命令族
- 更强的 repair 自动化
- extensions / auth integration

## 18. 验收标准

`0.0.5` 设计落地后，至少应满足：

- `config show` 在文本和 `--json` 模式下返回稳定结构
- `config list-profiles` 返回全部可识别 profiles，并通过 `managed` / `source` 区分来源
- `add` / `edit` / `remove` 同步维护 linked profile sections
- 共享 profile 不会因单个 provider 操作被误删
- active profile 不会因删除或重绑定而悬空
- `setup` 的目录发现行为在 TTY / 非交互下可预测
- 结构化 TOML 写回后注释、空行和未受管内容保持稳定
- 双写失败时 `providers.json` 与 `config.toml` 能整体回滚
- `doctor` / `status` 能识别 orphaned reference、unmanaged active profile、shared profile 和 orphaned section

## 19. 结论

`0.0.5` 的本质，是把 `codex-switch` 从“能管理 provider registry 并做浅层 profile 切换”的工具，推进到“对 `config.toml` 有稳定结构化认知、能维护 provider-linked profile、一致性可诊断、双写可回滚”的下一阶段。

这一步不要求引入更大的命令体系，也不要求把 `config.toml` 变成通用编辑器；它要求的是把当前最容易产生漂移和隐式破坏的那部分能力，收敛成一套明确、可实现、可测试的实现规格。
