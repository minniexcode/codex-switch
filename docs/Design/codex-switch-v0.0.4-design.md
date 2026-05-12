# codex-switch `0.0.4` 设计文档

## 文档信息

- 文档类型：详细设计文档
- 适用版本：`0.0.4` 功能里程碑
- 对应目标 PRD：[`PRD/codex-switch-prd-v0.1.0.md`](./PRD/codex-switch-prd-v0.1.0.md)
- 历史基线 PRD：[`PRD/codex-switch-prd.md`](./PRD/codex-switch-prd.md)
- 当前架构基线：[`codex-switch-technical-architecture.md`](./codex-switch-technical-architecture.md)
- 当前命令基线：[`codex-switch-command-design.md`](./codex-switch-command-design.md)

## 1. 文档目标

这份文档回答的不是“未来想做什么”，而是 `0.0.4` 这批功能应该如何落地：

- 功能为什么进入 `0.0.4`
- 每个功能的职责边界是什么
- 命令行为、交互方式、失败语义如何定义
- 现有架构上应该怎样扩展
- 代码层面需要新增哪些模块
- 哪些内容明确不在 `0.0.4` 范围内

目标是让后续实现阶段不需要再补关键设计决策。

## 2. 背景与设计原则

### 2.1 当前基线

当前 `0.0.3` 已经具备：

- provider 基础管理：`list`、`add`、`remove`
- provider 切换：`switch`
- 文件导入导出：`import`、`export`
- 状态与诊断：`status`、`doctor`
- 安全恢复：`rollback`
- TTY 渐进式交互
- 统一 JSON envelope
- 写操作锁、备份、回滚模型

### 2.2 `0.0.4` 进入的原因

当前主要短板不是“能不能切换”，而是下面几类使用门槛：

- 首次使用需要人工准备 `providers.json`
- 缺少查看单个 provider 的命令
- 缺少修改单个 provider 的命令
- 只支持 latest rollback，不支持历史备份选择
- `import` 只有整体替换，没有 merge 模式
- 一部分错误码仍沿用 MVP 时代的宽泛复用

### 2.3 设计原则

`0.0.4` 必须继续沿用现有设计原则：

- `CLI First`
- `Local First`
- `Safe by Default`
- `AI Friendly`
- `Split State Model`
- `Lightweight Transactions`

在此基础上增加三条演进原则：

- 不破坏现有 JSON envelope
- 不复用语义不匹配的错误码
- 所有写命令默认纳入备份与回滚模型

## 3. 范围与边界

### 3.1 `0.0.4` 范围内

本版本详细设计覆盖以下功能：

- `codexs setup`
- `codexs show <provider>`
- `codexs edit <provider>`
- `codexs backups list`
- `codexs rollback <backup-id>`
- `codexs import --merge`
- CLI 错误码与参数错误语义收紧

### 3.2 明确不在 `0.0.4` 范围内

下面这些内容不进入本设计：

- Copilot auth 接入
- 本地代理服务
- 第三方依赖动态安装
- GUI / MCP / daemon
- 远程同步或云端控制面
- 放宽 `providers.json` 为半初始化 provider 模型

### 3.3 数据边界

`0.0.4` 仍然坚持当前状态模型：

- `providers.json`：管理态单一事实源
- `config.toml`：运行态配置
- `auth.json`：运行态认证文件
- `backups/` + `latest.json`：回滚态

不引入数据库，不引入新的长期状态仓库。

## 4. 功能总览

### 4.1 `setup`

目标：

- 完成首次初始化
- 从已有 Codex 目录引导生成或更新 `providers.json`
- 初始化结束后立刻用 `doctor` 验证状态

### 4.2 `show`

目标：

- 查看单个 provider 的完整详情
- 为人类和 AI 提供单条记录读取能力

### 4.3 `edit`

目标：

- 原位修改单个 provider
- 保留当前文件模型和备份模型

### 4.4 `backups list`

目标：

- 把历史备份从“仅 latest 隐式存在”提升为“可枚举资源”

### 4.5 `rollback <backup-id>`

目标：

- 从 latest rollback 扩展为显式历史恢复

### 4.6 `import --merge`

目标：

- 在不完全替换 registry 的情况下导入 provider 清单

## 5. 用户与调用模型

### 5.1 人类用户

人类模式优先使用：

- 清晰帮助信息
- 渐进式 TTY 交互
- 危险写入确认
- 明确的恢复路径

### 5.2 AI / 自动化调用

