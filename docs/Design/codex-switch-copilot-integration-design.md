# codex-switch Copilot 接入设计文档

## 文档信息

- 文档类型：专项详细设计文档
- 主题：GitHub Copilot runtime-backed provider integration
- 适用范围：`0.0.8` 引入后的历史欠账收口与当前实现补齐
- 目标：把 Copilot 接入补成“首次接入可完成、切换可运行、诊断可解释、文档与代码一致”
- 关联 PRD：
  - [`../PRD/codex-switch-prd-v0.0.8.md`](../PRD/codex-switch-prd-v0.0.8.md)
  - [`../PRD/codex-switch-prd-v0.0.10.md`](../PRD/codex-switch-prd-v0.0.10.md)
- 关联历史设计：
  - [`./codex-switch-v0.0.8-design.md`](./codex-switch-v0.0.8-design.md)
  - [`./codex-switch-v0.0.9-design.md`](./codex-switch-v0.0.9-design.md)

## 1. 文档目标

本设计只回答 Copilot 接入这条线上的关键实现问题，并以“实现者无需再补关键决策”为目标，重点收口以下内容：

- `add --copilot` 到底要收集哪些输入，哪些字段必须与 direct provider 分开
- 缺失 SDK 时，何时安装、谁负责安装、安装失败如何报错
- 缺失 Copilot 登录态时，CLI 是只报错，还是要做交互式引导
- `switch` 进入 Copilot provider 时，哪些 gate 必须先通过，哪些文件才允许落盘
- `providers.json`、`config.toml`、`auth.json`、runtime state 各自负责什么，不负责什么
- `status` / `doctor` 对 Copilot 的诊断边界是什么
- 测试必须覆盖哪些首次接入和运行态回归场景

本设计不扩展成“通用插件系统设计”或“多 runtime family 设计”。当前只围绕 GitHub Copilot 这一条 runtime-backed provider 路径。

## 2. 当前问题与设计结论

### 2.1 当前问题

仓库当前已经具备以下能力：

- `providers.json` 中可保存 `runtime.kind = "copilot-sdk-bridge"` 的 provider
- `switch` 到 Copilot provider 时会做 SDK probe、Copilot auth probe、bridge 启动与 healthcheck
- `bridge start|status|stop` 已存在，且具备单实例复用/替换逻辑
- `status` / `doctor` 已具备一定的 Copilot SDK、auth、bridge 诊断能力

但首次接入路径仍不完整：

1. `add --copilot` 仍然复用了 direct provider 的 interactive add 流程。
2. 该流程会把 `API key` 当成必填项，与 Copilot provider 的语义冲突。
3. TTY 下同意安装 SDK 后，没有继续进入 Copilot auth readiness 检查与引导。
4. 文档中仍有部分旧说法，把 `auth.json` 写成只读检查，或把 Copilot 路径说成“不涉及 auth.json / key 同步”，与当前 direct provider 行为和 Copilot 文件边界表达不一致。

### 2.2 设计结论

本设计固定以下结论：

1. Copilot 接入继续走最小命令面，不新增完整 `copilot` 顶层命令族。
2. `add --copilot` 是唯一的 Copilot provider 创建入口，并且必须成为“首次接入闭环”的起点。
3. `add --copilot` 的交互输入模型必须与 direct provider 分开，不能再复用 `apiKey` 必填逻辑。
4. CLI 负责引导式登录，不负责托管式登录。
5. Copilot upstream 登录态只由官方 SDK / 官方工具管理，不写入 managed provider files。
6. `switch` 继续是 Copilot runtime gate 的最终权威入口，但 `add --copilot` 也必须在 provider 落盘前确认 SDK 与 auth 已就绪。

## 3. 范围与非范围

### 3.1 In Scope

- `add --copilot` 的完整交互与非交互行为
- SDK lazy install 的命令级接入
- Copilot auth readiness 检查与交互式引导
- `switch` 的 Copilot runtime gate 收口
- Copilot provider 的文件边界和配置投影
- `status` / `doctor` 的 Copilot 字段与语义收口
- 与上述行为直接相关的测试与文档一致性修正

### 3.2 Out of Scope

- 新增完整 `copilot` 顶层命令族
- 托管 GitHub token 或 Copilot token
- 新增后台守护进程产品模型
- 多实例 managed Copilot bridge 编排
- 非 Copilot runtime family 的抽象扩展
- Responses API、Embeddings、图像/音频接口

## 4. 数据边界

