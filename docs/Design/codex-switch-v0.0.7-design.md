# codex-switch `0.0.7` 设计文档

## 文档信息

- 文档类型：详细设计文档
- 适用版本：`0.0.7`
- 目标范围：`0.0.6 -> 0.0.7`
- 主对齐 PRD：[`../PRD/codex-switch-prd-v0.0.5-to-v0.1.0.md`](../PRD/codex-switch-prd-v0.0.5-to-v0.1.0.md)
- 当前实现基线：[`codex-switch-v0.0.6-design.md`](./codex-switch-v0.0.6-design.md)
- 风格基线：[`codex-switch-v0.0.5-design.md`](./codex-switch-v0.0.5-design.md)

## 1. 文档目标

这份文档回答的是 `0.0.7` 应该怎样落地，而不是继续讨论长期愿景：

- `providers.json`、`config.toml`、`auth.json` 的职责边界应该怎样正式纠偏
- 当前实现从“`providers.json.apiKey + config.toml api_key + codex login`”迁移到“`providers.json.profile/apiKey/envKey + config.toml env_key + auth.json mirror`”时，哪些行为必须定死
- `setup`、`add`、`edit`、`switch`、`doctor`、`status` 的契约应该怎样收口
- `auth.json` 的受管镜像模型、历史受管键清理策略和回滚事务边界是什么
- 当前代码结构上具体改哪些模块、补哪些错误码、补哪些 fixture 与测试

目标是让实现阶段不再重复拍板 provider secret 应该落在哪、`env_key` 怎样派生、切换时怎样同步认证态这些关键技术决策。

## 2. 版本定位与设计原则

### 2.1 当前基线

当前 `0.0.6` 已具备：

- provider registry 管理：`list`、`show`、`add`、`edit`、`remove`
- 运行态切换：`current`、`switch`
- 导入导出：`import`、`import --merge`、`export`
- 初始化与诊断：`setup`、`status`、`doctor`
- 备份恢复：`backups list`、`rollback`
- `config show` / `config list-profiles`
- 命令表面、应用用例、存储访问、运行时集成的基础分层
- 写操作统一走锁、备份、失败回滚

当前主要问题已经不是“缺命令”，而是 provider 配置语义仍然存在错误假设：

- 把 `config.toml [model_providers.*].api_key` 当作可依赖的 provider secret 来源
- 把 `codex login` 当作 `switch` 的主线切换机制
- `providers.json` 尚未正式收纳 `envKey`
- `auth.json` 仍未被定义为“当前 active provider 的受管认证镜像”

### 2.2 `0.0.7` 的一句话定义

`0.0.7` 的核心不是增加新命令，而是完成 Provider Configuration Correction：移除 `config.toml api_key` 假设，锁定 `env_key` 驱动的运行态路由与认证镜像模型，并让 provider registry、runtime config、auth mirror 三方一致性成为正式默认能力。

### 2.3 设计原则

`0.0.7` 继续沿用现有工程原则：

- `CLI First`
- `Local First`
- `Safe by Default`
- `AI Friendly`
- `Split State Model`
- `Lightweight Transactions`

在此基础上新增五条版本原则：

- 不再把 provider secret 写入 `config.toml`
- 不再把 `codex login` 作为 `switch` 主线依赖
- `envKey` 来自 runtime `env_key`，不是独立自由输入源
- `auth.json` 只镜像当前 active provider，不升级为多 provider secret 仓库
- 历史旧状态允许被识别和报告，但不承诺无条件兼容运行

## 3. 范围与边界

### 3.1 `0.0.7` 范围内

本设计覆盖：

- `providers.json` 正式 schema 收口为 `profile + apiKey + envKey`
- `config.toml` 运行态字段正式收口到 `base_url + env_key`
- `auth.json` 的受管认证镜像读写与诊断
- `setup` / `add` / `edit` / `switch` / `doctor` / `status` / `show` / `list` / `config show` 的语义重构
- 切换与 setup 成功后的 config-auth 双写与事务回滚
- 共享 profile 下 active provider 唯一判定规则
- fixture、测试、过渡态识别与诊断信号升级

