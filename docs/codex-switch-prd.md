# codex-switch PRD

## 文档信息

- 状态：Draft
- 产品名：`codex-switch`
- CLI 命令名：`codexs`
- 版本范围：MVP / CLI First
- 文档定位：正式 PRD
- 对应研究稿：[`codex-switch-product-research.md`](./codex-switch-product-research.md)
- 对应技术架构：[`codex-switch-technical-architecture.md`](./codex-switch-technical-architecture.md)
- 对应命令设计：[`codex-switch-command-design.md`](./codex-switch-command-design.md)

## 一句话定义

`codex-switch` 是一个本地优先、默认安全、对 AI 友好的 CLI 工具，用于管理和切换本机 Codex 的 provider/profile 配置。

## 背景与目标

当前围绕 Codex 配置切换的现有方案主要有两类问题：

- 方案过轻
  - 单个脚本虽然能完成切换，但不够产品化，不利于全局安装、统一调用和后续扩展
- 方案过重
  - 偏桌面 GUI、偏完整账号系统、偏代理层接管，不适合只想管理本地 provider/profile 的用户

当前仓库中的 [`codex-provider-switch/README.md`](./codex-provider-switch/README.md) 已验证最小可行路径：

- 读取 `~/.codex/config.toml`
- 读取 `~/.codex/providers.json`
- 切换顶层 `profile`
- 通过 `codex login --with-api-key` 更新当前 API key
- 失败时回滚配置

`codex-switch` 的目标不是替代完整账号管理器，也不是第一阶段就做桌面应用，而是把这条最小路径产品化为一个可安装、可维护、可自动化调用的 CLI。

本 PRD 的目标是为实现阶段直接提供决策完整的规格，避免把关键接口、数据模型和失败语义留到编码阶段再讨论。

## 产品目标

MVP 需要同时满足以下目标：

- 用户可以通过统一 CLI 管理本地 provider/profile 配置
- AI 代理可以稳定调用固定命令完成查看、切换、导入、导出和诊断
- 所有修改 `~/.codex` 的动作都具备备份与失败回滚能力
- 核心能力在离线情况下可用，除 `codex login --with-api-key` 外不依赖远程服务

## 非目标

以下内容明确不进入 MVP：

- GUI / Desktop App
- 常驻后台服务
- 代理转发层
- 复杂账号系统
- 自动智能路由
- 远程同步
- 必须联网才能工作的核心主流程

## 目标用户

### 1. 个人多 provider 用户

这类用户在本机维护多个 API key、多个 profile 或多个上游服务，希望快速切换，不想手动编辑配置文件。

### 2. AI 代理操作者

这类用户希望让 AI 通过稳定命令直接执行查看、切换、导入和诊断，而不需要理解脚本实现细节。

### 3. 安全敏感用户

这类用户要求所有配置修改先备份，失败时自动回滚，并且敏感值不在终端输出中泄露。

## 典型场景

### 场景 1：首次导入 provider 清单

用户已经准备好一份 `providers.json`，希望通过命令导入到 `~/.codex` 下，并在导入前自动备份已有文件。

### 场景 2：日常切换 provider

用户需要在 `packycode` 和 `freemodel` 等 provider 之间切换，并希望自动完成 profile 切换和登录更新。

### 场景 3：切换失败后自动恢复

用户切换时遇到 `codex login` 失败，工具应自动回滚受影响文件，并明确提示恢复结果。

### 场景 4：AI 诊断本地状态

AI 需要通过 `status` 或 `doctor --json` 判断本地配置是否完整、当前 profile 是否可映射、切换是否具备前置条件。

## 核心原则

### CLI First

所有核心能力都必须通过命令完成，不依赖图形界面。

### AI Friendly

关键命令必须提供稳定、可解析的 `--json` 输出。

### Local First

MVP 的核心对象是本地文件与本机配置，不依赖云端控制面。

### Safe by Default

所有写操作都必须优先备份，并在失败时提供自动回滚。