AI 模式优先使用：

- `--json`
- 显式参数
- 稳定 envelope
- 稳定错误码

约束：

- `--json` 下不允许进入交互
- 非 TTY 环境不依赖 prompt 完成核心流程

## 6. 公共接口与契约

### 6.1 JSON Envelope 保持不变

继续使用：

```json
{
  "ok": true,
  "command": "command-name",
  "data": {},
  "warnings": [],
  "error": null
}
```

规则：

- 顶层字段不改名
- 顶层字段不增删重排为语义信号
- 扩展字段统一进入 `data`
- 软提示进入 `warnings`
- 错误细节进入 `error.details`

### 6.2 `providers.json` 保持完整 provider 模型

当前 `0.0.4` 仍要求 managed provider 至少具备：

- `profile`
- `apiKey`

允许补充：

- `baseUrl`
- `note`
- `tags`

不允许：

- 写入缺少 `apiKey` 的正式 provider
- 在 `setup` 中默认创建半成品记录

### 6.3 备份 ID 契约

`0.0.4` 引入显式 `backupId` 概念。

规则：

- `backupId` 等于备份目录 basename
- 示例：`20260511-221457-switch`
- `backups list` 返回该 ID
- `rollback <backup-id>` 使用该 ID 定位 manifest

## 7. 命令详细设计

### 7.1 `codexs setup`

#### 用途

初始化 codex-switch 的受管状态。

#### 命令形态

```bash
codexs setup [--json] [--codex-dir <path>] [--merge|--overwrite]
```

说明：

- `--codex-dir` 显式指定目标目录
- `--merge` 和 `--overwrite` 只用于非交互模式显式决定已有 `providers.json` 的处理策略
- 默认不增加更多参数，避免首次引入就过重

#### 主流程

1. 确认 `codex` CLI 是否可执行
2. 确认 `codex` 版本是否满足最低门槛
3. 确定目标 Codex 目录
4. 读取目标 `config.toml`
5. 解析 profile 列表和当前 active profile
6. 基于 profile 列表构造初始化候选
7. 为缺失 `apiKey` 的候选项补问必填字段
8. 检测 `providers.json` 是否已存在
9. 执行 `overwrite`、`merge` 或 `cancel`
10. 通过统一 mutation 流程写入 `providers.json`
11. 自动执行 `doctor`
12. 输出 setup 结果和 doctor 结果摘要

#### 目录发现策略

优先级：

1. `--codex-dir` 显式指定
2. 默认目录 `~/.codex`
3. 未来可扩展的候选目录发现器返回的其他目录

交互行为：

- 单候选目录：直接继续
- 多候选目录：TTY 下选择或手动输入
- 非交互且多候选目录：失败并返回 `CODEX_DIR_AMBIGUOUS`

#### 输入补问策略

`setup` 不从运行态猜测 API key。

TTY 下：

- 可为每个要纳入管理的 profile 补问 `providerName`
- 可补问 `apiKey`
- 可选补问 `baseUrl`、`note`、`tags`

非交互下：

- 若无法构造完整 provider，直接失败
- 不写入部分完成的 registry

#### 已存在 `providers.json` 时的策略

TTY 下：

- 显示检测结果
- 提供 `overwrite`、`merge`、`cancel`

非交互下：

- 只有显式 `--merge` 或 `--overwrite` 才继续
- 否则返回 `PROVIDERS_ALREADY_EXISTS`

#### 成功输出

人类模式：

- 目标目录
- 初始化了多少 providers
- 采用了哪种写入策略
- 是否执行了 doctor
- doctor 是否发现问题

JSON 模式建议字段：

- `codexDir`
- `strategy`
- `providersInitialized`
- `providerNames`
- `doctor`

#### 失败错误码

- `CODEX_NOT_INSTALLED`
- `CODEX_VERSION_UNSUPPORTED`
- `CODEX_DIR_NOT_FOUND`
- `CODEX_DIR_AMBIGUOUS`
- `CONFIG_NOT_FOUND`
- `PROFILE_NOT_FOUND`
- `PROVIDERS_ALREADY_EXISTS`
- `PROMPT_CANCELLED`
- `BACKUP_FAILED`
- `ROLLBACK_FAILED`

#### 边界

- 不负责自动登录 provider
- 不负责从远程拉取任何配置
- 不负责创建复杂 profile 结构
- 不负责引入第三方 auth

### 7.2 `codexs show <provider>`

#### 用途

展示单个 provider 的完整记录。

