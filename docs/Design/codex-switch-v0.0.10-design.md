# codex-switch `0.0.10` 设计文档

## 文档信息

- 文档类型：详细设计文档
- 适用版本：`0.0.10`
- 目标范围：`0.0.9 -> 0.0.10`
- 对应 PRD：[`../PRD/codex-switch-prd-v0.0.10.md`](../PRD/codex-switch-prd-v0.0.10.md)
- 关联上一版设计：[`./codex-switch-v0.0.9-design.md`](./codex-switch-v0.0.9-design.md)

## 1. 文档目标

本设计文档用于把 `0.0.10` 的 hardening 范围收口到“实现者无需再补关键决策”的程度。文档必须直接回答以下问题：

- `migrate` 在进入交互前，如何先判断哪些 profile 可 adopt、哪些不可 adopt、失败时如何对外表达
- `doctor` 与 `status` 的当前公开结构到底是什么，哪些字段稳定，哪些旧说法需要删除
- `backups list` 与 `rollback` 的稳定 JSON 载荷和失败语义是什么
- runtime state 应如何安全读取，哪些路径该宽容，哪些路径该严格
- 发布前需要检查哪些版本与产物一致性问题

本设计只覆盖 `0.0.10` design 文件本身，不顺手扩写 README、roadmap、PRD 或代码实现细节之外的未来方案。

## 2. 版本定位

`0.0.10` 是边界收口版本，不是命令面扩展版本。

它的定位不是继续发明新的状态层、聚合 schema 或自动化迁移协议，而是围绕当前已经存在的实现模型，消除文档承诺和代码事实之间的偏差，让以下几条线稳定下来：

- `migrate` 的 adoptability 前置检查与交互边界
- `doctor` / `status` 的公开契约和诊断边界
- backup / rollback 的恢复契约
- Copilot runtime state 的安全读路径
- release correctness 的最低发布门槛

## 3. 设计原则

`0.0.10` 必须遵循以下原则：

1. 以当前实现契约为事实源，不回引已经与代码脱节的旧概念。
2. 不把 `auth.json` 重新定义为 provider secret mirror。
3. 不引入 `status.health.*`、并行诊断结构或新的大 JSON 输出族。
4. 命令错误码与 `doctor` issue code 是两层契约，命名应尽量对齐，但不能混为一体。
5. 文档中的“稳定字段”要少而明确；面向人类阅读的 reason/message 文本允许演进，但结构边界必须固定。

## 4. 数据边界与公开契约

### 4.1 文件角色

- `providers.json`
  - 管理态 registry
  - 是 managed state 的 SSOT
  - 记录 provider 名称、profile 绑定以及 runtime-backed provider 的持久化配置
- `config.toml`
  - 运行态路由投影
  - 表达当前 active profile 与 `model_providers.<name>` runtime 路由
  - 允许出现尚未被 `providers.json` 接管的 live state
- `auth.json`
  - 独立 auth state 文件
  - 只在 `status` / `doctor` 中做存在性、可解析性与基础元数据读取
  - 不是 provider secret mirror，也不是 managed provider ownership 的证明
- runtime state
  - 指 Copilot bridge 的本地运行态文件，当前落在 `copilot-bridge-state.json`
  - 用于 bridge 运行状况探测、stale state 判断和 direct provider 场景的安全读取
  - 不纳入 managed backup 的强事务边界
- backups
  - 用于恢复 managed files
  - 不承诺恢复运行中 bridge 进程，也不承诺恢复外部 Copilot 登录态

### 4.2 契约分层

- 命令返回中的 `error.code`
  - 面向 CLI 调用方
  - 用于表达命令失败原因，例如 `INVALID_ARGUMENT`、`BACKUP_NOT_FOUND`
- `doctor.data.issues[].code`
  - 面向诊断域
  - 用于表达系统状态问题，例如 `AUTH_JSON_INVALID`、`BRIDGE_STATE_STALE`

二者可能名称相近，但并不等价。例如：

- `MIGRATE_NO_ADOPTABLE_PROFILES` 是命令错误码，不是 `doctor` issue code
- `AUTH_JSON_INVALID` 当前既可能出现在内部错误归一化路径中，也可能作为 `doctor` issue code 出现，但语义仍以“诊断问题”优先，不应被重新包装成 auth mirror 协议

## 5. `migrate` 详细设计

### 5.1 设计目标

`migrate` 在 `0.0.10` 的重点不是新增自动化导入能力，而是把交互式 adopt 路径做扎实。命令需要先判断“能不能迁”，再决定“如何迁”。