### 3.2 明确不在 `0.0.7` 范围内

下面这些内容不进入本设计：

- 多 auth mode 作为正式受管能力
- `requires_openai_auth`、command auth、网页登录等其他认证路线
- 把 `auth.json` 扩展为多 provider 缓存仓库
- 通用 `config edit` 命令族
- 自动修复所有历史不一致状态的独立 `repair` 命令
- 第三方 auth adapter 的产品化接口

### 3.3 数据边界

`0.0.7` 直接锁定三个核心文件的职责边界：

- `providers.json`：管理态事实源，保存 provider registry，包括 `profile`、`apiKey`、`envKey`
- `config.toml`：运行态路由事实源，保存 active `profile`、`[profiles.*]` 与 `[model_providers.*].base_url/env_key`
- `auth.json`：当前 active provider 的认证运行态镜像，不是 registry，也不是长期多 provider secret 仓库

附加约束：

- `config.toml [model_providers.*].api_key` 不再是合法受管字段
- `providers.json` 中的 `envKey` 必须与 runtime `env_key` 一致
- `auth.json` 只对当前 provider 投影，不保存其他 provider 的 managed secret

## 4. `0.0.7` 功能总览

`0.0.7` 需要完成五件事：

- 锁定 provider registry、runtime config、auth mirror 三层的数据模型
- 让 `setup` / `add` / `edit` / `switch` 围绕 `env_key` 而不是 `api_key` 运转
- 新增 `auth.json` 的受管镜像写入、回滚和诊断能力
- 扩展 `doctor` / `status` / `show` / `list` / `config show` 的可观测性
- 明确旧 fixture、旧测试和旧运行态的识别策略，避免“半兼容、半失真”的过渡实现

## 5. 数据模型设计

### 5.1 `providers.json` 正式 schema

`0.0.7` 锁定正式 provider schema 为：

```json
{
  "providers": {
    "packycode": {
      "profile": "packycode",
      "apiKey": "sk-xxx",
      "envKey": "PACKYCODE_API_KEY",
      "baseUrl": "https://example.com/v1",
      "note": "primary route",
      "tags": ["paid"]
    }
  }
}
```

约束：

- `profile` 必填
- `apiKey` 必填
- `envKey` 必填
- `baseUrl` 仍可作为 registry 元数据保留，但不是 runtime 真值来源
- `note`、`tags` 保持原有管理属性

产品语义：

- `profile` 表示 provider 指向的 runtime profile 名
- `apiKey` 表示当前 provider 的 managed secret
- `envKey` 表示切换后写入 `auth.json` 的目标键名，且必须对应 `config.toml [model_providers.<profile>].env_key`

### 5.2 `config.toml` 运行态模型

`0.0.7` 下 `config.toml` 继续是“部分受管的 runtime projection”，但正式字段范围收口如下：

- 顶层 `profile = "..."`：当前 active profile
- `[profiles.<name>]`：至少受管 `model`、`model_provider`
- `[model_providers.<name>].base_url`：runtime 路由地址
- `[model_providers.<name>].env_key`：runtime 认证环境变量键名

明确禁止：

- `[model_providers.<name>].api_key`
- 把 provider secret 持久化到 `config.toml`

设计原因：

- runtime 路由应该由 `profile -> model_provider -> model_providers.<name>` 链路表达
- runtime secret 键名应该由 `env_key` 表达
- secret 值本身只允许由 `providers.json` 和 `auth.json` 承担，不再和 `config.toml` 混放

### 5.3 `auth.json` 运行态镜像模型

`auth.json` 在 `0.0.7` 中被正式定义为当前 active provider 的受管认证镜像：

