# codex-switch `0.0.10` PRD

## 文档信息

- 状态：Active PRD
- 产品名：`codex-switch`
- CLI 命令名：`codexs`
- 当前基线版本：`0.0.9`
- 目标版本：`0.0.10`
- 文档定位：定义 `0.0.9 -> 0.0.10` 的直接需求范围
- 关联 roadmap：[`../Design/codex-switch-v0.0.9-to-v0.0.12-roadmap.md`](../Design/codex-switch-v0.0.9-to-v0.0.12-roadmap.md)
- 关联上一版 PRD：[`./codex-switch-prd-v0.0.9.md`](./codex-switch-prd-v0.0.9.md)

## 一句话定义

`0.0.10` 是一个 hardening release：以当前代码行为为事实边界，收敛 `migrate` 前置检查、`doctor` / `status` 诊断清晰度、backup / rollback 失败语义、runtime state 安全读取和 release correctness，而不是扩展新的大 JSON 契约或新的状态模型。

## In Scope

- `migrate` 迁移前置检查与交互收敛
- `doctor` 诊断文案与 issue 收口
- `status` 结果可读性与解释性增强
- `backups list` / `rollback` 恢复体验与失败语义澄清
- runtime state 文件的安全读取与问题归类
- `--version` / package / 打包产物的 release correctness
- 与上述范围直接相关的测试与文档补齐

## Out of Scope

- 新增大型命令族
- 新增 repair / fix 命令
- 非交互式 `migrate` 完整支持
- 新的 `status.health.*` 聚合 schema
- 新的 `doctor` 并行诊断结构
- 把 `auth.json` 变成 active provider secret mirror
- 将 runtime state 纳入 managed backup 的强事务保证

## 当前版本问题

`0.0.9` 已经具备 direct provider 与 Copilot bridge provider 的主流程，但 `0.0.10` 之前仍有几类边界不够清楚：

- `migrate` 在进入交互前，对“哪些 profile 可 adopt、哪些不可 adopt、原因是什么”的表达不够直接
- `providers.json` 已存在但 registry 为空时，`merge` / `overwrite` 提示没有价值
- `doctor` 与 `status` 现有信息量足够，但文档对其稳定结构、问题边界和错误层级说明不足
- 旧 PRD 把 `auth.json` 描述成 provider secret mirror，这与当前实现不符
- runtime state 的读取和问题分类需要以安全读取为目标，但不应发明两套未定义的新错误契约
- `backups list` / `rollback` 对损坏 manifest、缺失备份文件、latest 与显式 backup id 的行为边界需要写清
- release correctness 除 CLI `--version` 外，还需要把公开文档中的版本标注一致性纳入发布前检查

## 核心目标

`0.0.10` 需要完成以下几件事：

- 让 `migrate` 在 adopt 流程之前先说明“能不能迁、为什么不能迁”
- 让 `doctor` 和 `status` 围绕当前已有结构给出更清楚的状态解释
- 让 backup / rollback 的成功载荷、失败语义与覆盖边界可预期
- 让 runtime state 的读取从“信任输入”转为“安全读取并分类问题”
- 让发布检查覆盖版本号、打包产物与公开文档版本标注

## 数据边界与术语

`0.0.10` 明确以当前实现为准，固定以下术语：

- `providers.json`
  - 管理态 registry
  - 是 managed state 的 SSOT
- `config.toml`
  - 运行态路由投影
  - 反映当前 active profile 与 runtime 配置
- `auth.json`
  - 独立认证状态文件
  - 只做存在性、可解析性和基础元数据读取
  - 不是 active provider 的 secret mirror
- runtime state
  - Copilot bridge 的本地运行态文件
  - 用于读路径上的运行态观测和问题归类
  - 不属于 managed backup 的强保证事务边界
- backups
  - 针对 managed files 的恢复依据
  - 不承诺恢复运行中的 bridge 进程或外部登录态