### 5.2 adoptability 前置检查

交互流程前必须先完成 adoptability 预检查。该检查以当前 config consistency 模型为边界，围绕 unmanaged profile 是否已经具备成为 managed provider 的最小条件展开。

稳定输出字段：

- `availableProfiles`
- `adoptableProfiles`
- `blockingReasonsByProfile`

其中：

- `availableProfiles` 表示当前 `config.toml` 中可见 profile 集合
- `adoptableProfiles` 表示通过最小 adopt 条件检查的 profile 集合
- `blockingReasonsByProfile` 是面向人类可读的诊断映射；字段存在本身是稳定契约，但 reason 文本不承诺固定枚举

阻塞原因必须逐项对齐现有 config consistency 模型，至少覆盖：

- 缺 `model`
- 缺 `model_provider`
- `model_provider` 名称与 profile 不匹配
- 缺 `model_providers.<name>` section
- 缺 `base_url`
- 缺 `env_key`

### 5.3 无可 adopt profile 的失败语义

`0.0.10` 正式引入并固定以下命令错误码：

- `MIGRATE_NO_ADOPTABLE_PROFILES`

它用于表达：命令在进入 strategy prompt、profile 选择和 provider 详情收集之前，就已经判断出没有任何 profile 满足 adopt 前提。

示例：

```json
{
  "error": {
    "code": "MIGRATE_NO_ADOPTABLE_PROFILES",
    "message": "No adoptable profiles were found for migrate.",
    "details": {
      "availableProfiles": ["copilot", "openai"],
      "adoptableProfiles": [],
      "blockingReasonsByProfile": {
        "copilot": ["model_provider is missing."],
        "openai": ["model_providers.openai.base_url is missing."]
      }
    }
  }
}
```

### 5.4 非交互式 `migrate` 的边界

`0.0.10` 不引入完整的非交互式 `migrate` profile 选择和 secret 注入参数。

因此需要保留两条失败路径的分工：

- `MIGRATE_NO_ADOPTABLE_PROFILES`
  - 表示输入状态本身不满足 adopt 前提
  - 失败发生在交互需求之前
- `INVALID_ARGUMENT`
  - 表示当前 release 仍要求 interactive TTY 才能完成 profile 选择和 provider details 收集
  - 即使存在 adoptable profiles，也不能把非交互调用伪装成受支持 contract

非交互错误仍可继续暴露：

- `availableProfiles`
- `adoptableProfiles`
- 面向用户的 suggestion 文案

但文档不应把这些细节提升成“已支持自动化 migrate”的承诺。

### 5.5 空 registry 场景

当 `providers.json` 已存在但 registry 为空时：

- 跳过 `merge` / `overwrite` prompt
- 对外不新增额外 schema
- 内部按 `overwrite` 语义继续即可

该决策的目的不是改变最终结果，而是去掉没有决策价值的交互。

### 5.6 与当前实现的衔接

当前 `migrate` 主要落在：

- `src/commands/handlers.ts`
- `src/app/setup-codex.ts`
- `src/domain/setup.ts`

`0.0.10` 的实现约束是：

- adoptability 预检查前置到交互入口之前
- 交互层只负责选择 adoptable profiles 和收集缺失 provider details
- app 层继续负责最终 mutation、backup、post-doctor 复检

## 6. `doctor` 与 `status` 详细设计

### 6.1 `doctor` 的主诊断结构

`doctor` 继续以 `doctor.data.issues[]` 作为主诊断面，不新增并行结构。

单项 issue 的目标结构保持：

- `code`
- `message`
- 与该问题直接相关的附加字段

示例：

```json
{
  "code": "AUTH_JSON_INVALID",
  "message": "Failed to parse auth.json.",
  "file": "C:\\Users\\name\\.codex\\auth.json"
}
```

### 6.2 `doctor` 诊断域边界

`0.0.10` 中允许且应清晰表达的诊断域包括：

- config / providers consistency
  - active profile 未受管
  - shared profile reference
  - `model_provider` / `base_url` / `env_key` 缺失或不一致
- `AUTH_JSON_INVALID`
  - 仅在 auth 文件存在但不可解析时出现
- Codex runtime probe
  - `CODEX_NOT_INSTALLED`
  - `CODEX_VERSION_UNSUPPORTED`
  - `CODEX_LOGIN_FAILED`