```json
{
  "auth_mode": "apikey",
  "PACKYCODE_API_KEY": "sk-xxx"
}
```

约束：

- `auth_mode` 固定写入 `apikey`
- secret 键名来自当前 provider 的 `envKey`
- secret 值来自当前 provider 的 `apiKey`
- `auth.json` 不作为 provider registry 使用
- `auth.json` 不持有 inactive provider 的 managed secret

### 5.4 `ManagedProfileView`

`ManagedProfileView` 继续是读取命令使用的稳定视图，但 `0.0.7` 起必须补充 `envKey` 解析结果：

```ts
type ManagedProfileView = {
  name: string;
  managed: boolean;
  isActive: boolean;
  linkedProviders: string[];
  model: string | null;
  modelProvider: string | null;
  baseUrl: string | null;
  envKey: string | null;
  managedFields: string[];
  source: "managed" | "unmanaged" | "orphaned-reference";
};
```

新增语义：

- `envKey` 表示通过 `model_provider -> model_providers.<name>.env_key` 解析出的 runtime env key
- `envKey = null` 时，表示该 profile 当前不能作为完整受管 provider runtime 使用

### 5.5 `ConfigConsistencyIssue`

`0.0.7` 的诊断抽象要在 `0.0.6` 既有问题类型基础上增加 env key 和 auth mirror 相关 issue：

```ts
type ConfigConsistencyIssue =
  | { code: "ORPHANED_PROFILE_REFERENCE"; profile: string; providers: string[] }
  | { code: "UNMANAGED_ACTIVE_PROFILE"; profile: string }
  | { code: "SHARED_PROFILE_REFERENCE"; profile: string; providers: string[] }
  | { code: "ORPHANED_PROFILE_SECTION"; profile: string }
  | { code: "DESTRUCTIVE_REMOVE_BLOCKED"; profile: string; provider: string; activeProfile: string }
  | { code: "MODEL_PROVIDER_ENV_KEY_MISSING"; profile: string; modelProvider: string }
  | { code: "PROVIDER_ENV_KEY_MISMATCH"; provider: string; profile: string; providerEnvKey: string; runtimeEnvKey: string | null }
  | { code: "AUTH_JSON_INVALID"; reason: string }
  | { code: "AUTH_JSON_ENV_KEY_MISMATCH"; provider: string; expectedEnvKey: string; actualEnvKeys: string[] }
  | { code: "AUTH_JSON_APIKEY_MISMATCH"; provider: string }
  | { code: "ACTIVE_PROVIDER_UNRESOLVED"; profile: string; providers: string[] };
```

说明：

- `MODEL_PROVIDER_ENV_KEY_MISSING`：runtime `model_providers.<name>` 缺失 `env_key`
- `PROVIDER_ENV_KEY_MISMATCH`：provider registry 的 `envKey` 与 runtime `env_key` 不一致
- `AUTH_JSON_INVALID`：`auth.json` 非法、无法解析、结构缺关键字段或存在冲突 managed secret
- `AUTH_JSON_ENV_KEY_MISMATCH`：当前 `auth.json` 写入的 managed env key 与 active provider 不一致
- `AUTH_JSON_APIKEY_MISMATCH`：当前 `auth.json` 中的 secret 值与 active provider 的 `apiKey` 不一致
- `ACTIVE_PROVIDER_UNRESOLVED`：当前 active profile 无法唯一反推 provider

## 6. 运行态镜像与一致性规则

### 6.1 三方一致性主规则

`0.0.7` 直接锁定以下一致性规则：

- provider 的 `profile` 必须指向存在的 runtime profile
- runtime profile 必须具备 `model`、`model_provider`
- `profiles.<name>.model_provider` 必须能解析到同名 `[model_providers.<name>]`
- runtime `model_providers.<name>` 必须具备 `base_url` 和 `env_key`
- provider 的 `envKey` 必须等于 runtime `env_key`
- 当前 active provider 的 `apiKey` / `envKey` 必须完整镜像到 `auth.json`