本版 PRD 删除以下旧说法：

- `auth mirror`
- `auth mirror mismatch`
- `auth.json` key/value 必须与 active provider secret 对齐
- 把 runtime state manifest invalid 同时写成命令错误和 issue 错误两套未定义契约

## `migrate` 目标

### 1. adoptability 前置检查

`0.0.10` 中，`migrate` 的重点不是扩展导入能力，而是把交互式 adopt 路径做扎实。

必须满足：

- 在 strategy prompt 前先完成 adoptability 预检查
- 若没有任何 adoptable profiles，命令必须立即失败，不再进入后续交互
- 空 registry 场景要在 adopt 流程前被识别，避免无意义提示

允许作为本版新增命令错误码：

- `MIGRATE_NO_ADOPTABLE_PROFILES`

若引入该错误码，PRD 只固定以下 `details` 边界：

- `availableProfiles` 是稳定字段
- `adoptableProfiles` 是稳定字段
- `blockingReasonsByProfile` 字段存在本身是稳定契约
- `blockingReasonsByProfile` 中的 reason 文本只保证人类可读，不保证固定枚举

adopt 阻塞原因应与当前 config consistency 模型对齐，重点覆盖：

- profile 缺 `model`
- profile 缺 `model_provider`
- `model_provider` 名称与 profile 不匹配
- 对应 `model_providers.<name>` section 缺失
- `base_url` 缺失
- `env_key` 缺失

### 2. 空 registry 交互策略

当 `providers.json` 已存在但 registry 为空时：

- 跳过 `merge` / `overwrite` 提示
- 继续按低风险初始化语义执行
- 内部可按 `overwrite` 语义处理，但无需把这件事包装成新的对外 schema

### 3. 非交互式 `migrate` 边界

`0.0.10` 不新增完整的非交互式 `migrate` profile 选择或 secret 注入参数。

因此：

- 非交互式 `migrate` 继续失败
- 错误消息和帮助文档需要更清楚
- 现有 `adoptableProfiles` / `availableProfiles` 细节可继续暴露
- 本版不承诺自动化 migrate contract

## `doctor` 目标

`doctor` 的目标是收敛到当前已有的 `doctor.data.issues[]` 模型，不再发明并行的诊断结构。

### 稳定输出方向

- `doctor.data.issues[]` 继续作为主诊断输出
- `message` 应更易读、更可执行
- “下一步怎么做”在 `0.0.10` 中可以通过 message / warning 文案表达
- 本版不强制新增独立结构化 `nextAction` 字段

### `0.0.10` 应明确覆盖的诊断域

- config / providers 一致性问题
  - 例如 active profile 未受管、profile linkage 冲突、`model_provider` / `base_url` / `env_key` 缺失或不一致
- `AUTH_JSON_INVALID`
  - 仅在 auth 文件存在但不可解析时报告
- Codex runtime probe 问题
  - `CODEX_NOT_INSTALLED`
  - `CODEX_VERSION_UNSUPPORTED`
  - `CODEX_LOGIN_FAILED`
- Copilot / bridge 相关问题
  - `COPILOT_SDK_MISSING`
  - `COPILOT_AUTH_REQUIRED`
  - `BRIDGE_STATE_MISSING`
  - `BRIDGE_STATE_STALE`
  - `PROVIDER_BASE_URL_MISMATCH`
  - `BRIDGE_HEALTHCHECK_FAILED`

### 本版明确不做的诊断

- 不检查 `auth.json` 与 active provider 的 key/value mirror 一致性
- 不把 `auth.json` 解析成功后的内容提升成 provider ownership 语义
- 不新增第二套面向自动化的大 JSON 诊断合同

## `status` 目标

`status` 在 `0.0.10` 的目标是保持当前 JSON shape 稳定，同时提升“易读性”和“解释性”；本版不要求新增 `health.*` 契约。

### 当前 JSON shape 作为事实边界

