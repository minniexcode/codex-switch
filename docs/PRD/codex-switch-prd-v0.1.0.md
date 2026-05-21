# codex-switch `0.1.0` Release Gate PRD

## 文档信息

- 状态：Release Gate Draft
- 产品名：`codex-switch`
- CLI 命令名：`codexs`
- 当前预发布基线：`0.0.12` beta
- 目标版本：`0.1.0`
- 文档定位：定义 `codex-switch` 何时可以从 `0.0.x` 进入第一个正式稳定发布版本
- 关联 beta PRD：[`./codex-switch-prd-v0.0.12.md`](./codex-switch-prd-v0.0.12.md)
- 关联长期演进稿：[`./codex-switch-prd-v0.0.5-to-v0.1.0.md`](./codex-switch-prd-v0.0.5-to-v0.1.0.md)

## 一句话定义

`0.1.0` 不是“功能再多一点”的版本，而是 `codex-switch` 第一条可正式对外承诺的稳定产品线：命令入口稳定、输出契约稳定、主工作流清晰、恢复与诊断可信、文档与包内容一致。

## 发布语义

一旦进入 `0.1.0`，这个版本就不再只是“作者自己知道怎么用”的工具，而需要满足：

- 新用户看 README 与 help 就能走通主路径
- 自动化调用方可以信赖 `--json` 的稳定契约
- direct provider 和 Copilot provider 都有明确、可解释、可恢复的工作流
- 文档、包内容、help、测试和实际行为是同一套事实

`0.1.0` 不是自动升级目标。只有当 release gate 满足时，才允许发布。

## `0.1.0` 必须稳定的内容

### 1. CLI 命令面

以下命令面在 `0.1.0` 时视为稳定：

- `init`
- `login`
- `list`
- `show`
- `current`
- `status`
- `doctor`
- `config show`
- `config list-profiles`
- `add`
- `edit`
- `switch`
- `remove`
- `import`
- `export`
- `bridge start`
- `bridge status`
- `bridge stop`
- `backups list`
- `rollback`

说明：

- `setup` 可以继续保留为 deprecated entry
- `migrate` 可以继续保留，但其“高级 adopt 工具”定位必须明确

### 2. JSON Envelope

`--json` 顶层 envelope 在 `0.1.0` 前必须冻结为：

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

- 顶层字段不改名
- 顶层 shape 不重排
- 新信息只允许追加到 `data`、`warnings` 或 `error.details`

### 3. 双路径模型

`0.1.0` 前必须把以下边界视为正式产品 contract：

- tool home：
  - `codex-switch.json`
  - `providers.json`
  - `backups/`
  - `runtime/`
  - `runtimes/`
- target Codex runtime：
  - `config.toml`
  - `auth.json`

其中：

- `providers.json` 是管理态 SSOT
- `config.toml` 是受管 runtime routing 文件
- `auth.json` 是受管 auth projection 文件

### 4. 主工作流

#### Direct Provider

正式推荐路径必须清晰稳定：

```bash
codexs init
codexs add <provider> --profile <name> --api-key <key>
codexs switch <provider>
codexs status
codexs doctor
```

#### Copilot Provider

正式推荐路径必须清晰稳定：

```bash
codexs init
codexs login copilot
codexs add <provider> --copilot --profile <name>
codexs switch <provider>
codexs status
codexs doctor
```

#### `migrate`

`migrate` 在 `0.1.0` 可以保留，但必须满足：

- 产品定位明确为高级 adopt helper
- 不与 fresh install 主路径混淆
- 文档不把它写成所有用户都应先执行的默认第一步

## Release Gate

只有以下条件全部满足，才允许发布 `0.1.0`：

### A. 工作流可信

- direct provider 主路径可在 fresh tool home 下稳定走通
- Copilot 主路径可在 fresh tool home 下稳定走通
- `switch` 成功语义仍然等于 config + auth 投影都正确
- `rollback` 对受管写操作仍然可信

### B. 输出可信

- `--json` 读命令输出稳定
- 非交互模式不会意外 prompt
- 错误码和 issue code 对常见失败场景足够稳定
- `status` 与 `doctor` 输出能解释下一步修复动作

### C. 文档可信

- README、README.CN、README.AI、CLI usage、product overview、PRD、changelog 与实际行为一致
- 不再残留旧 `~/.codex/providers.json` / `backups/` 叙述
- 主路径在所有面向用户的文档中一致

### D. 包内容可信

- `npm pack --dry-run` 结果合理
- tarball 中包含正确的 README、LICENSE、docs、dist
- `codexs --help`、`codexs --version`、安装指引与 npm 包元数据一致

### E. 结构可信

- 不再保留明显误导性的历史目录语义
- 关键稳定模块有足够 JSDoc 和边界说明
- 新问题不再需要反复回到超大入口文件做修补

## 明确不要求 `0.1.0` 完成的内容

以下内容不是 `0.1.0` 的发布前置条件：

- 新 upstream
- GUI / TUI
- daemon / background supervisor
- plugin system
- 多账号平台
- 自动迁移旧状态
- `migrate` 的完整非交互产品化
- 通用 `config.toml` 编辑器

## 若 Release Gate 未通过

如果以下任一问题仍明显存在，则不应强行发布 `0.1.0`：

- 文档和行为仍有明显漂移
- `migrate` 与主路径仍然混淆
- Copilot 路径仍需要过多背景知识才能理解
- 回滚与诊断场景仍存在不稳定或不可解释行为
- 包内容、安装体验或帮助页仍像开发中工具

此时应继续发布：

- `0.0.13`
- `0.0.14`
- 其他后续 beta / rc 版本

而不是为了版本号好看提前进入 `0.1.0`。

## 结论

`0.1.0` 的意义，不在于“项目终于到 1.0 之前先过一个数字门槛”，而在于 `codex-switch` 首次具备了可以向外明确承诺的稳定产品边界。只有当工作流、输出、恢复、文档和包发布面都同时稳定时，这个版本号才成立。