- Copilot / bridge 诊断
  - `COPILOT_SDK_MISSING`
  - `COPILOT_AUTH_REQUIRED`
  - `BRIDGE_STATE_MISSING`
  - `BRIDGE_STATE_STALE`
  - `PROVIDER_BASE_URL_MISMATCH`
  - `BRIDGE_HEALTHCHECK_FAILED`

### 6.3 `doctor` 明确不做的事

- 不检查 `auth.json` 与 active provider 的 key/value mirror 一致性
- 不报告 `auth mirror mismatch` 一类问题码
- 不发明新的 `doctor.health.*` 或第二套自动化诊断 schema

### 6.4 `status` 的当前事实边界

`status` 保持当前 JSON shape，不新增 `health.overall`、`health.summary` 等字段。

`status.data` 继续围绕以下字段表达：

- `currentProfile`
- `currentProfileMapped`
- `provider`
- `activeProviderResolvable`
- `activeProviderCandidates`
- `runtimeProvider`
- `copilotSdk`
- `copilotAuth`
- `copilotBridge`
- `copilotRuntimeState`
- `liveState`
- `auth`
- `configProfiles`
- `issues`
- `storage`

### 6.5 `status.data.auth` 的稳定 shape

`status.data.auth` 在 `0.0.10` 中固定为中性文件状态摘要：

- `exists`
- `valid`
- `parseError`
- `authMode`

示例：

```json
{
  "exists": true,
  "valid": true,
  "parseError": null,
  "authMode": "session"
}
```

该结构不包含：

- provider ownership
- managed key 列表
- auth mirror 是否与当前 provider 一致的结论

### 6.6 `status.data.storage` 的稳定 shape

`status.data.storage` 在 `0.0.10` 中固定为：

- `managementSSOT`
- `runtimeMirrors`
- `authStateFile`
- `rollbackState`

示例：

```json
{
  "managementSSOT": "providers.json",
  "runtimeMirrors": ["config.toml"],
  "authStateFile": "auth.json",
  "rollbackState": "backups/latest.json"
}
```

### 6.7 direct provider 与脏 runtime state

`status` / `doctor` 需要能在 direct provider 场景下稳定输出，即使本地存在 stale 或损坏的 Copilot runtime state，也不应因为“读到不可信运行态文件”而导致整个读路径崩溃。

设计目标不是新增公共输出 schema，而是把问题包装回现有：

- `copilotRuntimeState`
- `copilotBridge`
- `doctor.data.issues[]`
- `warnings`

## 7. backup / rollback 详细设计

### 7.1 `backups list` 稳定载荷

`backups list` 的稳定列表项写死为：

- `backupId`
- `createdAt`
- `reason`
- `files`
- `backupPath`

单项示例：

```json
{
  "backupId": "20260511-221457-switch",
  "createdAt": "2026-05-11T22:14:57.000Z",
  "reason": "switch",
  "files": ["config.toml", "providers.json"],
  "backupPath": "C:\\Users\\name\\.codex\\backups\\20260511-221457-switch"
}
```

当前实现额外返回的 `count` 应在设计中明确标为命令层派生便利字段，而不是 PRD 级主契约。它可以保留，但不应成为外部集成的唯一依赖项。

### 7.2 manifest 异常的列表行为

当 `backups/` 下存在损坏或不完整的历史项时：

- 命令应继续返回其余有效备份
- `warnings` 用于提示 `manifest.json` 缺失或非法
- 只有在没有任何有效备份可列出时，才失败为 `BACKUP_NOT_FOUND`

### 7.3 `rollback` 成功载荷

`rollback` 的稳定成功载荷为：

- `restoredFiles`
- `backupId`
- `backupPath`

示例：

```json
{
  "data": {
    "restoredFiles": ["config.toml", "providers.json"],
    "backupId": "20260511-221457-switch",
    "backupPath": "C:\\Users\\name\\.codex\\backups\\20260511-221457-switch"
  }
}
```

对 `rollback latest` 路径，`backupId` 可以为 `null`，但仍需返回 `backupPath` 与 `restoredFiles`。

### 7.4 `rollback` 路径区分

必须在设计稿中明确两条路径：

1. `rollback`
   - 读取 `backups/latest.json`
   - 适合“恢复最近一次受管变更”
2. `rollback <backupId>`
   - 按显式历史目录加载对应 manifest
   - 适合恢复指定时间点

### 7.5 `rollback` 失败语义

`0.0.10` 先收口到两类失败：

- `BACKUP_NOT_FOUND`
- `ROLLBACK_FAILED`

其中：