### 6.2 `envKey` 派生规则

`envKey` 不是自由主输入源，而是 runtime 派生字段：

- 来源：`config.toml [model_providers.<profile>].env_key`
- 用途：持久化写回 `providers.json`，并作为 `auth.json` 键名
- 常规路径下，`add` / `edit` 不把 `--env-key` 作为主要用户输入面

设计要求：

- `add` / `edit` / `setup adopt` 必须从 runtime 读取 `env_key`
- 如果 runtime 缺失 `env_key`，写操作失败，而不是静默继承旧值
- `edit` 仅更新 `note` / `tags` / `apiKey` 时，可保持原 `envKey`，但 `doctor` 仍需校验其与 runtime 是否一致

### 6.3 共享 profile 与当前 provider 唯一判定

共享 profile 在 `0.0.7` 仍然允许存在，但规则必须更明确：

- 多个 provider 可以共享同一 `profile`
- `auth.json` 只镜像当前 provider，因此每次需要写 auth mirror 时，当前 provider 必须可唯一判定
- 若仅凭 active profile 不能唯一确定 provider，则不能隐式猜测

处理策略：

- `switch <provider>`：输入就是 provider name，因此总能唯一定位
- `setup` 完成 provider registry 初始化后，如果需要同步当前 active auth mirror，而 active profile 映射多个 provider：
  - 交互模式：必须显式询问“哪个 provider 代表当前 active profile”
  - 非交互模式：必须失败并报 `ACTIVE_PROVIDER_UNRESOLVED`

### 6.4 `auth.json` 受管键集合

设计中正式引入“受管键集合”概念：

- 当前受管固定键：`auth_mode`
- 当前受管 secret 键：当前 provider 的 `envKey`
- 历史受管 secret 键：之前由 `codex-switch` 写入的 `api_key` 或其他旧 managed env key

分类规则：

- 受管键：`auth_mode` + 当前 provider `envKey` + 历史受管 secret 键
- 非受管键：其他未知对象或元信息，例如 `user`、`last_login`

写入策略：

- 保留非受管元字段
- 移除旧的 managed secret 字段
- 移除旧的固定 `api_key` managed 字段
- 最终写回 `auth_mode = apikey` + 当前 provider `envKey = apiKey`

### 6.5 `auth.json` helper 能力

内部建议锁定以下 helper 目标接口：

```ts
type ManagedAuthPayload = {
  auth_mode: "apikey";
  secretKey: string;
  secretValue: string;
};

function buildManagedAuthPayload(provider: ProviderRecord): ManagedAuthPayload;
function writeAuthMirror(authPath: string, provider: ProviderRecord, existingAuthJson?: unknown): void;
function readManagedAuthState(authPath: string): ManagedAuthState;
```

同时建议在 storage 层增加等价能力模块，例如 `src/storage/auth-repo.ts`，至少承载：

- `readAuthFileIfExists`
- `writeAuthFile`
- `buildManagedAuthJson`
- `extractManagedAuthFingerprint`

设计要求：

- `auth.json` 写入属于 storage，不属于 runtime
- 因为它是本地文件镜像，不是外部 CLI 调用

## 7. 命令详细设计

### 7.1 `setup`

`setup` 的 adoptable profile 条件收紧为同时满足：

- 有 `[profiles.<name>]`
- 有 `model`
- 有 `model_provider`
- `model_provider === profileName`
- 有同名 `[model_providers.<name>]`
- 有 `base_url`
- 有 `env_key`

`setup` 从 runtime 读取：

- `profile`
- `baseUrl`
- `envKey`

`setup` 只补问：

- `providerName`
- `apiKey`
- `note`
- `tags`

说明：

- `baseUrl` 可以作为回显和 registry 元数据写回来源
- `envKey` 只读自 runtime，不作为常规补问字段

成功路径：

