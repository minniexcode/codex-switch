# codex-switch `0.0.12` 设计文档

## 文档信息

- 文档类型：实现约束设计文档
- 适用版本：`0.0.12`
- 目标范围：`0.0.11 -> 0.0.12`
- 版本角色：beta / internal-test / release-hardening
- 对应 PRD：[`../PRD/codex-switch-prd-v0.0.12.md`](../PRD/codex-switch-prd-v0.0.12.md)
- 关联发布门槛：[`../PRD/codex-switch-prd-v0.1.0.md`](../PRD/codex-switch-prd-v0.1.0.md)
- 关联上一版设计：[`./codex-switch-v0.0.11-design.md`](./codex-switch-v0.0.11-design.md)
- 关联路线图：[`./codex-switch-v0.0.9-to-v0.0.12-roadmap.md`](./codex-switch-v0.0.9-to-v0.0.12-roadmap.md)

## 1. 文档目标

本设计文档不是泛泛而谈的产品说明，而是 `0.0.12` 的实现前约束文档。实现者必须把它视为本版变更边界的唯一直接规格来源之一，并按本文固定：

- 哪些文件必须改
- 每个文件改什么、改到什么程度
- 哪些内部清理允许做，但不强制
- 哪些内容本版明确不碰

`0.0.12` 的目标不是展开 `0.1.0` 之后的平台化设想，也不是继续追加新的顶级能力，而是把已经可用的 `0.0.11` 收束成一个适合内测验证的 beta 版本：主工作流清晰、help 一致、输出语义一致、测试与发布检查可执行、历史长期文档不再冒充当前事实源。

## 2. 版本定位

`0.0.12` 固定为 `beta / internal-test / release-hardening` 版本，不是新增顶级命令版本，不是新 upstream 版本，也不是继续扩展 feature surface 的版本。

本版只解决以下问题：

- 主工作流是否已经足够清楚，可以作为内测用户的默认使用路径
- README、CLI help、CLI usage、产品概览、测试说明、changelog、版本号是否讲的是同一套事实
- `init`、`login copilot`、`status`、`doctor` 的人类可读输出是否已经体现 tool-home-first 与 dual-path model
- `migrate` 与 `setup` 是否已经被放回正确产品位置

本版不解决以下问题：

- 新命令族
- 新 upstream
- 平台化抽象
- 自动迁移兼容层
- 历史大文档全文重写

## 3. 设计原则

`0.0.12` 必须遵循以下原则：

1. 主工作流优先于高级 adopt 流程。
2. 文档、help、输出、测试必须讲同一套事实。
3. `migrate` 保留，但产品权重下调为 advanced adopt helper。
4. `setup` 保留，但只保留 deprecation contract，不再作为主入口。
5. 不改 `--json` 顶层 envelope：`ok / command / data / warnings / error`。
6. 不为开发版本引入自动迁移、双读双写或旧布局兼容层。
7. `0.0.12` 的优先级是发布面收口，而不是继续扩实现自由度。
8. 若 `src/cli/output.ts` 已能表达目标语义，则不为了“更漂亮的数据结构”去改公开 JSON contract。

## 4. 变更矩阵

下表定义 `0.0.12` 的必改落点。未出现在“必须修改内容”中的扩展实现，不属于本版默认范围。