#### 命令形态

```bash
codexs show <provider> [--json] [--codex-dir <path>]
```

#### 行为

- 读取 `providers.json`
- 查找目标 provider
- 返回完整字段
- 默认对敏感值做安全展示

#### 输出策略

人类模式：

- 展示 `profile`、`baseUrl`、`note`、`tags`
- `apiKey` 默认只显示掩码摘要

JSON 模式：

- `data.provider` 返回完整结构
- `apiKey` 是否完整返回由当前安全策略决定；`0.0.4` 建议默认返回完整值给显式本地自动化调用，不在普通文本模式泄露

#### 失败错误码

- `PROVIDERS_NOT_FOUND`
- `PROVIDERS_PARSE_ERROR`
- `PROVIDER_NOT_FOUND`

#### 边界

- 不做模糊搜索
- 不支持按 tag 查询

### 7.3 `codexs edit <provider>`

#### 用途

修改单个 provider 记录。

#### 命令形态

```bash
codexs edit <provider> [--profile <name>] [--api-key <key>] [--base-url <url>] [--note <text>] [--tag <tag> ...] [--json] [--codex-dir <path>]
```

#### 设计取舍

默认采用“显式参数优先 + TTY 补齐”的方式，而不是外部编辑器。

原因：

- 参数契约更适合自动化
- 行为更容易测试
- 不引入平台级编辑器差异
- 保持和 `add` 的交互模型一致

#### 行为

- 读取现有 provider
- 将传入字段覆盖到原记录
- 未传入的字段保持原值
- TTY 下如果没有传任何可编辑字段，可进入字段选择式补问
- 最终写回 `providers.json`

#### tag 语义

`0.0.4` 建议先采用简单规则：

- 传入 `--tag` 时，用提供的 tag 列表整体替换原 tags
- 未传 `--tag` 时保留原 tags

不在 `0.0.4` 引入复杂的 `--add-tag` / `--remove-tag`

#### 成功输出

- `provider`
- `backupPath`
- `updatedFields`

#### 失败错误码

- `PROVIDERS_NOT_FOUND`
- `PROVIDERS_PARSE_ERROR`
- `PROVIDER_NOT_FOUND`
- `INVALID_ARGUMENT`
- `BACKUP_FAILED`
- `ROLLBACK_FAILED`

#### 边界

- 不支持重命名 provider key
- 不支持编辑多个 provider
- 不引入字段级 patch 语法

### 7.4 `codexs backups list`

#### 用途

列出历史备份条目。

#### 命令形态

```bash
codexs backups list [--json] [--codex-dir <path>]
```

#### 行为

- 扫描 `backups/` 目录
- 忽略 `latest.json`
- 读取每个备份目录下的 `manifest.json`
- 按 `createdAt` 倒序输出

#### JSON 字段

- `backups`
  - `backupId`
  - `createdAt`
  - `reason`
  - `files`
  - `backupPath`
- `count`

#### 失败错误码

- `BACKUP_NOT_FOUND`
- `PROVIDERS_PARSE_ERROR`

说明：

- `BACKUP_NOT_FOUND` 在这里表示备份目录不存在或为空
- 若 manifest 结构损坏，可新增专门解析错误，`0.0.4` 先允许复用更具体的新错误码实现

#### 边界

- 不做分页
- 不做模糊过滤
- 不展示文件 diff

### 7.5 `codexs rollback <backup-id>`

#### 用途

恢复指定历史备份。

#### 命令形态

```bash
codexs rollback [<backup-id>] [--json] [--codex-dir <path>]
```

说明：

- 不带参数时保持 current latest rollback 语义
- 带 `backup-id` 时按显式条目恢复

#### 行为

- 当未传 `backup-id`：沿用 `latest.json`
- 当传 `backup-id`：加载 `backups/<backup-id>/manifest.json`
- 恢复 manifest 中列出的所有文件
- 成功后返回 restored 文件清单

#### 交互

TTY 下：

- latest rollback 保持当前确认方式
- 指定 `backup-id` 时，也先展示目标备份摘要并确认

非交互下：

- 不做确认

#### 失败错误码

- `BACKUP_NOT_FOUND`
- `ROLLBACK_FAILED`

#### 边界

- 不支持部分文件回滚
- 不在 `0.0.4` 做“预览 diff 后再恢复”

### 7.6 `codexs import --merge`

#### 用途

将外部 provider 文件并入当前 registry。

#### 命令形态