- 写入或合并 `providers.json`
- 解析当前 active profile 所对应的当前 provider
- 立即同步当前 provider 到 `auth.json`
- 最后运行 `doctor` 或复用同等级一致性校验，确保初始状态可诊断

特殊规则：

- 若当前 active profile 无法唯一映射到 provider：
  - 交互模式补问选择 provider
  - 非交互模式失败

### 7.2 `add`

`add` 仍要求：

- `providerName`
- `profile`
- `apiKey`

`add` 的 `envKey` 规则：

- 不作为显式主要输入
- 从 `config.toml [model_providers.<profile>].env_key` 读取
- 若对应 runtime section 缺失 `env_key`，则失败

`baseUrl` 规则：

- `--base-url` 仍可作为 registry 元数据
- 但它不代替 runtime `base_url`
- `doctor` 可继续校验 registry `baseUrl` 与 runtime `base_url` 的偏差，但 runtime 真值仍以 `config.toml` 为准

### 7.3 `edit`

`edit` 的核心行为调整：

- `apiKey` 仍可编辑
- `note`、`tags` 仍可编辑
- `profile` 可编辑

当 `profile` 变更时：

- 新的 `envKey` 必须从目标 profile runtime section 重新解析并覆盖
- 不允许用户把 provider 挂到缺少 `env_key` 的 runtime section

当仅更新 `note` / `tags` / `apiKey` 时：

- 原有 `envKey` 保持
- `doctor` 仍负责识别与 runtime `env_key` 的不一致

### 7.4 `switch`

`switch` 输入仍然是 provider name，而不是 profile。

`0.0.7` 起行为固定为：

- 更新 active profile
- 重写 `auth.json`

不再保留的主线语义：

- `runCodexLogin`
- “切换后再走外部 login 才算完成”

`--no-login` 处理建议：

- 设计层不再把它当作有效主线契约
- 可在实现中保留为 deprecated parse 兼容项，但不得再影响核心行为

切换成功的最小定义：

- `config.toml` 顶层 active profile 已更新
- `auth.json` 已镜像当前 provider 的 `auth_mode + envKey/apiKey`

### 7.5 `show` / `list`

这两个命令继续展示 provider registry，但输出应新增：

- `envKey`

输出约束：

- 默认文本输出继续掩码 `apiKey`
- `envKey` 不需要掩码
- 如有 `baseUrl`，继续作为 registry 元数据展示

### 7.6 `config show`

`config show` 继续展示：

- active profile
- managed profile / runtime baseUrl

`0.0.7` 起新增展示：

- runtime `envKey`
- 如能解析 provider link，可展示 managed provider `envKey` 与 runtime `env_key` 是否一致

### 7.7 `doctor`

`doctor` 需要新增三类诊断面：

- provider profile 是否存在且可解析 runtime section
- runtime `env_key` 是否存在
- `auth.json` 当前镜像是否与 active provider 一致

新增 issue 类型至少包括：

- `MODEL_PROVIDER_ENV_KEY_MISSING`
- `PROVIDER_ENV_KEY_MISMATCH`
- `AUTH_JSON_INVALID`
- `AUTH_JSON_ENV_KEY_MISMATCH`
- `AUTH_JSON_APIKEY_MISMATCH`
- `ACTIVE_PROVIDER_UNRESOLVED`

设计要求：

- `doctor` 可以识别旧 `config.toml api_key`、旧 `providers.json` 无 `envKey`、旧 `auth.json api_key` 结构
- 但这些旧状态以“发现问题并报告”为目标，而不是继续被当作健康运行态

### 7.8 `status`

`status` 继续做轻量摘要，但要补充当前 auth mirror 概况：

- 当前 active profile
- 当前 active provider 是否可唯一判定
- runtime `env_key` 是否可解析
- `auth.json` 是否看起来与当前 active provider 一致

约束：

- `status` 只输出摘要，不展开完整 doctor 级问题列表