### 4.1 `providers.json`

`providers.json` 是 Copilot provider 的管理态 SSOT，负责保存：

- provider 名称
- profile 绑定
- 本地 bridge `apiKey`
- bridge `baseUrl`
- runtime 元数据：
  - `kind = "copilot-sdk-bridge"`
  - `upstream = "github-copilot"`
  - `bridgeHost`
  - `bridgePort`
  - `bridgePath = "/v1"`
  - `premiumRequests = true`
  - `authSource = "official-sdk"`
  - `sdkInstallMode = "lazy"`

语义上，Copilot provider 的 `apiKey` 只是本地 bridge shared secret，不是 GitHub token，不是 Copilot upstream 登录凭据。

### 4.2 `config.toml`

`config.toml` 是运行态路由投影，负责保存：

- 当前 active profile
- `model_providers.<profile>.base_url`
- 该 profile 对应的 managed runtime routing

对于 Copilot provider，`base_url` 必须始终投影为 `http://<bridgeHost>:<bridgePort>/v1`。

### 4.3 `auth.json`

`auth.json` 的角色必须中性表达：

- 对 direct provider：`switch` 会把 `auth_mode = "apikey"` 与 `OPENAI_API_KEY` 写入其中
- 对 Copilot provider：Copilot upstream 登录态不存这里，bridge secret 也不要求持久化为 GitHub token 形态
- `status` / `doctor` 只把它当作本地 auth state 文件做存在性、可解析性和元数据检查

本设计明确否定以下旧说法：

- `auth.json` 是 Copilot upstream 登录态持久化位置
- `auth.json` 是所有 provider 的统一 secret mirror
- Copilot provider 需要向 `auth.json` 写入 GitHub/Copilot token

### 4.4 Runtime State

Copilot bridge runtime state 是本地运行态文件，负责保存：

- 当前运行中的 provider 名称
- bridge host / port / base URL
- 进程状态检查所需的最小元数据

它不属于 managed backup 的强事务边界。

## 5. Copilot Provider Contract

### 5.1 CLI 入口

唯一稳定入口：

```bash
codexs add <provider> --copilot --profile <name> [--bridge-host <host>] [--bridge-port <port>] [--bridge-api-key <secret>] [--install-copilot-sdk]
```

### 5.2 参数语义

- `--copilot`
  - 切换到 Copilot provider 模式
  - 与 direct provider 输入模型互斥
- `--profile`
  - 必填
- `--api-key`
  - 在 `--copilot` 下明确禁止
- `--bridge-api-key`
  - 可选
  - 若缺失则自动生成随机本地 secret
- `--bridge-host`
  - 可选
  - 默认 `127.0.0.1`
- `--bridge-port`
  - 可选
  - 默认 `41415`
  - 必须为正整数
- `--install-copilot-sdk`
  - 仅允许在 `add --copilot` 下显式使用
  - 代表非交互安装许可，或 TTY 中跳过二次确认的显式授权

### 5.3 输入模型

Copilot add 输入对象与 direct add 输入对象必须拆分：

```ts
type DirectAddInput = {
  providerName: string;
  profile: string;
  apiKey: string;
  createProfile: boolean;
  model?: string | null;
  baseUrl?: string | null;
  note?: string | null;
  tags: string[];
};

type CopilotAddInput = {
  providerName: string;
  profile: string;
  createProfile: boolean;
  model?: string | null;
  note?: string | null;
  tags: string[];
  bridgeHost?: string | null;
  bridgePort?: number | null;
  bridgeApiKey?: string | null;
};
```

Copilot 输入模型里不允许出现 `apiKey: string` 这个“provider secret 必填字段”。

## 6. `add --copilot` 详细设计

### 6.1 总体目标

`add --copilot` 必须从“只建记录”升级为“首次接入闭环前置检查入口”。

它的成功含义是：

1. provider 配置有效；
2. SDK 已可用；
3. Copilot upstream auth 已就绪；
4. managed files 已落盘为可切换状态。

它的失败必须尽量发生在 managed file mutation 之前。

### 6.2 非交互行为

非交互或 `--json` 下：

- 缺少 `<provider>` 或 `--profile` 时，直接失败
- 不提示交互问题
- 若 SDK 缺失且未显式传 `--install-copilot-sdk`，返回 `COPILOT_SDK_INSTALL_REQUIRES_TTY`
- 若 SDK 安装后 auth 未就绪，返回 `COPILOT_AUTH_REQUIRED`