```bash
codexs import <file> [--merge] [--json] [--codex-dir <path>]
```

#### 行为

- 未带 `--merge`：保持现有整体替换语义
- 带 `--merge`：
  - 读取外部文件
  - 读取当前 `providers.json`
  - 合并两边 providers
  - 同名冲突时以导入文件为准
  - 写回最终 registry

#### 成功输出

- `mode`
- `backupPath`
- `importedCount`
- `mergedCount`
- `replacedProviders`

#### 失败错误码

- `INVALID_IMPORT_FILE`
- `PROVIDERS_NOT_FOUND`
- `PROVIDERS_PARSE_ERROR`
- `BACKUP_FAILED`
- `ROLLBACK_FAILED`

#### 边界

- 不做交互式冲突逐条选择
- 不支持三方 merge

## 8. 错误码设计

### 8.1 问题背景

当前实现里，`INVALID_IMPORT_FILE` 被复用到了多个不相干场景，例如：

- 参数缺失
- 未知命令
- 用户取消某些流程

这会降低 AI 和脚本的判断质量。

### 8.2 `0.0.4` 新错误码

建议新增：

- `INVALID_ARGUMENT`
- `UNKNOWN_COMMAND`
- `PROMPT_CANCELLED`
- `CODEX_NOT_INSTALLED`
- `CODEX_VERSION_UNSUPPORTED`
- `CODEX_DIR_NOT_FOUND`
- `CODEX_DIR_AMBIGUOUS`
- `PROVIDERS_ALREADY_EXISTS`
- `BACKUP_NOT_FOUND`

### 8.3 归类原则

- 参数问题：`INVALID_ARGUMENT`
- 命令分发问题：`UNKNOWN_COMMAND`
- 用户主动取消：`PROMPT_CANCELLED`
- 环境缺失 / 版本问题：`CODEX_*`
- 备份定位失败：`BACKUP_NOT_FOUND`
- 登录失败：`CODEX_LOGIN_FAILED`

## 9. 架构与模块设计

### 9.1 保持现有四层结构

继续沿用：

- CLI 层
- Application 层
- Domain 层
- Infrastructure 层

不在 `0.0.4` 引入新层次。

### 9.2 建议新增模块

#### CLI 层

建议新增：

- `src/cli/setup-interactive.ts`
  - 负责 setup 的交互收集和已有 registry 处理策略选择
- `src/cli/backups-interactive.ts`
  - 负责 rollback 目标摘要确认

建议扩展：

- `src/cli/help.ts`
- `src/cli/output.ts`
- `src/cli/args.ts`

#### Application 层

建议新增：

- `src/app/setup-codex.ts`
- `src/app/show-provider.ts`
- `src/app/edit-provider.ts`
- `src/app/list-backups.ts`
- `src/app/rollback-backup.ts`

建议扩展：

- `src/app/import-providers.ts`
- `src/app/run-doctor.ts`
- `src/app/types.ts`

#### Domain 层

建议新增：

- `src/domain/setup.ts`
  - setup 过程中的数据模型和校验
- `src/domain/backups.ts`
  - backup list / backup id 相关纯逻辑

建议扩展：

- `src/domain/errors.ts`
- `src/domain/providers.ts`
- `src/domain/backup.ts`

#### Infrastructure 层

建议新增：

- `src/infra/codex-discovery.ts`
  - 负责候选 Codex 目录发现

建议扩展：

- `src/infra/codex-cli.ts`
  - 增加版本读取与版本门槛比较
- `src/infra/backup-repo.ts`
  - 增加列举指定备份、读取指定 manifest
- `src/infra/providers-repo.ts`
  - 增加单 provider 读取与 merge 写入辅助

### 9.3 依赖方向

保持当前依赖方向不变：

- `cli -> app`
- `app -> domain + infra`
- `infra -> domain`
- `domain -> none`

### 9.4 setup 时序

```text
argv
  -> parseArgs
  -> executeCommand("setup")
  -> app/setup-codex
  -> infra/codex-cli.checkAvailable + readVersion
  -> infra/codex-discovery.findCandidates
  -> cli/setup-interactive (TTY only)
  -> infra/config-repo read config.toml
  -> domain/setup build provider drafts
  -> app/run-mutation
  -> infra/providers-repo write providers.json
  -> app/run-doctor
  -> output
```

### 9.5 rollback with backup-id 时序