- `BACKUP_NOT_FOUND`
  - latest manifest 不存在
  - 指定 `backupId` 不存在
  - backups 目录不存在或没有有效备份
- `ROLLBACK_FAILED`
  - latest manifest 读取失败
  - 指定 manifest 读取失败
  - manifest 指向的备份文件缺失
  - restore 过程中 copy/delete 失败

如果后续版本要继续细分，只能选择以下一种路径：

- 新增更具体的 `error.code`
- 维持主错误码不变，但在 `details.reason` 或 `details.cause` 中细分

不能同时模糊地引入一组既不像命令错误码、又不像诊断 issue code 的中间状态。

## 8. runtime state 与恢复边界

### 8.1 设计选择

runtime state 的设计选择是：

- 新增安全检查与诊断包装
- 不直接发明新的公共输出 schema

### 8.2 读取策略分层

建议把运行态读取分成两类路径：

- safe inspection helper
  - 供 `status`、`doctor`、direct provider 相关只读路径使用
  - 遇到脏 runtime state 时，返回可解释的空值、warning 或 issue，而不是直接崩溃
- stricter loader
  - 供 bridge lifecycle 路径使用
  - 在 `bridge start/stop/status` 等需要高置信度状态的场景中维持严格校验

这样可以保证：

- 诊断类命令足够稳健
- bridge 生命周期命令仍保留必要的严格性
- direct provider 读路径不会被无关的 stale runtime state 连带打崩

### 8.3 与 backup / rollback 的关系

runtime state 继续保持在 managed backup 事务外：

- backup 不承诺捕获 `copilot-bridge-state.json`
- rollback 不承诺恢复 bridge 进程
- `doctor` / `status` 负责解释运行态是否 stale、missing 或 mismatch

## 9. release correctness

`0.0.10` 需要把以下内容纳入发布正确性检查：

- CLI `--version` 必须与 `package.json` 一致
- README 与公开文档中的版本字样应与本次发布版本一致
- `npm pack` 作为发布前 sanity check 执行

这里的设计选择是：

- `npm pack` 是 preflight，不是默认测试流的一部分
- 版本一致性检查属于 release correctness，不等同于功能测试

## 10. 公开接口 / 契约变化

`0.0.10` 需要在设计稿中单独固定以下公开变化：

- `status.data.auth` 是中性文件状态，不含 provider ownership 或 managed key 列表
- `doctor` 不再承诺任何 `auth mirror mismatch` 类问题码
- `backups list` 的稳定 JSON 载荷固定为 `backupId`、`createdAt`、`reason`、`files`、`backupPath`
- `rollback` 的稳定成功载荷固定为 `restoredFiles`、`backupId`、`backupPath`
- `MIGRATE_NO_ADOPTABLE_PROFILES` 是命令错误码，不是 `doctor` / `status` issue code
- 本版明确不引入 `status.health.*` 契约

## 11. 模块设计与代码落点

本版按行为分组说明代码落点，而不是逐文件抄清单。

### 11.1 命令流与交互前置检查

主要落点：

- `src/commands/handlers.ts`
- `src/interaction/interactive.ts`

职责：

- 解析 `migrate`、`rollback` 等命令的交互边界
- 在进入 prompt 前完成 adoptability 预检查
- 空 registry 时跳过无意义策略 prompt
- 在 help / human output 中同步更准确的失败说明

### 11.2 诊断与状态聚合

主要落点：

- `src/app/get-status.ts`
- `src/app/run-doctor.ts`
- `src/storage/auth-repo.ts`
- runtime state 读取辅助

职责：

- 聚合 config/providers consistency、auth state、runtime probe、bridge probe
- 固定 `status.data.auth` 与 `status.data.storage` shape
- 继续沿用 `doctor.data.issues[]` 作为主诊断面

### 11.3 恢复与运行态边界

主要落点：

- `src/storage/backup-repo.ts`
- `src/app/rollback-backup.ts`
- `src/storage/runtime-state-repo.ts`
- bridge runtime helper

职责：

- 保持 backup manifest 校验、list、restore 语义一致
- 明确 latest 与显式 `backupId` 的 rollback 路径
- 在读路径上对 runtime state 做安全包装，在生命周期路径上保留严格加载

### 11.4 人类可读输出与帮助文本

主要落点：

- `src/commands/registry.ts`
- `src/cli/output.ts`
- 相关 help 文案与错误消息

职责：

- 让 `migrate` 非交互失败信息更直接
- 让 `doctor` / `status` 的字段说明不再暗示 auth mirror 模型
- 让 `backups list` / `rollback` 的对外说明与真实载荷对齐