`status` 的重点继续围绕现有字段表达：

- `currentProfile`
- `currentProfileMapped`
- `provider`
- `activeProviderResolvable`
- `activeProviderCandidates`
- `copilotSdk`
- `copilotAuth`
- `copilotBridge`
- `copilotRuntimeState`
- `liveState`
- `auth`
- `issues`
- `storage`

### `status.data.auth` 的稳定边界

`status.data.auth` 在 `0.0.10` 中固定为中性文件元数据：

- `exists`
- `valid`
- `parseError`
- `authMode`

它不包含：

- provider secret ownership
- managed key 列表
- auth mirror 一致性结论

### `status.data.storage` 的稳定边界

`status.data.storage` 在 `0.0.10` 中固定为：

- `managementSSOT: "providers.json"`
- `runtimeMirrors: ["config.toml"]`
- `authStateFile: "auth.json"`
- `rollbackState: "backups/latest.json"`

### 本版不做的事

- 不强制新增 `health.overall`
- 不强制新增 `health.configProjection`
- 不强制新增 `health.authMirror`
- 不强制新增 `health.runtime`
- 不强制新增 `health.summary`

“health summary” 可以作为未来版本候选，但不是 `0.0.10` 必交项。

## backup / rollback 目标

### `backups list`

`backups list` 章节按当前稳定输出定义：

- `backupId`
- `createdAt`
- `reason`
- `files`
- `backupPath`

补充要求：

- warnings 用于提示损坏或缺失 manifest 的历史项
- `file count` 可以作为展示层派生信息，但不是新的稳定 JSON 字段

### `rollback`

`rollback` 章节按当前行为收口：

- success 返回稳定载荷：
  - `restoredFiles`
  - `backupId`
  - `backupPath`
- 要明确区分 `rollback latest` 与显式 `rollback <backupId>` 两条路径
- 失败语义先按当前命令错误收口：
  - `BACKUP_NOT_FOUND`
  - `ROLLBACK_FAILED`

如果希望推动更细粒度失败分类，必须明确写清：

- 是新增 `error.code`
- 还是仅在 `error.details.reason` 中细分

不能继续使用模糊表述。

### rollback 覆盖边界

文档必须明确：

- rollback 的强保证只覆盖 managed files
- rollback 不保证恢复运行中的 bridge 进程状态
- rollback 不覆盖外部 runtime install side effects
- rollback 不覆盖上游登录 / session 状态
- runtime state 与运行中进程状态不属于同等级 rollback 保证

## runtime state 目标

runtime state 在 `0.0.10` 中的目标是“安全读取与问题归类”，而不是引入新的未落地合同。

要求：

- runtime state 文件读取必须安全包装
- 需要能在读路径上区分常见问题来源，例如：
  - 文件缺失
  - 不可解析或脏数据
  - provider 绑定陈旧
  - active profile 绑定陈旧
  - base URL 漂移
  - healthcheck 失败
- 对 direct provider 场景，不应因为存在脏 runtime state 而导致误导性崩溃

本版不要求：

- 为“invalid runtime-state manifest shape”同时定义新的命令错误码和新的 issue code
- 把 runtime state 纳入 managed backup 事务

## release correctness 目标

`0.0.10` 需要把 release correctness 作为显式质量目标。

至少包括：

- built CLI `--version` 与 `package.json` version 对齐
- 测试不再写死历史版本号
- `npm pack` 产物 sanity check
- 仓库公开文档中的版本标注一致性纳入发布前检查

最后一项需要明确写入本版要求，因为当前公开文档仍可能残留旧版本字样。

## 错误语义

`0.0.10` 需要在 PRD 中明确区分两层错误语义：

- CLI command failure `error.code`
- `doctor` / `status` 中 `issues[]` 的 issue code

要求：

- 两者命名尽量对齐
- 但两者不是同一层契约
- 不应在 PRD 中混写成一个统一错误空间

本版需要明确说明：