## MVP 范围

MVP 只覆盖以下五类能力：

- provider/profile 管理
- provider 切换
- 备份与回滚
- 导入导出
- 状态诊断

## 文件与数据契约

### 目标目录

默认工作目录：

```text
~/.codex/
  config.toml
  auth.json
  providers.json
  backups/
```

工具默认操作 `~/.codex`，也允许通过 `--codex-dir <path>` 指向其他目录。

### `config.toml`

- 是 Codex 的主配置文件
- `codex-switch` 的 MVP 只要求读取与更新顶层 `profile`
- 工具不负责创建新的 `[profiles.<name>]`

### `providers.json`

- 是 `codex-switch` 的主数据文件
- 用于定义 provider 到 profile 和 key 的映射
- MVP 的导入、导出、增删改查均围绕该文件进行

### `auth.json`

- 不是 MVP 的主建模对象
- 如果文件存在，在 `switch` 过程中应被纳入备份与回滚范围

### `backups/`

- 用于保存切换前或写入前的备份文件
- 备份路径应在成功输出或错误提示中可见

## `providers.json` 数据模型

MVP 固定使用以下结构：

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

### 字段定义

- `profile`
  - 必填
  - 对应 `config.toml` 中已经存在的 profile 名
- `apiKey`
  - 必填
  - 用于执行 `codex login --with-api-key`
- `baseUrl`
  - 选填
  - v1 允许存储，但不要求回写到 `config.toml`
- `note`
  - 选填
  - 面向人类和 AI 的说明字段
- `tags`
  - 选填
  - 字符串数组，为未来筛选和推荐预留

### 安全约束

- MVP 允许明文保存 `apiKey`
- 文档中必须明确 `providers.json` 是本地机密文件
- CLI 默认不得打印完整 `apiKey`

## 公共 CLI 接口

### 全局参数

所有支持的命令共享以下参数：

- `--json`
  - 输出稳定 JSON
- `--codex-dir <path>`
  - 指定工作目录，替代默认 `~/.codex`

### 命令清单

MVP 固定包含以下命令：

- `codexs list`
- `codexs current`
- `codexs switch <provider>`
- `codexs status`
- `codexs import <file>`
- `codexs export <file>`
- `codexs add <provider>`
- `codexs remove <provider>`
- `codexs doctor`
- `codexs rollback`

## 功能规格

### `codexs list`

用途：

- 列出 `providers.json` 中已配置的 provider

输入：

- 无必填位置参数

行为：

- 读取 `providers.json`
- 列出 provider 名称及其 `profile`
- 可附带展示 `note` 与 `tags`

成功输出：

- 人类模式：表格或列表
- JSON 模式：返回 provider 列表

失败行为：

- `providers.json` 不存在时报错
- JSON 解析失败时报错

### `codexs current`

用途：

- 读取当前生效的顶层 `profile`

行为：

- 读取 `config.toml`
- 返回当前顶层 `profile`

失败行为：

- `config.toml` 不存在时报错
- 无法解析时返回错误

### `codexs switch <provider>`

用途：

- 切换到指定 provider

参数：

- 位置参数：`<provider>`
- 可选参数：`--no-login`

前置校验：

- `providers.json` 存在且可解析
- 指定 provider 存在
- provider 对应 `profile` 在 `config.toml` 中存在

执行顺序：

1. 读取并校验输入文件
2. 备份 `config.toml`
3. 如果 `auth.json` 存在，一并备份
4. 更新 `config.toml` 顶层 `profile`
5. 默认执行 `codex login --with-api-key`
6. 如果任一步失败，回滚已修改文件

成功输出：

- 当前 provider
- 当前 profile
- 是否执行登录
- 备份路径

失败行为：

- provider 不存在时不修改任何文件
- profile 不存在时不修改任何文件
- `codex login` 失败时必须自动回滚
- 回滚成功与否必须显式提示

### `codexs status`

用途：