## 8. 错误语义

`0.0.7` 需要明确几类新失败语义：

- runtime profile 存在，但缺少 `model_provider` 或对应 `model_providers.<name>`
- runtime `model_providers.<name>` 缺少 `env_key`
- provider registry 中缺少 `envKey`
- 当前 active profile 无法唯一映射到 provider
- `auth.json` 无法解析或存在冲突 managed secret

建议新增或收敛的错误码语义：

- `MODEL_PROVIDER_ENV_KEY_MISSING`
- `PROVIDER_ENV_KEY_REQUIRED`
- `ACTIVE_PROVIDER_UNRESOLVED`
- `AUTH_JSON_INVALID`
- `AUTH_JSON_SYNC_FAILED`

错误处理要求：

- 非交互 `setup` 在缺 secret 或无法唯一判定 active provider 时必须失败
- `switch` 在 config 写入或 auth mirror 写入任一失败时必须整体失败并回滚
- `doctor` 不因历史旧状态崩溃，而应结构化产出问题列表

## 9. 模块设计与代码落点

### 9.1 `src/domain/providers.ts`

本模块需要收口到 `0.0.7` 的正式 provider schema：

- `ProviderRecord` 增加 `envKey: string`
- validation / normalization 强制校验 `envKey`
- 旧 provider 数据缺失 `envKey` 时，应在读取或 doctor 路径上被识别为异常状态

### 9.2 `src/domain/config.ts`

本模块需要完成以下调整：

- `ModelProviderSectionRef` 改为正式解析 `env_key`
- 删除 `api_key` 相关字段的正式读取模型
- `ManagedProfileView` 增加 `envKey`
- `ConfigConsistencyIssue` 增加 env key / auth mirror 相关 issue code

### 9.3 `src/storage/config-repo.ts`

storage 层要把 `env_key` 视为正式前置条件：

- `requireModelProviderRuntimeSection`
- `requireManagedProfileRuntime`

这些 helper 在 `0.0.7` 中应明确要求：

- `base_url` 存在
- `env_key` 存在

### 9.4 `src/storage/auth-repo.ts`

建议新增或等价落点能力模块，职责锁定为：

- `readAuthFileIfExists`
- `writeAuthFile`
- `buildManagedAuthJson`
- `extractManagedAuthFingerprint`

原因：

- `auth.json` 写入是本地文件镜像操作
- 它属于 storage concern，而不是 runtime CLI 调用

### 9.5 `src/app/setup-codex.ts`

需要调整：

- `providerDetailsByProfile` shape 增加 `envKey`
- adopt 校验改为依赖 `env_key`
- setup 成功后同步 `auth.json`
- 当 active profile 对应多个 provider 时，走显式选择或失败语义

### 9.6 `src/app/switch-provider.ts`

需要调整：

- 删除 `runCodexLogin` 主路径
- 切换改为 `config.toml + auth.json` 双写事务
- 失败时回滚两个文件

### 9.7 `src/app/run-doctor.ts`

需要新增：

- auth mirror 检查
- provider `envKey` 与 runtime `env_key` 的一致性检查
- 当前 active provider 是否可唯一判定的检查

### 9.8 `src/commands/handlers.ts`

命令处理层需要收口：

- `setup` adopt 数据从 config 读取 `envKey`
- `add` / `edit` 不再围绕 `config api_key default` 设计
- `switch` 不再向核心 use case 传递 `noLogin`

### 9.9 `src/interaction/interactive.ts`

交互层需要调整：

- `collectSetupProviderDetails` 改成只补 `providerName`、`apiKey`、`baseUrl?`、`note`、`tags`
- prompt hint 中可显示 runtime `envKey`
- 共享 profile 场景下增加 active provider 选择能力

### 9.10 `src/cli/output.ts`

输出层需要调整：

- `show` / `list` / `switch` 输出增加 `envKey`
- 删除 `loginPerformed` 之类的切换结果表达
- `status` / `config show` 增加 auth mirror 摘要和 runtime `envKey`