- `MIGRATE_NO_ADOPTABLE_PROFILES` 若引入，是命令错误码
- 它不是 `doctor` issue code
- 也不是 `status` issue code

## 公开契约

本版 PRD 需要显式声明以下对外契约：

- `status.data.auth` 是中性文件元数据，不含 provider secret ownership，不含 managed key 列表
- `doctor` 不检查 `auth.json` 与 active provider 的 key/value 镜像一致性；只在 auth 文件存在但不可解析时报告 `AUTH_JSON_INVALID`
- `backups list` 的稳定列表项是 `backupId`、`createdAt`、`reason`、`files`、`backupPath`
- `rollback` 的稳定成功载荷是 `restoredFiles`、`backupId`、`backupPath`
- `0.0.10` 若新增 `MIGRATE_NO_ADOPTABLE_PROFILES`，这是命令错误码，不是 `doctor` 或 `status` 的 issue code

## 验收标准

达到以下条件时，`0.0.10` 可以认为完成：

- `migrate` 在 0 adoptable profiles 场景下立即失败，不再继续无意义交互
- 缺 `model` / 缺 `model_provider` / linkage 不合法 / 缺 `base_url` / 缺 `env_key` 时，adoptability 结果能解释阻塞原因
- 空 `providers.json` registry 不再触发多余的 `merge` / `overwrite` 提示
- `doctor` 继续以 `issues[]` 为主，并对 auth parse failure、config consistency、Codex probe、Copilot bridge 问题给出清楚结论
- `status` 保持当前 shape 稳定，并能围绕现有字段解释 active provider、映射状态、runtime 相关状态
- direct provider 和 Copilot provider 在存在脏 runtime state 时都能稳定输出
- `backups list` / `rollback` 对损坏 manifest、缺失备份文件、latest 与显式 backup id 路径给出清楚结果
- built CLI `--version` 与 `package.json` version 保持一致
- 发布检查覆盖 `npm pack` 和公开文档版本标注一致性

## 测试重点

### `migrate`

- 0 adoptable profiles 立即失败
- 空 registry 跳过 strategy prompt
- 非交互式失败消息更清楚
- profile 缺 `model`
- profile 缺 `model_provider`
- profile 的 `model_provider` 命名不匹配
- profile 缺 `base_url`
- profile 缺 `env_key`

### `doctor` / `status`

- `AUTH_JSON_INVALID`
- config / profile / provider consistency issues
- `COPILOT_SDK_MISSING`
- `COPILOT_AUTH_REQUIRED`
- `BRIDGE_STATE_MISSING`
- `BRIDGE_STATE_STALE`
- `PROVIDER_BASE_URL_MISMATCH`
- `BRIDGE_HEALTHCHECK_FAILED`
- direct provider 场景下存在脏 runtime state 时仍稳定输出

### backup / rollback

- invalid or missing manifest warnings in `backups list`
- `BACKUP_NOT_FOUND`
- `ROLLBACK_FAILED`
- restore missing backup file
- `rollback latest`
- 显式 `rollback <backupId>`

### release correctness

- built CLI `--version`
- `package.json` version
- `npm pack` sanity check
- 仓库公开文档版本标注一致性

## 文档任务

- 明确说明 `migrate` adoptability 前置条件
- 说明 `doctor` / `status` 的当前 JSON 边界，而不是发明新的 `health.*` schema
- 文档化 rollback 覆盖范围与非覆盖范围
- 说明 runtime state 的用途与限制
- 更新 CLI usage 中 `migrate`、`doctor`、`status`、`backups list`、`rollback` 的行为描述

## 结论

`0.0.10` 不是扩命令面的版本，而是一次边界对齐和正确性收敛。它的完成标准不是“新增多少 schema”，而是“现有 CLI 在迁移、诊断、回滚和发布这几条关键路径上，是否能用当前真实实现给出稳定、清楚、低误导性的行为与文档承诺”。