- 汇总当前状态，帮助用户和 AI 快速判断系统是否可切换

输出至少包含：

- 当前 profile
- `config.toml` 是否存在
- `providers.json` 是否存在
- 当前 profile 是否能映射到 provider

职责边界：

- `status` 只做状态概览，不做深度诊断建议

### `codexs import <file>`

用途：

- 从外部 JSON 文件导入 provider 配置

行为：

- 读取目标文件
- 校验顶层结构和必填字段
- 备份现有 `providers.json`
- 以“整体替换”方式写入新的 `providers.json`

失败行为：

- 非法 JSON 拒绝写入
- 缺少必填字段拒绝写入
- 写入失败时恢复旧文件

说明：

- MVP 不做 merge 导入，固定为整体替换

### `codexs export <file>`

用途：

- 导出当前 `providers.json`

行为：

- 将当前配置写出到指定文件

规则：

- 默认不覆盖已有文件
- 只有传入 `--force` 时才允许覆盖

### `codexs add <provider>`

用途：

- 新增一个 provider 记录

参数：

- 位置参数：`<provider>`
- 必填参数：`--profile <name>`、`--api-key <key>`
- 选填参数：`--base-url <url>`、`--note <text>`、`--tag <tag>` 可重复

行为：

- 读取现有 `providers.json`
- 校验 provider 名未重复
- 备份旧文件
- 追加新记录并写回

范围限制：

- MVP 只支持显式参数模式
- 不提供交互式 wizard

### `codexs remove <provider>`

用途：

- 删除一个 provider 记录

参数：

- 位置参数：`<provider>`
- 可选参数：`--force`

行为：

- 校验 provider 存在
- 默认安全模式，不在非显式确认下直接删除
- 备份旧 `providers.json`
- 删除目标记录并写回

范围限制：

- 自动化调用场景下，要求显式传 `--force`

### `codexs doctor`

用途：

- 做基础诊断并返回可操作的问题列表

诊断项至少包含：

- `config.toml` 是否存在
- `providers.json` 是否存在
- `providers.json` 是否可解析
- provider 对应 `profile` 是否存在
- `codex` CLI 是否可执行

职责边界：

- `doctor` 面向问题检测与诊断
- 相比 `status`，它应返回更明确的问题项

### `codexs rollback`

用途：

- 从最近一次备份恢复受影响配置

行为：

- 查找最近一次可用备份
- 恢复 `config.toml`
- 如果对应备份存在 `auth.json`，一并恢复

说明：

- `rollback` 进入 MVP，因为它直接支撑“默认安全”的产品承诺

## 输出契约

### 默认输出

- 面向人类可读
- 简洁、稳定
- 不输出无关噪音
- 不打印完整敏感值

### JSON 输出结构

所有支持 `--json` 的关键命令使用统一结构：

```json
{
  "ok": true,
  "command": "switch",
  "data": {
    "provider": "packycode",
    "profile": "packycode",
    "backupPath": "C:\\Users\\name\\.codex\\backups\\config-20260511-120000.toml"
  },
  "warnings": [],
  "error": null
}
```

字段定义：

- `ok`
  - 是否成功
- `command`
  - 当前命令名
- `data`
  - 命令输出主体
- `warnings`
  - 非致命警告数组
- `error`
  - 失败时返回对象，成功时为 `null`

## 错误处理与错误码

所有关键失败路径都要返回固定错误码，便于 AI 稳定判断。

MVP 固定错误码：

- `CONFIG_NOT_FOUND`
- `PROVIDERS_NOT_FOUND`
- `PROVIDERS_PARSE_ERROR`
- `PROVIDER_NOT_FOUND`
- `PROFILE_NOT_FOUND`
- `BACKUP_FAILED`
- `CODEX_LOGIN_FAILED`
- `ROLLBACK_FAILED`
- `INVALID_IMPORT_FILE`

错误处理原则：

