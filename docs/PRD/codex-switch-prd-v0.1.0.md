# codex-switch `0.1.0` Release Gate PRD

## 文档信息

- 状态：Release Gate
- 产品名：`codex-switch`
- CLI 命令名：`codexs`
- 当前稳定基线：`0.0.12`
- 目标版本：`0.1.0`
- 文档定位：定义 `codex-switch` 第一次稳定发布前必须满足的门槛
- 关联 beta PRD：[`./codex-switch-prd-v0.0.12.md`](./codex-switch-prd-v0.0.12.md)
- 关联实现约束设计：[`../Design/codex-switch-v0.1.0-design.md`](../Design/codex-switch-v0.1.0-design.md)
- 关联长期演进稿：[`./codex-switch-prd-v0.0.5-to-v0.1.0.md`](./codex-switch-prd-v0.0.5-to-v0.1.0.md)

## 1. 定位

`0.1.0` 是 `codex-switch` 的第一条稳定发布线，不是继续扩 feature surface 的版本，也不是把 `0.0.12` 再包装一次。

这个版本的判断标准只有一个：当前仓库已经足够稳定，能把命令面、输出契约、主工作流、诊断语义和文档事实对外固定下来，并且不需要再依赖开发期解释来“补全理解”。

## 2. 当前阻塞项

以下问题仍然阻止 `0.1.0` 成为真正可发布的稳定版本：

1. `tests/` 被忽略，导致测试无法被版本化和审阅。
2. README 里仍有失效的 `docs/Tests/testing.md` 链接，用户会直接遇到死链。
3. 版本叙事仍停留在 `0.0.12`，对外材料没有把 `0.1.0` 讲成稳定发布线。
4. 发布故事和实现状态还没有完全对齐，尤其是主工作流、`migrate` 定位和 `setup` 定位。

这些阻塞项必须先被收口，`0.1.0` 才能成立。

## 3. `0.1.0` 的稳定合同

`0.1.0` 必须把以下内容视为稳定合同，不再当作可随意重写的草案。

### 3.1 命令面

稳定命令面包括：

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

其中：

- `migrate` 只能是高级 adopt helper。
- `setup` 只能是 deprecated entry。

### 3.2 `--json` envelope

`--json` 的顶层 envelope 必须保持不变：

```json
{
  "ok": true,
  "command": "list",
  "data": {},
  "warnings": [],
  "error": null
}
```

约束如下：

- 顶层字段名不变。
- 顶层字段顺序和 shape 不变。
- 新信息只能继续追加到 `data`、`warnings` 或 `error.details`。

### 3.3 dual-path model

`0.1.0` 必须把以下分层固定为正式合同：

- tool home：
  - `codex-switch.json`
  - `providers.json`
  - `backups/`
  - `runtime/`
  - `runtimes/`
- target Codex runtime：
  - `config.toml`
  - `auth.json`

含义必须稳定：

- `providers.json` 是管理态 SSOT。
- `config.toml` 是受管 runtime routing 文件。
- `auth.json` 是受管 auth projection 文件。

### 3.4 主工作流

Direct provider 主路径：

```bash
codexs init
codexs add <provider> --profile <name> --api-key <key>
codexs switch <provider>
codexs status
codexs doctor
```

Copilot provider 主路径：

```bash
codexs init
codexs login copilot
codexs add <provider> --copilot --profile <name>
codexs switch <provider>
codexs status
codexs doctor
```

`migrate` 的定位必须明确为：

- 面向已有 runtime state 的高级 adopt helper。
- 不应与 fresh install 主路径混淆。
- 不应被写成所有新用户都应先执行的默认步骤。

## 4. Release Gate

只有以下条件全部满足，才允许发布 `0.1.0`。

### 4.1 工作流

- fresh tool home 下 direct provider 主路径可稳定走通。
- fresh tool home 下 Copilot 主路径可稳定走通。
- `switch` 的成功语义仍然等于 config 和 auth projection 都正确。
- `rollback` 对受管写操作仍然可信。

### 4.2 输出与语义

- `--json` 读命令输出稳定。
- 非交互模式不会意外触发 prompt。
- 错误码和 issue code 对常见失败场景足够稳定。
- `status` 与 `doctor` 能清楚说明下一步修复动作。
- `list`、`status`、`doctor` 的人类可读输出和交互提示一致。

### 4.3 文档

- README、README.CN、README.AI、CLI usage、product overview、PRD、design 和 changelog 与实际行为一致。
- `docs/Tests/testing.md` 不能继续停留在忽略状态，测试回归必须落仓库并可版本化。
- 主路径在所有面向用户的文档中必须一致。
- `0.1.0` 的定位必须压过旧的 `0.0.12` 叙事。

### 4.4 包内容

- `npm pack --dry-run` 结果合理。
- tarball 中包含正确的 README、LICENSE、docs、dist。
- `codexs --help`、`codexs --version`、安装指引与 npm 包元数据一致。

### 4.5 结构

- 不再保留明显误导性的历史目录语义。
- 稳定模块的边界说明足够清楚。
- 新问题不再需要反复回到超大入口文件修补。

## 5. 可执行验证清单

`0.1.0` 的发布前验证必须至少覆盖以下项目：

```bash
npm run build
npm test
npx tsc --noEmit
npm pack --dry-run
node dist/cli.js --help
node dist/cli.js --version
```

同时必须做以下行为验证：

- fresh direct provider flow。
- fresh Copilot provider flow。
- `list/status/doctor` 语义检查。
- `--json` 输出检查。
- `migrate` 作为高级 adopt helper 的检查。
- `setup` 作为 deprecated entry 的检查。

## 6. 明确不在范围内

`0.1.0` 不要求完成以下内容：

- 新 upstream。
- GUI / TUI。
- daemon。
- plugin system。
- auto migration。
- 兼容层。
- dual-read / dual-write。
- `migrate` 的完整非交互产品化。
- 旧状态的自动升级保留逻辑。

## 7. 若 Gate 未通过

如果任何阻塞项仍然存在，就不要强行发布 `0.1.0`。

此时应继续发布 beta 或 rc 版本，而不是为了版本号好看提前进入稳定线。

## 8. 结论

`0.1.0` 的本质不是“功能更多”，而是“承诺更稳”。当命令面、输出契约、主工作流、诊断语义、包内容和文档事实完全一致时，这个版本号才成立。
