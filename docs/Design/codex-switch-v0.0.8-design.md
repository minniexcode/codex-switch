# codex-switch `0.0.8` 设计文档

## 文档信息

- 文档类型：详细设计文档
- 适用版本：`0.0.8`
- 目标范围：`0.0.7 -> 0.0.8`
- 对应 PRD：[`../PRD/codex-switch-prd-v0.0.8.md`](../PRD/codex-switch-prd-v0.0.8.md)

## 1. 文档目标

本设计把 `0.0.8` 的 Copilot runtime integration 收口到可实现的范围：

- Copilot provider 的 schema 如何表达
- SDK 的 lazy-load 与自动安装如何落地
- `add`、`switch`、`status`、`doctor` 分别承担什么职责
- `providers.json`、`config.toml`、`auth.json` 与 runtime manifest 的边界是什么
- 代码和测试应该落到哪些模块

## 2. 版本定位

`0.0.8` 是第一个 runtime-backed provider 版本。它不会把 `codex-switch` 扩成通用插件系统，而是先用 GitHub Copilot 把 runtime integration 这条线真正跑通。

## 3. 数据模型

`ProviderRecord` 在 `0.0.8` 中扩展为兼容 direct provider 和 runtime-backed provider：

```ts
type ProviderRuntime =
  | {
      kind: "copilot-sdk-bridge";
      upstream: "github-copilot";
      bridgeHost: string;
      bridgePort: number;
      bridgePath: "/v1";
      premiumRequests: true;
      authSource: "official-sdk";
      sdkInstallMode: "lazy";
    };
```

语义：

- 无 `runtime`：现有 direct provider
- `runtime.kind = "copilot-sdk-bridge"`：Copilot provider
- Copilot provider 的 `apiKey` 是本地 bridge 的 shared secret，不是 GitHub token
- `baseUrl` 必须与 `http://<bridgeHost>:<bridgePort>/v1` 一致

## 4. 命令设计

扩展现有命令面，不新增 `copilot` 或 `proxy` 子命令：

- `codexs add <provider> --copilot --profile <name> [--bridge-host <host>] [--bridge-port <port>] [--bridge-api-key <secret>] [--install-copilot-sdk]`
- `codexs switch <provider>`
- `codexs status`
- `codexs doctor`

规则：

- `--copilot` 与 direct provider 输入模式互斥
- `--bridge-host` 默认 `127.0.0.1`
- `--bridge-port` 默认 `4141`
- `--bridge-api-key` 若缺失则自动生成本地 secret
- SDK 自动安装只允许发生在 `add --copilot`

## 5. Runtime 模块

新增模块：

- `src/runtime/copilot-sdk-loader.ts`
- `src/runtime/copilot-installer.ts`
- `src/runtime/copilot-adapter.ts`
- `src/runtime/copilot-bridge.ts`
- `src/storage/runtime-state-repo.ts`

职责：

- loader：按用户级 runtime 目录懒加载 SDK
- installer：探测与安装 SDK
- adapter：优先按官方 `CopilotClient -> createSession -> sendAndWait` 形态包装 Copilot SDK 的 probe / auth / request 能力
- bridge：管理本地 OpenAI 兼容 bridge 的状态
- runtime state repo：保存 bridge runtime manifest

前置条件：

- 本地官方 SDK 依赖已安装并可加载
- 用户机器上已有可用的 Copilot CLI / login 状态，`codex-switch` 不接管上游账号登录

## 6. 运行态与文件边界

- `providers.json`：保存 Copilot provider 与 bridge 配置
- `config.toml`：保存 bridge 的 `base_url` 与 `env_key`
- `auth.json`：保存 Codex 到 bridge 的 shared secret
- runtime manifest：保存 bridge 进程状态，不进入 managed backup 事务

## 7. `switch` 时序

1. 读取 provider
2. 校验 `runtime` 配置
3. probe SDK
4. 缺失则直接报错
5. 检查 Copilot auth state
6. 启动或复用 bridge
7. healthcheck 通过
8. 再进入现有 `config.toml + auth.json` 写入事务
9. 文件写入失败时回滚，并对本次新启动 bridge 做 best-effort 清理

## 8. 错误语义

新增错误码：

- `COPILOT_SDK_MISSING`
- `COPILOT_SDK_INSTALL_FAILED`
- `COPILOT_SDK_INSTALL_REQUIRES_TTY`
- `COPILOT_SDK_UNSUPPORTED`
- `COPILOT_AUTH_REQUIRED`
- `COPILOT_PREMIUM_UNAVAILABLE`
- `BRIDGE_PORT_CONFLICT`
- `BRIDGE_START_FAILED`
- `BRIDGE_HEALTHCHECK_FAILED`
- `RUNTIME_PROVIDER_INVALID`
- `PROVIDER_BASE_URL_MISMATCH`

## 9. 测试

需要覆盖：

- `add --copilot` 参数与写入
- 非交互缺失 SDK 的失败路径
- `--install-copilot-sdk` 的允许安装路径
- Copilot provider 的 `status` / `doctor`
- direct provider 回归