- 文件不存在时给出明确路径
- JSON / TOML 解析失败时给出明确文件名
- provider 不存在时列出可选 provider
- profile 不存在时明确指出目标 profile 缺失
- `codex login` 失败时保留失败原因
- 自动回滚成功时必须明确提示
- 自动回滚失败时必须单独返回 `ROLLBACK_FAILED`

## 安全要求

### 敏感信息处理

- 不在默认输出中打印完整 `apiKey`
- 导出日志和报错信息中必须避免泄露完整密钥
- `providers.json` 应在文档中被标注为本地机密文件

### 文件写入安全

- 所有写操作先备份
- 所有路径操作应尽量显式
- 默认只操作用户指定或默认的 `~/.codex`

## 安装与发布

### 技术路线

- Node.js
- TypeScript

### 分发方式

- 主路径：npm 全局安装
- 辅助路径：`npx`

### 技术选择结论

当前阶段优先 TypeScript / Node.js，原因不是性能，而是：

- npm 分发成熟
- CLI 生态成熟
- 开发与迭代速度更快
- 更适合 AI 调用与后续能力扩展

Rust / Zig 不排除未来使用，但不属于 MVP 的必要条件。

## 兼容性要求

- 支持 Windows、macOS、Linux
- 路径处理需兼容不同平台
- 不依赖 GUI 环境
- 不要求目标机器具备额外桌面运行时

## 成功标准

满足以下条件即可视为 MVP 达成：

- 用户可以全局安装 `codex-switch`
- 用户可以通过 `codexs list` 查看本地 provider
- 用户可以通过 `codexs current` 查看当前 profile
- 用户可以通过 `codexs switch <provider>` 成功切换
- 切换失败时会自动回滚
- 用户可以导入和导出 `providers.json`
- `doctor` 能发现常见配置问题
- AI 可以稳定调用关键命令并解析 `--json` 输出

## 验收测试场景

### 安装与入口

- npm 全局安装后可直接执行 `codexs`
- `npx` 可执行基础只读命令

### 读取与列出

- `list` 在正常配置下返回完整 provider 列表
- `list` 在 `providers.json` 缺失时返回 `PROVIDERS_NOT_FOUND`
- `list` 在 JSON 损坏时返回 `PROVIDERS_PARSE_ERROR`
- `current` 在正常配置下返回顶层 `profile`

### 切换与回滚

- `switch` 成功时更新顶层 `profile` 并完成登录
- provider 不存在时返回 `PROVIDER_NOT_FOUND` 且不改文件
- profile 不存在时返回 `PROFILE_NOT_FOUND` 且不改文件
- `codex login` 失败时返回 `CODEX_LOGIN_FAILED` 并恢复备份
- 回滚失败时返回 `ROLLBACK_FAILED`

### 导入导出

- 导入合法文件时成功替换当前 `providers.json`
- 导入非法 JSON 时返回 `INVALID_IMPORT_FILE`
- 缺少必填字段时返回 `INVALID_IMPORT_FILE`
- 导出默认不覆盖已有文件
- 传入 `--force` 后允许覆盖

### 诊断

- `status` 返回当前 profile、文件存在性和映射状态
- `doctor` 能识别文件缺失、JSON 解析失败、profile 缺失和 `codex` CLI 缺失

### AI 调用稳定性

- `list`、`current`、`status`、`switch`、`doctor` 支持 `--json`
- 所有 JSON 输出字段结构一致
- 所有关键错误返回固定错误码

## 延后事项

以下内容不进入本次 PRD 的实现范围，但可以作为后续版本候选：

- provider 推荐
- 自动切换策略
- 使用情况统计
- 多设备同步
- GUI 版本
- 单文件原生二进制分发

## 当前结论

`codex-switch` 的正式产品定义应收敛为：

> 一个 CLI-first、本地优先、默认安全、对 AI 友好的 Codex provider/profile 切换工具。

它的 MVP 不追求完整账号体系，也不追求桌面化体验，而是优先把命令接口、配置安全、备份回滚和自动化调用能力做稳。