```text
argv
  -> parseArgs
  -> executeCommand("rollback")
  -> app/rollback-backup
  -> infra/backup-repo.loadManifestById or loadLatestManifest
  -> cli confirmation (TTY only)
  -> infra/backup-repo.restoreManifest
  -> output
```

## 10. 技术实现细节

### 10.1 参数解析

`args.ts` 需要支持：

- 子命令 `backups list`
- `rollback` 的可选位置参数 `<backup-id>`
- `import --merge`
- `setup --merge`
- `setup --overwrite`

建议：

- 保持当前轻量 parser，不引入 commander 等外部解析库
- 在 parser 结果里把 `backups list` 归一为单一 command key，例如 `backups-list`

### 10.2 Codex 版本检查

`infra/codex-cli.ts` 需要新增：

- `readCodexVersion(): { ok: true; version: string } | { ok: false; cause: string }`
- `checkCodexVersion(minVersion: string): { ok: boolean; currentVersion?: string; cause?: string }`

建议：

- 通过 `codex --version` 获取原始文本
- 在 domain 层做轻量版本字符串解析
- 最低版本门槛作为常量维护

### 10.3 目录发现

`codex-discovery.ts` 的职责：

- 接收显式 `--codex-dir`
- 发现默认目录
- 未来可扩展更多候选目录策略

`0.0.4` 建议最小实现：

- 当前先支持默认目录 + 显式目录
- 保留接口为返回候选列表，避免以后重写调用链

### 10.4 provider merge

`import --merge` 合并算法：

- 读取当前 registry
- 读取导入 registry
- 浅层按 provider name 合并
- 冲突时导入侧覆盖本地
- 使用 deterministic key ordering 写回

### 10.5 show 的敏感字段输出

文本模式：

- `apiKey` 只显示掩码，例如前 3 后 2

JSON 模式：

- 明确标注这是本地机器可读输出
- 默认允许返回完整 `apiKey`

### 10.6 edit 的字段更新

建议先使用“完整对象重写”而不是字段级 patch 存储。

原因：

- 当前 `providers.json` 结构小
- 现有 repo 已有整体读写能力
- 更容易复用现有 backup/mutation 模型

### 10.7 backup 枚举

`backup-repo.ts` 需要：

- 枚举 `backups/` 下所有目录
- 过滤非目录项和 `latest.json`
- 尝试读取每个 `manifest.json`
- 若某一条 manifest 损坏，建议该条以 warning 形式跳过，而不是让整个 `backups list` 失败

## 11. 测试设计

### 11.1 CLI 测试

需要覆盖：

- `setup` 在非交互缺参数或多目录冲突时的失败 envelope
- `show` 成功和 provider 不存在
- `edit` 显式字段更新
- `backups list` 返回排序结果
- `rollback <backup-id>` 成功与目标不存在
- `import --merge` 冲突覆盖语义

### 11.2 Application 测试

需要覆盖：

- setup draft 生成与已有 registry 策略
- edit 更新字段集合计算
- merge 导入结果
- 指定 manifest 回滚

### 11.3 Domain 测试

需要覆盖：

- 版本比较
- backupId 解析
- provider merge 纯逻辑
- `apiKey` 掩码逻辑

### 11.4 Fixture 设计

建议新增 fixture：

- 多 profile config
- 已存在 providers 的 setup 场景
- 多个历史备份目录
- 损坏 manifest 场景

## 12. 验收标准

`0.0.4` 设计落地后，至少应满足：

- 用户可以通过 `setup` 完成首次初始化
- `show` 能查看单个 provider
- `edit` 能稳定更新单个 provider
- `backups list` 能列出历史备份
- `rollback <backup-id>` 能恢复指定备份
- `import --merge` 能按导入侧覆盖策略写回
- 新增错误码足以覆盖参数、环境、取消、备份定位等核心场景
- 所有新增写命令继续沿用锁、备份、回滚模型

## 13. 后续演进接口

这份设计刻意为后续能力留了接口，但不在 `0.0.4` 落地：

- 更复杂的目录发现策略
- 更复杂的 tag patch 语法
- 交互式 import 冲突逐条选择
- 第三方 auth provider 接入
- 本地代理和依赖安装

## 14. 结论

`0.0.4` 的本质不是再堆几个命令，而是把 codex-switch 从“已经能用的切换工具”推进到“具备初始化、精细查看编辑、历史恢复、结构化错误语义”的下一阶段。技术上不需要推翻当前四层结构，只需要围绕现有 parser、mutation orchestration、backup repo 和 provider repo 做有边界的增量扩展。