### 9.11 `src/runtime/codex-cli.ts`

运行时集成层需要收口：

- `runCodexLogin` 不再是 `switch` 主路径依赖
- 仍可保留 runtime probe / version check 能力

## 10. 关键流程时序

### 10.1 `setup`

建议时序：

```text
setup
  -> choose codex dir
  -> parse config.toml
  -> find adoptable profiles with base_url + env_key
  -> collect providerName/apiKey/note/tags
  -> write providers.json
  -> resolve current active provider
  -> write auth.json mirror
  -> run doctor
```

关键点：

- adopt 只依赖 runtime `base_url + env_key`
- 不再从 config 读取 `api_key`
- 当前 active provider 无法唯一定位时，不允许静默挑一个

### 10.2 `add` / `edit`

建议时序：

```text
add/edit
  -> read providers.json
  -> resolve target profile
  -> parse config.toml runtime section
  -> require env_key
  -> derive envKey from runtime
  -> write providers.json
  -> if current active provider affected and needs sync, update auth.json
```

关键点：

- `profile` 变更时必须重新解析 `envKey`
- 只改 `apiKey` 且目标是当前 active provider 时，应同步 auth mirror

### 10.3 `switch`

建议时序：

```text
switch <provider>
  -> read providers.json
  -> resolve provider by name
  -> validate profile + runtime env_key
  -> backup config.toml + auth.json
  -> update top-level profile in config.toml
  -> rewrite auth.json with auth_mode + envKey/apiKey
  -> success
  -> on failure rollback both files
```

关键点：

- `switch` 不再调用 `codex login`
- 成功标准是 config-auth 双写完成
- 任一文件写失败都必须触发事务级回滚

### 10.4 `doctor`

建议时序：

```text
doctor
  -> read providers.json
  -> parse config.toml
  -> read auth.json
  -> resolve active profile
  -> resolve active provider if possible
  -> compare providers/config/auth consistency
  -> emit issue list
```

关键点：

- `doctor` 同时检查 providers、config、auth 三方状态
- 对旧结构做识别，不把旧结构误报为健康状态

## 11. fixture 与测试设计

### 11.1 fixture 迁移

`dev-codex/local-sandbox` 需要整体迁移到 `0.0.7` 模型：

- `config.toml` 改用 `env_key`
- `providers.json` 增加 `envKey`
- `auth.json` 改成 `auth_mode + <envKey>`

目标是让主开发 fixture 能健康通过：

- `config show`
- `list`
- `current`
- `doctor`

### 11.2 测试重写范围

测试层至少要覆盖以下变更：

- `tests/workflows.spec.js`
- `tests/interaction.spec.js`
- `tests/commands.spec.js`
- 现有 domain / app 相关 spec

具体关注点：

- fixture 不再含 `config.toml api_key`
- setup 回归从“继承 config api_key 默认值”改成“从 config 读取 `env_key` 并补问 `apiKey`”
- switch 回归从“login rollback”改成“auth mirror rollback”

### 11.3 Domain 测试

至少新增或重写：

- provider schema 强制 `envKey`
- config parser 解析 `env_key`，不再依赖 `api_key`
- doctor issue code 覆盖 env key / auth mirror 不一致

### 11.4 Application 测试

至少新增或重写：

- `setup` adopt 合法 `env_key` profile
- `add` / `edit` 从 runtime 派生 `envKey`
- `switch` 写入 `auth.json` 并在失败时回滚
- 当前 active provider 受影响时，`edit apiKey` 后同步 auth mirror

### 11.5 CLI / interaction 测试

至少新增或重写：

- `setup` 仅补问 `apiKey`
- `collectSetupProviderDetails` / `collectEditInput` 的字段与默认值逻辑
- `show` / `list` / `switch` 输出新增 `envKey`
- 非交互 `setup` 在缺 secret 或无法唯一判定 active provider 时失败