非交互不会尝试 prompt-based login guidance。

### 6.3 交互行为

TTY 下 `add --copilot` 的推荐时序固定为：

1. 解析命令行已有参数
2. 若缺 provider/profile/model 等必需输入，进入 Copilot 专用 add prompt
3. 若 SDK 缺失：
   - 弹出确认：`The optional Copilot SDK runtime is not installed. Install it now?`
   - 用户确认后才允许安装
4. SDK 安装成功后，立即 probe Copilot auth readiness
5. 若 auth 缺失：
   - 输出明确提示，说明需要使用官方 Copilot 登录流程完成上游登录
   - 提供一个“完成登录后重试”的 retry loop
6. auth readiness 通过后，调用 app 层完成 provider 写入与 config projection

### 6.4 Copilot 专用交互采集项

Copilot add prompt 至少覆盖：

- `Provider name`
- `Profile`
- `Model for new profile "<profile>"`，仅当 profile 不存在且需要 create profile 时
- `Note (optional)`
- `Tags (optional)`
- `Bridge host (optional)`，默认值 `127.0.0.1`
- `Bridge port (optional)`，默认值 `41415`
- `Bridge API key (optional)`，留空则自动生成

明确禁止：

- 提示 `API key`
- 提示 `Confirm API key`
- 输出 `API key is required.`

### 6.5 SDK 安装职责

命令层负责 Copilot 首次接入的安装 preflight：

- 在 `add --copilot` 路径中，先决定是否允许安装
- 若允许且当前未安装，则先执行 `installCopilotSdk()`
- app 层 `addProvider()` 保留二次校验，防止被非 CLI 路径绕过

这样做的原因是：

- 命令层能处理 TTY 提示和用户确认
- app 层仍保留安全兜底，不把安装状态完全信任给调用者

### 6.6 Auth Guidance 职责

CLI 采用引导式登录，不采用托管式登录：

- `codex-switch` 不写入 GitHub token
- `codex-switch` 不新增自己的 token storage
- `codex-switch` 不承诺替代官方登录工具

但它必须负责：

- 检测 auth 是否 ready
- 在 TTY 下解释“你现在缺的是 Copilot upstream 登录”
- 允许用户在外部完成官方登录后返回当前流程并重试 auth check

标准失败码：

- `COPILOT_AUTH_REQUIRED`

标准交互策略：

- 输出人类可理解的提示
- 使用 confirm prompt 实现 `Retry Copilot authentication check now?`
- 用户拒绝 retry 时返回 `COPILOT_AUTH_REQUIRED`

### 6.7 文件写入时机

只有以下条件全部满足后，才允许持久化 provider：

1. 输入采集完成
2. SDK 已安装或已可探测到
3. Copilot auth readiness 通过

持久化时：

- Copilot provider 的 `baseUrl` 使用 canonical bridge URL
- `apiKey` 写入 bridge shared secret
- 若 profile 不存在且允许 `createProfile`，同步创建 config projection

## 7. `switch` 详细设计

### 7.1 保持现有总体结构

`switch` 继续是 Copilot provider 的运行态 gate：

1. 读取 provider
2. 校验 runtime config
3. probe SDK
4. probe Copilot auth
5. 启动或复用 bridge
6. healthcheck 成功
7. 写 managed files

### 7.2 Copilot 与 Direct 的区别

direct provider：

- 切换 active profile
- 写 `auth.json.OPENAI_API_KEY`

Copilot provider：

- 切换 active profile
- 不写 `OPENAI_API_KEY`
- 维护 bridge runtime 与 `config.toml` 的 `base_url` 投影
- 若端口恢复导致实际端口变化，则回写 `providers.json` 与 `config.toml`

### 7.3 失败与清理

若 bridge 是本次新启动的，并且后续 managed file mutation 失败：

- 需要做 best-effort `stopCopilotBridge()`

若 bridge 是复用旧健康实例：

- 不应因为后续文件写失败而误杀原有实例

## 8. `status` / `doctor` 设计

### 8.1 `status`

`status.data` 中 Copilot 相关字段保持以下事实语义：

- `copilotSdk`
  - 是否已安装
  - 安装目录
  - 包名
  - 版本
- `copilotAuth`
  - 官方 SDK session 是否可创建
  - source 固定为 `official-sdk`
  - mode 固定为当前实现使用的 session mode
- `copilotBridge`
  - 当前 bridge 是否健康
  - 若不健康，失败原因是什么
- `copilotRuntimeState`
  - 本地 bridge runtime state 的已知内容