| 文件 | 当前问题 | 必须修改内容 | 修改边界 | 类型 |
| --- | --- | --- | --- | --- |
| `README.md` | Quick Start 仍容易让 `migrate` 与 fresh install 混淆，版本线与文档入口未完全对齐 `0.0.12` | `Current version` 改为 `0.0.12`；Quick Start 顺序改为 `init -> add -> switch -> status -> doctor`；补 Copilot 主路径 `init -> login copilot -> add --copilot -> switch -> status -> doctor`；将 `migrate` 改写为已有运行态时使用的 adopt helper；文档链接切到 `0.0.12` PRD/design | 不重写全文，只收口主入口、版本、链接与命令定位 | 必改文档 |
| `README.CN.md` | 中文版仍可能把 adopt 路径和主路径混写，版本与弃用表述可能漂移 | 调整示例顺序；明确 direct 主路径与 adopt 路径；收口 `setup` 的弃用表述；更新版本号、文档链接、最近版本更新中的 `0.0.12` 条目 | 不做风格性全文重写，重点修正文案事实 | 必改文档 |
| `README.AI.md` | 仍可能把 `migrate` 置于主入口附近，对 agent 的稳定操作摘要不够收束 | 将 Main Command Surface 改为 direct / Copilot 主路径优先；更新 `Notes For Agents` 推荐顺序；`Current Version Context` 改为 `0.0.12`；明确 `login copilot` 的真实实现是 SDK + official CLI invocation + auth recheck | 保持“给 agent 的摘要”定位，不展开成人类长文档 | 必改文档 |
| `docs/cli-usage.md` | 更像命令字典，主工作流不够靠前，命令契约与真实实现表述需收口 | 版本改为 `0.0.12`；在总览前部新增 direct 与 Copilot 两个固定工作流小节；将 `migrate` 改为 `Advanced Adopt`；将 `setup` 放入 deprecated-only section；收口 `init` / `login copilot` / `status` / `doctor` 契约 | 仍是 usage/contract 文档，不扩成新的架构设计稿 | 必改文档 |
| `docs/codex-switch-product-overview.md` | 仍残留旧 `~/.codex/providers.json` / `backups/` 单目录叙事 | 将产品工作方式改为 dual-path model；主流程改为 direct 主路径 / Copilot 主路径 / `migrate` adopt helper；去掉 `providers.json` 和 `backups/` 位于 `~/.codex` 的叙述；明确这是本地 provider 管理器，而不是旧 setup 工具 | 只纠正活跃产品叙述，不扩成长篇 roadmap | 必改文档 |
| `docs/Tests/testing.md` | 更像一般测试说明，尚未收口为 beta release checklist | `Version under test` 改为 `0.0.12`；新增 direct 主路径 / Copilot 主路径 / help / version / pack 检查项；说明 `migrate` 与 `login copilot` 的真实测试限制；保留 suite 说明但更新名称与职责 | 重点是发布前检查，而不是历史测试报告汇编 | 必改文档 |
| `CHANGELOG.md` | 缺少 `0.0.12` 发布记录或定位不够准确 | 新增 `0.0.12` 条目，包含标题日期、发布定位、`Changed` / `Docs` / `Verification`，并说明这是 beta hardening release，不是 feature expansion release | 只追加版本记录，不改历史条目语义 | 必改文档 |
| `package.json` | 版本号需与 `0.0.12` 版本线一致 | 仅修改 `version` 为 `0.0.12` | 不改 `files`、`engines`、`bin`、包名、发布访问级别 | 必改元数据 |
| `src/commands/help.ts` | 顶层帮助示例仍未完全体现主工作流优先级 | 顶层 examples 改为 direct 主路径优先；`migrate` 不再作为前三个示例之一；顶层说明加入 `primary workflows / advanced adopt` 语义；保留 `setup` 但不放进主入口示例 | 不新增命令，不重做 help renderer | 必改代码 |
| `src/commands/registry.ts` | 多个命令的 summary/details/examples 未收口到 `0.0.12` 叙事 | 更新 `init`、`login`、`migrate`、`setup`、`add`、`switch`、`status`、`doctor` 的 `summary/details/examples`；其中 `migrate` 明确 adopt helper，`setup` 明确 deprecation-only，`login` 明确 SDK install + official Copilot CLI invocation + recheck，`status` / `doctor` 明确 dual-path 诊断语义 | 只改文案契约，不改 command id、flags 或命令名 | 必改代码 |
| `src/cli/output.ts` | 人类可读输出仍带有旧 `codexDir` 中心语义，`login` 缺少清晰成功摘要 | `init` 输出改为 tool home 语义；`status` 改为 `tool home / target runtime / active provider / runtime health / next step` 结构；`doctor` 改为健康结论 + 面向修复的 issue 输出；补 `login` 简洁成功摘要；仅改 human-readable 渲染 | 不改顶层 JSON envelope；优先复用现有 `data` 字段 | 必改代码 |
| `src/app/list-providers.ts` | 当前 `list` 只返回 `name/profile/note/tags`，无法表达 current provider 和 provider type | 将 `list` 扩展为只读地结合当前 runtime 状态，补充每个 provider 的 `providerType`、`isActive`，并补充列表级 current-provider 元数据 | 不改变顶层 JSON envelope；保留 `count/providers` 基本结构；只追加字段 | 必改代码 |
| `src/interaction/interactive.ts` | 共享 provider 选择器只显示 provider 名和 profile，无法区分 direct/Copilot，也无法提示 current | 统一 provider 选择器 hint，至少包含 `profile`、`providerType` 和 current 标记；ambiguous 场景不对任何单个 provider 打 current 标记 | 不新增交互步骤；只增强现有选择器可见信息 | 必改代码 |
| `docs/codex-switch-command-design.md` | 长期设计文档仍可能被误读为当前 release contract | 在顶部增加状态说明：这是历史跨版本参考，不是当前 release contract，并指向 `docs/cli-usage.md`、`docs/PRD/codex-switch-prd-v0.0.12.md`、`docs/Design/codex-switch-v0.0.12-design.md` | 只加状态说明与跳转，不全文重写 | 状态说明 |
| `docs/codex-switch-technical-architecture.md` | 长期架构文档仍可能被误读为当前版本规范 | 在顶部增加状态说明：这是历史跨版本参考，不是当前 release contract，并指向 `docs/cli-usage.md`、`docs/PRD/codex-switch-prd-v0.0.12.md`、`docs/Design/codex-switch-v0.0.12-design.md` | 只加状态说明与跳转，不全文重写 | 状态说明 |

