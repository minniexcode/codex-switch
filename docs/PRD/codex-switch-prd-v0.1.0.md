# codex-switch `0.1.0` 目标 PRD

## 文档信息

- 状态：Target PRD
- 产品名：`codex-switch`
- CLI 命令名：`codexs`
- 当前基线版本：`0.0.3`
- 目标版本：`0.1.0`
- 文档定位：从 `0.0.3` 走向 `0.1.0` 的目标规格与阶段性演进路线
- 历史基线 PRD：[`codex-switch-prd.md`](./codex-switch-prd.md)
- 对应研究稿：[`../codex-switch-product-research.md`](../codex-switch-product-research.md)
- 对应技术架构：[`../codex-switch-technical-architecture.md`](../codex-switch-technical-architecture.md)
- 对应命令设计：[`../codex-switch-command-design.md`](../codex-switch-command-design.md)

## 一句话定义

`codex-switch` 的 `0.1.0` 目标，是从一个已经验证可行的本地 provider/profile 管理 CLI，演进为一套对人类和 AI 都稳定、可初始化、可诊断、可恢复、可持续扩展的发布级命令体系。

## 版本语义

- `0.0.x`：测试 / 验证阶段版本，用于收敛模型、命令面和失败语义
- `0.1.0`：第一条稳定发布规格线，不要求当前立刻完成，但要求目标边界清晰
- 当前仓库状态：`0.0.3` 已完成 MVP 核心命令面与交互式增强

这意味着本文件不是“下一版马上发布什么”的短期计划，而是 `0.0.3` 之后持续演进到 `0.1.0` 的目标 PRD。

## 当前基线：`0.0.3`

当前已落地能力：

- `list` / `current` / `status`
- `switch <provider>`
- `import <file>` / `export <file>`
- `add <provider>` / `remove <provider>`
- `doctor`
- `rollback`

当前基线已经具备的工程特征：

- 本地文件模型围绕 `~/.codex/`
- `providers.json` 作为 management SSOT
- `config.toml` 与 `auth.json` 作为 runtime state
- 写命令统一走备份、锁和失败回滚
- `--json` 输出固定 envelope
- 高频写命令支持 TTY 渐进式交互

当前基线仍然存在的边界：

- 缺少首次初始化 / bootstrap 命令
- 只支持 latest rollback，不支持按备份条目恢复
- provider 查看和编辑仍然偏基础
- 错误码体系仍带有 MVP 阶段的复用痕迹
- 尚未进入第三方 auth / extension 集成阶段

## `0.1.0` 目标

`0.1.0` 需要同时满足以下目标：

- 保持当前 CLI 和 JSON 契约稳定
- 让首次用户可以通过 `setup` 完成从环境检测到 registry 初始化的主流程
- 让 provider registry 的查看、编辑、导入合并能力更完整
- 让备份与回滚从“最新一次”演进到“显式备份条目”
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

后续新增命令应逐步引入更精确的错误码，而不是继续把无关问题塞进 `INVALID_IMPORT_FILE`。

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

约束：

- `CODEX_LOGIN_FAILED` 只表示登录失败
- codex 缺失与版本过低必须使用环境类错误码
- rollback 找不到目标备份时必须使用恢复类错误码

## `0.0.4` 功能里程碑

下面这些内容暂时作为 `0.0.4` 的功能里程碑。它们属于从 `0.0.3` 往 `0.1.0` 推进过程中的下一阶段，不代表已经锁定整个 `0.1.0` 的最终范围。

### 1. `codexs setup`

#### 目标

提供首次初始化主流程，让用户从“本机已有 Codex 环境，但还没有 codex-switch 管理态文件”平滑进入受管状态。

#### 目标命令

```bash
codexs setup
```

#### 行为顺序

`setup` 的主流程固定为：

1. 检查本机是否已安装 `codex`
2. 检查 `codex` 是否满足最低支持版本门槛
3. 发现候选 Codex 目录
4. 当存在多个候选目录时，在 TTY 下交给用户选择，也允许自定义输入
5. 读取目标目录下的 `config.toml`
6. 从现有配置中发现 profile 列表
7. 为每个准备纳入管理的 profile 构造 provider 草稿
8. 对无法从现有状态可靠恢复的 `apiKey` 等关键字段，在交互模式下补问
9. 检查目标目录是否已存在 `providers.json`
10. 若已存在，在交互模式下让用户选择 `overwrite`、`merge` 或 `cancel`
11. 写入或合并后的 `providers.json` 继续纳入备份与回滚模型
12. 初始化成功后自动执行 `doctor`
13. 输出当前 Codex 状态和后续建议命令

#### 目录发现原则

- 默认优先使用明确指定的 `--codex-dir`
- 未显式指定时，可以发现多个候选目录
- TTY 下多个候选目录必须选择，不自动猜测
- 非交互下多个候选目录且未显式指定时，返回歧义错误
- 任意时刻都允许用户手动输入自定义目录

#### 凭据初始化原则

因为 `config.toml` 不能可靠恢复所有 provider 的 `apiKey`，所以：