## 12. 示例片段

### 12.1 `status.data.auth`

```json
{
  "exists": true,
  "valid": false,
  "parseError": "Failed to parse auth.json.",
  "authMode": null
}
```

### 12.2 `status.data.storage`

```json
{
  "managementSSOT": "providers.json",
  "runtimeMirrors": ["config.toml"],
  "authStateFile": "auth.json",
  "rollbackState": "backups/latest.json"
}
```

### 12.3 `backups list` 单项

```json
{
  "backupId": "20260511-221457-migrate",
  "createdAt": "2026-05-11T22:14:57.000Z",
  "reason": "migrate",
  "files": ["providers.json", "config.toml"],
  "backupPath": "C:\\Users\\name\\.codex\\backups\\20260511-221457-migrate"
}
```

### 12.4 `rollback` success

```json
{
  "data": {
    "restoredFiles": ["providers.json", "config.toml"],
    "backupId": null,
    "backupPath": "C:\\Users\\name\\.codex\\backups\\20260511-221457-migrate"
  }
}
```

### 12.5 `MIGRATE_NO_ADOPTABLE_PROFILES`

```json
{
  "error": {
    "code": "MIGRATE_NO_ADOPTABLE_PROFILES",
    "message": "No adoptable profiles were found for migrate.",
    "details": {
      "availableProfiles": ["work-openai"],
      "adoptableProfiles": [],
      "blockingReasonsByProfile": {
        "work-openai": [
          "model_provider must match the profile name.",
          "model_providers.work-openai.env_key is missing."
        ]
      }
    }
  }
}
```

### 12.6 `doctor.data.issues[]` 单项

```json
{
  "code": "BRIDGE_STATE_STALE",
  "message": "Copilot bridge runtime state exists for a provider that is not the current active profile.",
  "activeProfile": "openai",
  "runtimeProvider": "copilot",
  "runtimeProfile": "copilot"
}
```

## 13. 测试设计

测试设计按当前测试组织展开，重点覆盖以下内容。

### 13.1 `migrate`

- 0 adoptable profiles 时直接失败为 `MIGRATE_NO_ADOPTABLE_PROFILES`
- `providers.json` 已存在但 registry 为空时跳过策略 prompt
- 非交互失败继续走 `INVALID_ARGUMENT`，并带清晰 suggestion
- `blockingReasonsByProfile` 覆盖以下阻塞类型：
  - 缺 `model`
  - 缺 `model_provider`
  - `model_provider` 名称不匹配
  - 缺 `model_providers.<name>`
  - 缺 `base_url`
  - 缺 `env_key`

### 13.2 `doctor` / `status`

- `AUTH_JSON_INVALID`
- config/profile/provider consistency
- `COPILOT_SDK_MISSING`
- `COPILOT_AUTH_REQUIRED`
- `BRIDGE_STATE_MISSING`
- `BRIDGE_STATE_STALE`
- `PROVIDER_BASE_URL_MISMATCH`
- `BRIDGE_HEALTHCHECK_FAILED`
- direct provider 下脏 runtime state 仍能稳定输出

### 13.3 backup / rollback

- invalid or missing manifest warnings
- `BACKUP_NOT_FOUND`
- `ROLLBACK_FAILED`
- restore missing backup file
- `rollback latest`
- 显式 `rollback <backupId>`

### 13.4 release correctness

- built CLI `--version`
- `package.json` version
- README 版本标注一致性
- `npm pack` preflight

## 14. 完成标准

`0.0.10` 设计工作完成时，必须满足：

1. 文档中不再出现 `auth mirror`、`auth mirror mismatch`、`status.health.*` 等与当前实现冲突的硬承诺。
2. `migrate`、`doctor`、`status`、`backups list`、`rollback` 的公共契约可以直接从设计稿读出，而不需要回查旧 PRD 或猜测代码行为。
3. runtime state 被明确定位为“安全检查与诊断包装对象”，而不是新的强事务 managed state。
4. 发布前检查明确包含 CLI 版本、打包产物与公开文档版本标注三类一致性校验。

## 15. 发布前检查

发布 `0.0.10` 前至少执行：

1. 验证 `node dist/cli.js --version` 与 `package.json` 一致。
2. 验证公开文档中的版本字样没有停留在旧版本或提前承诺未来 schema。
3. 执行 `npm pack`，确认发布包可生成，且文档、构建产物和 CLI 入口完整。