## 5. 输出与帮助语义设计

本节固定 `0.0.12` 的目标表达，避免实现时自由发挥。

### 5.1 顶层 help

顶层 help 必须在第一屏就让用户看出两条主路径：

- direct provider 主路径：`init -> add -> switch -> status -> doctor`
- Copilot provider 主路径：`init -> login copilot -> add --copilot -> switch -> status -> doctor`

同时必须让用户看出：

- `migrate` 是 advanced adopt，不是 fresh install 默认第一步
- `setup` 仍保留，但只作为 deprecated entry 被说明

### 5.2 `init`

`init` 的人类可读成功输出不要求逐字一致，但语义必须包括：

- `toolHomeDir`
- `toolConfigPath`
- `providersPath`
- 是否新建或是否已存在
- 下一步推荐

`init` 不应继续以“创建/初始化目标 `codexDir`”作为中心表述。它初始化的是 `codex-switch` 的 tool home 与最小管理态，而不是把 `codexDir` 讲成工具自身的 home。

### 5.3 `list` 与 provider 选择器

`list` 与共享 provider 选择器必须让用户快速回答以下问题：

- 当前有哪些 managed provider
- 每个 provider 属于 `direct` 还是 `copilot`
- 当前 active runtime 唯一映射到哪个 provider
- 若当前 active profile 有歧义，为什么没有 current 标记

`list --json` 必须保持现有顶层 envelope 不变，并维持 `data.count` 与 `data.providers` 两个既有入口。

每个 provider 项必须追加：

- `providerType`
  - 公开值固定为 `direct | copilot`
- `isActive`
  - 仅在当前 active provider 可唯一解析，且该 provider 正是当前项时为 `true`

`list` 的列表级只读元数据必须追加：

- `currentProfile`
- `activeProvider`
- `activeProviderResolvable`
- `activeProviderCandidates`

判定规则固定为：

- `runtime.kind === "copilot-sdk-bridge"` => `providerType = "copilot"`
- 其他 provider => `providerType = "direct"`
- 若当前 active profile 映射到多个 provider，则：
  - `activeProviderResolvable = false`
  - 不允许把任何单个 provider 的 `isActive` 置为 `true`
  - human-readable 输出与交互选择器应单独提示 ambiguous 状态

human-readable `list` 的目标语义不要求逐字一致，但必须同时体现：

- provider 名
- provider 类型
- current 标记
- profile

共享 provider 选择器必须复用同一套 provider 可见性语义，至少在 hint 中展示：

- `profile`
- `providerType`
- `current` 标记，仅在唯一解析时出现

### 5.4 `login copilot`

`login copilot` 的 help 与成功输出必须同时体现真实实现边界：

- upstream：`copilot`
- 是否需要或已完成 SDK 安装
- 是否调用过 official Copilot CLI 登录流程
- 是否通过 auth recheck 确认 ready

外部文案必须明确当前实现是：

- bundled runtime CLI 优先
- PATH fallback
- recheck 成功才算登录成功

### 5.5 `status`

`status` 的人类可读输出不要求逐字一致，但必须能让用户快速回答以下问题：

- 当前 target `codexDir` 是什么
- 当前 tool home root 是什么
- 当前 profile 是什么
- 当前映射 provider 是什么
- 当前是 direct provider 还是 Copilot provider 路径
- runtime health 是否正常
- 是否存在 warning，以及下一步建议是什么

`status` 不应继续只是字段堆砌。它必须是一个面向人类的“当前配置与健康摘要”。

### 5.6 `doctor`

`doctor` 的人类可读输出必须先给整体健康结论，再给逐条 issue，并且 issue 文案面向下一步修复动作，而不是只输出“发现问题”。

目标语义：

- 先给 overall health / summary
- 再列 issue
- 每条 issue 尽量说明影响和建议动作

### 5.7 `migrate` 与 `setup`

`migrate` 的 help 语义必须固定为：

- interactive adopt helper
- 面向已有运行态
- 不是所有新用户的起步命令

`setup` 的 help 语义必须固定为：

- deprecated
- 保留现有 contract
- 不再出现在主路径示例中

## 6. 允许的内部清理

以下内部清理在 `0.0.12` 允许进行，但它们是可选项，不是本版主交付。

### 6.1 `src/commands/dispatch.ts`