- `setup` 不自动伪造或猜测 API key
- 交互模式下可以补问缺失的 `apiKey`
- 非交互模式下，如果缺失关键字段，应中止写入并返回明确错误
- `0.0.4` 里程碑中不引入“缺 key 的正式 provider 记录”

#### Codex 版本门槛

- `setup` 和 `doctor` 都应支持最低 Codex 版本检查
- 最低版本门槛在 PRD 中定义为“必须存在的可配置门槛”
- 具体版本号不在本文件中写死，由实现常量和发布说明控制

### 2. CLI 契约收紧

在 `0.0.4` 里程碑中，需要把当前命令层从“已经可用”继续收紧到“更稳定可依赖”：

- 将参数错误与业务错误分离
- 将环境问题与登录问题分离
- 保持命令帮助、TTY 行为和 `--json` 行为一致
- 让新增命令默认沿用当前 envelope、锁、备份和回滚模型

### 3. 命令增强候选

下面这些命令方向暂时也归入 `0.0.4` 里程碑候选池，用于指导下一阶段设计和实现优先级；它们仍然不是当前已完成范围。

### `codexs show <provider>`

目标：

- 展示单个 provider 的完整详情
- 既服务人类，也服务 AI 读取结构化 provider 数据

定位：

- 只读命令
- 不进入备份与回滚流程

### `codexs edit <provider>`

目标：

- 修改单个 provider 的字段内容

默认交互模型：

- 显式参数优先
- 允许使用 `--profile`、`--api-key`、`--base-url`、`--note`、`--tag`
- TTY 下只补全缺失项或确认危险写入
- 不以外部编辑器作为默认形态

约束：

- 作为写命令，默认纳入备份、锁和失败回滚

### `codexs backups list`

目标：

- 列出历史备份条目
- 让用户和 AI 能显式选择恢复目标

建议输出字段：

- `backupId`
- `createdAt`
- `reason`
- `files`
- `backupPath`

备份 ID 规则：

- 默认以备份目录 basename 作为稳定 `backupId`
- 例如 `20260511-221457-switch`

### `codexs rollback <backup-id>`

目标：

- 从“只支持 latest rollback”演进到“支持显式备份条目恢复”

约束：

- `rollback` 继续保留 latest 入口
- `rollback <backup-id>` 作为增强能力引入
- 指定备份不存在时必须返回专门错误码，而不是复用 generic rollback failure

### `codexs import --merge`

目标：

- 在不整体替换当前 registry 的前提下导入 provider 清单

默认冲突策略：

- 当导入文件和当前 registry 出现同名 provider 冲突时，以导入文件内容为准
- 未冲突条目继续保留
- 最终结果仍作为一次受管写操作进入备份与回滚流程

## `0.1.0` 远期目标与能力域

下面这些方向明确有价值，但当前不进入 `0.0.4` 里程碑，只作为继续走向 `0.1.0` 的远期能力域。

### 第三方 auth / extension 集成

示例方向：

- 接入 Copilot auth
- 在本地启动代理服务，使特定上游可在 Codex 中使用
- 安装和管理第三方依赖

当前定位：

- 作为单独能力域保留
- 不在当前主 PRD 中锁定具体命令名和具体交互细节
- 不进入 `0.1.0` 稳定主线的验收标准

### 交互式依赖安装

未来如果引入：

- 应采用交互式多选模式
- 类似 skills 安装体验
- 支持一次选择多个可选依赖

但当前阶段仅记录方向，不进入正式规格。

## 主题里程碑

从 `0.0.3` 走向 `0.1.0`，建议按能力主题推进，而不是现在就预写死每个小版本号。

### 里程碑 A：`0.0.4` / Bootstrap / Setup

目标：

- 完成 `setup` 规格与实现
- 把首次初始化从“手工准备文件”提升到“命令引导完成”
- 补齐 codex 安装和版本检查语义

详细设计文档：

- [`../codex-switch-v0.0.4-design.md`](../codex-switch-v0.0.4-design.md)

### 里程碑 B：Provider Registry Ergonomics

目标：

- 增强 provider 的查看与编辑能力
- 保持 `providers.json` 作为管理态事实源
- 不默认把 runtime 文件反向回写到 registry

### 里程碑 C：Backup / Recovery Evolution

目标：

- 引入 `backups list`
- 引入按 `backupId` 回滚
- 为 `import --merge` 提供完整恢复语义

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

## `0.1.0` 目标完成标准

达到下面这些条件时，可以认为 `0.1.0` 主线目标基本收敛：

- 用户可以通过 `setup` 完成首次初始化
- provider registry 的查看、编辑、导入合并能力完整
- 历史备份可被显式枚举和恢复
- CLI 错误码不再存在明显语义复用问题
- 主 CLI 契约对 AI 和脚本调用保持稳定

## 结论

`0.1.0` 不是简单地把现有 MVP 重命名为稳定版，而是要在保持当前本地事务式切换模型不变的前提下，补齐初始化能力、增强 registry 操作、收紧错误契约，并为未来更大范围的 auth / extension 集成留出清晰边界。