`status` 不应把这些字段聚合成新的 `health.*` 大结构。

### 8.2 `doctor`

`doctor` 对 Copilot 至少要诊断：

- `COPILOT_SDK_MISSING`
- `COPILOT_AUTH_REQUIRED`
- `BRIDGE_STATE_MISSING`
- `BRIDGE_STATE_STALE`
- `PROVIDER_BASE_URL_MISMATCH`
- `BRIDGE_HEALTHCHECK_FAILED`

`doctor` 继续以 `issues[]` 为主输出，不新增第二套并行诊断结构。

### 8.3 诊断边界

Copilot 诊断必须清楚区分三个层次：

1. SDK 是否安装
2. upstream auth 是否 ready
3. local bridge 是否健康

这三层不能混为一种错误。

## 9. 错误模型

本设计固定使用或继续沿用以下错误码：

- `INVALID_ARGUMENT`
- `PROMPT_CANCELLED`
- `COPILOT_SDK_MISSING`
- `COPILOT_SDK_INSTALL_FAILED`
- `COPILOT_SDK_INSTALL_REQUIRES_TTY`
- `COPILOT_SDK_UNSUPPORTED`
- `COPILOT_AUTH_REQUIRED`
- `BRIDGE_PORT_CONFLICT`
- `BRIDGE_START_FAILED`
- `BRIDGE_HEALTHCHECK_FAILED`
- `BRIDGE_STATE_MISSING`
- `BRIDGE_STATE_STALE`
- `RUNTIME_PROVIDER_INVALID`
- `PROVIDER_BASE_URL_MISMATCH`

重点约束：

- `COPILOT_AUTH_REQUIRED` 只能表示 upstream auth readiness 不满足
- 不能拿它表达 SDK 缺失
- 不能拿它表达 bridge 健康失败

## 10. 代码落点

### 10.1 `src/commands/handlers.ts`

负责：

- `add --copilot` 的 CLI 参数约束
- 交互与非交互分支
- SDK install preflight
- auth guidance retry loop

### 10.2 `src/interaction/add-interactive.ts`

负责：

- direct add 输入收集
- Copilot add 输入收集
- 二者的 UI 文案和必填规则分离

### 10.3 `src/app/add-provider.ts`

负责：

- provider record 生成
- config projection 生成
- Copilot runtime metadata 归一化
- SDK 已安装前提下的安全持久化

### 10.4 `src/runtime/*`

负责：

- SDK 探测与安装
- auth readiness probe
- bridge start / stop / status / healthcheck

## 11. 测试要求

### 11.1 交互测试

必须覆盖：

- Copilot add prompt 不再要求 direct API key
- Copilot add prompt 能采集 bridge host / port / bridge API key
- Copilot 非交互错误文案与 direct provider 区分

### 11.2 命令测试

必须覆盖：

- `add --copilot` 在 SDK 缺失且用户允许安装时，先安装再继续
- `add --copilot` 在 auth 缺失时进入引导式 retry loop
- `add --copilot --json` 在 auth 缺失时直接失败，不 prompt

### 11.3 工作流测试

必须覆盖：

- `addProvider()` 创建 Copilot provider 后，record 结构正确
- `switchProvider()` 到 Copilot provider 时启动或复用 bridge
- Copilot `switch` 不写 `OPENAI_API_KEY`
- bridge 端口恢复后会回写 provider/config projection
- 写文件失败时，新启动 bridge 会被清理

### 11.4 文档一致性测试

发布前人工检查至少覆盖：

- README
- README.AI
- README.CN
- `docs/cli-usage.md`
- 产品概览 / 技术架构中与 Copilot 相关的说明

确保不再出现以下冲突：

- 把 `auth.json` 说成 Copilot upstream token 存储
- 把 `auth.json` 写成完全只读且与 direct switch 行为冲突
- 把 `add --copilot` 描述成还需要 direct provider API key

## 12. 发布完成标准

Copilot 接入可以视为“设计与实现完整”的最低标准是：

1. `add --copilot` 在 TTY 下可完成首次接入，不会误要求 direct API key。
2. 缺 SDK 时能按许可安装。
3. 缺 auth 时能给出可执行的登录引导与 retry。
4. `switch` 到 Copilot provider 时能稳定完成 runtime gate。
5. `status` / `doctor` 能把 SDK、auth、bridge 三层问题清楚区分。
6. 文档对 Copilot 的文件边界和行为边界与代码一致。