### 11.6 共享 profile 场景测试

必须显式覆盖：

- 共享 profile 下 `switch <provider>` 仍可唯一写出对应 `auth.json`
- 仅凭 active profile 无法唯一反推 provider 时，`setup` 同步当前 auth 必须交互补问或非交互失败

## 12. 迁移与过渡态识别

`0.0.7` 的目标是纠偏，不是对历史错误模型继续背书。

因此本版明确采用“识别并报告”的过渡策略，而不是“无限兼容”策略。

### 12.1 需要识别的旧状态

当前 repo 内与用户本地运行态都可能存在：

- `config.toml` 仍含 `api_key`
- `providers.json` 缺 `envKey`
- `auth.json` 仍是旧 `api_key` 结构
- 旧 fixture、旧测试仍围绕 login 语义断言

### 12.2 识别策略

`doctor` / `status` 需要能识别并报告：

- runtime 仍依赖 `api_key`
- provider record 缺 `envKey`
- `auth.json` 仍是旧 managed `api_key` 结构
- active profile 无法唯一映射到 provider
- runtime 缺 `env_key`

### 12.3 非兼容边界

`0.0.7` 不要求：

- 旧 `config.toml api_key` 状态继续被当作健康写路径
- 旧 `providers.json` 无 `envKey` 状态继续被静默补全后成功运行
- 旧 `auth.json api_key` 状态继续被视为正确镜像

换句话说：

- 允许发现
- 允许诊断
- 不承诺继续以旧模型成功完成所有写操作

## 13. 验收标准

`0.0.7` 完成时，至少满足以下验收条件：

- `providers.json` 新增 provider 时必须持久化 `envKey`
- `add` / `edit` / `setup` 都从 runtime `env_key` 派生 `envKey`
- `switch` 成功后，`config.toml` active profile 与 `auth.json` 镜像同时更新
- `switch` 任一阶段失败时，`config.toml` 与 `auth.json` 均可回滚
- `doctor` 能识别 `MODEL_PROVIDER_ENV_KEY_MISSING`
- `doctor` 能识别 `PROVIDER_ENV_KEY_MISMATCH`
- `doctor` 能识别 `AUTH_JSON_INVALID`
- `doctor` 能识别 `AUTH_JSON_ENV_KEY_MISMATCH`
- `doctor` 能识别 `AUTH_JSON_APIKEY_MISMATCH`
- `doctor` 能识别 `ACTIVE_PROVIDER_UNRESOLVED`
- `show` / `list` / `config show` / `status` 能输出 `envKey` 或其摘要
- 新 fixture 健康通过主读命令验证

建议固定的验收式场景：

- `env_key = OPENAI_API_KEY`
- `env_key = PACKYCODE_API_KEY`
- active profile 映射单 provider
- active profile 映射多 provider
- `auth.json` 旧结构存在 `api_key`
- runtime 缺 `env_key`

## 14. Deferred

以下内容明确延后，不进入 `0.0.7`：

- 多 auth mode 管理
- `requires_openai_auth` 等其他认证模型
- 远端 secret store 或系统 keychain
- 自动迁移历史旧状态的一键修复器
- 以 provider 为维度缓存多个 inactive auth mirror

## 15. 结论

`0.0.7` 不是一次“再加几个命令”的版本，而是一次配置语义纠偏版本。

它的核心成果应当是：

- `providers.json` 成为 provider secret 与 `envKey` 的管理态事实源
- `config.toml` 回到 runtime route 与 `env_key` 的职责边界
- `auth.json` 成为当前 active provider 的单一受管认证镜像
- `setup`、`add`、`edit`、`switch`、`doctor` 围绕这一模型形成稳定且可回滚的实现

只有先把这条主线收口，后续 `0.1.0` 的稳定契约、第三方 auth 扩展和 runtime integration 边界才有可靠基础。