允许继续保持“先 resolve tool home，再读 tool config，再 resolve codexDir”的唯一入口模型，也允许做小范围收口以强化这一点。

不允许：

- 把这套解析逻辑重新散回各个 handler
- 借清理之名改变命令交互边界

### 6.2 `src/infra/codex-paths.ts` 与同类 facade

允许继续保留，也允许在不扩散影响的前提下做小范围收拢。

不允许：

- 把这类清理扩成跨仓库重命名工程
- 借机重做整个 infra 分层

### 6.3 `src/commands/handlers.ts`

若实现时需要拆小 helper，可以做。

前提：

- 不改变 command id
- 不改变公开 flags
- 不改变错误码
- 不改变交互边界

### 6.4 仅在输出数据不够时允许补最小数据

以下文件不是默认必改，但 design 必须明确只有在 `src/cli/output.ts` 无法表达目标语义时才允许触碰：

- `src/commands/handlers.ts`
- `src/app/get-status.ts`
- `src/app/run-doctor.ts`

允许修改的前提：

1. 仅当 `output.ts` 依赖的现有 `data` 不足以表达本设计要求。
2. 只允许追加字段，或收紧 message / warning 文案。
3. 不允许改顶层 JSON envelope。
4. 不允许改 issue code / error code 的分类空间。
5. 不允许重做 `doctor` / `status` 的 data shape。

优先级固定为：

1. 先只改 `src/cli/output.ts`
2. 不够再补 app data
3. 绝不为了“更好看”重构公开 JSON

## 7. 测试与发布检查

`0.0.12` 的测试与验证必须写成可执行清单，不能只写“跑一下 test”。

### 7.1 自动化测试修改点

`tests/commands.spec.js` 必须增加或更新：

- 顶层 help 示例顺序
- `migrate` 的降权表述
- `login` help 说明中的 bundled / PATH fallback 语义
- `setup` 仍为 deprecation-only

`tests/cli-e2e.spec.js` 必须增加或更新：

- built CLI `--help` 对主路径的可见性
- `list --json` 返回 `providerType` 与 `isActive`
- human-readable `list` 显示 provider type 与 current 标记
- human-readable `init` 输出不再出现旧 `createdCodexDir` 语义
- human-readable `status` 输出出现 tool home / target runtime
- human-readable `doctor` 输出具有修复导向
- `--version` 等于 `package.json.version`

`tests/workflows.spec.js` 只补行为不回归断言：

- `status.data.storage` 仍稳定
- `doctor.data.issues` code 仍稳定
- current provider ambiguous 时，`list` 不伪造 current 标记
- direct provider / Copilot provider 主路径行为不回归

### 7.2 人工验证与发布检查

发布前必须执行并记录结果：

- `npm run build`
- `npm test`
- `npx tsc --noEmit`
- `npm pack --dry-run`
- built CLI `--help`
- built CLI `--version`
- fresh tool home direct path
- fresh tool home Copilot path
- read commands in `--json`
- write commands in sandbox

### 7.3 测试限制说明

测试文档必须明确：

- `login copilot` 涉及 SDK、official CLI invocation 与 auth recheck，自动化覆盖要区分可模拟部分与真实环境依赖部分
- `migrate` 是高级 adopt helper，其测试重点是定位与边界，不要求把它包装成完整无交互主流程

## 8. 验收标准

`0.0.12` 完成的判断标准必须是用户可感知结果，而不是“改了哪些文件”。

达到以下条件时，本版才算完成：

- README 和 `codexs --help` 第一屏能看出 direct / Copilot 主路径
- `migrate` 不再和 fresh install 主入口混淆
- 不再有活跃文档声称 `providers.json` / `backups/` 位于 `~/.codex`
- `list` 和共享 provider 选择器能看出 provider 属于 direct 还是 Copilot
- 只有当前 active provider 可唯一解析时，当前 provider 才会被标记
- `init` / `status` / `doctor` 的人类输出不再带旧语义
- `package.json`、README、CHANGELOG、PRD、design 的版本线一致
- 历史长期文档被降格为参考资料，不再冒充当前事实源

## 9. 明确不碰

以下边界在 `0.0.12` 必须写死，避免实现越界：

- 不新增顶级命令族
- 不新增 upstream
- 不把 `migrate` 做成完整非交互产品
- 不删除 `migrate`
- 不删除 `setup`
- 不改 `--json` 顶层 envelope：`ok / command / data / warnings / error`
- 不改 command ids、公开 flags、命令名
- 不改 Copilot bridge 运行机制
- 不加自动迁移、双读双写、旧布局兼容层
- 不完整重写历史 PRD、历史 versioned docs、旧 test report
- 不改 `docs/PRD/codex-switch-prd.md` 正文内容，只通过活跃文档绕开它作为最新事实源
