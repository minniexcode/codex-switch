# @minniexcode/codex-switch

`@minniexcode/codex-switch` 是一个本地优先的 CLI，用来安全地管理和切换 Codex 的 provider/profile 配置。

它主要解决这样一个问题：如果你同时使用多个 Codex provider、API key 或 profile，不想再手动改 `~/.codex/` 里的文件，就可以用这个工具做统一管理和安全切换。

## 这个仓库是做什么的

这个仓库包含 `codex-switch` 的 CLI 实现、npm 包配置，以及相关产品和技术文档。

项目目标很明确：

- 在本地完成 Codex 配置切换
- 写入前先备份
- 出错时可回滚
- 同时兼顾终端用户和 AI/自动化调用

## 现在可以做什么

当前 MVP 命令如下：

```bash
codexs list
codexs current
codexs switch <provider>
codexs status
codexs import <file>
codexs export <file>
codexs add <provider>
codexs remove <provider>
codexs doctor
codexs rollback
```

对应能力包括：

- 查看本地已管理的 provider
- 查看当前激活的 profile
- 安全切换 provider
- 导入和导出 provider 映射
- 新增和删除 provider
- 检查配置漂移和常见本地问题
- 在变更前自动备份，并在失败时回滚

## 简单用法

全局安装：

```bash
npm install -g @minniexcode/codex-switch
```

或者直接执行：

```bash
npx @minniexcode/codex-switch --help
```

检查 CLI 是否可用：

```bash
codexs --help
```

典型使用方式：

```bash
codexs list
codexs current
codexs add my-provider --profile my-provider --api-key sk-xxx
codexs switch my-provider
codexs status
```

给脚本或 AI 使用时建议加上：

```bash
codexs list --json
codexs status --json
```

通用参数：

```bash
--json
--codex-dir <path>
```

## 交互式体验

这个 CLI 同时支持显式命令和交互式终端流程。

- `codexs add` 在 TTY 里会补问缺失的必填项
- `codexs switch` 在未传 provider 时可以弹出选择列表
- `codexs remove` 支持交互式选择和确认删除
- `import`、`export`、`rollback` 在交互模式下会要求确认
- `--json` 模式保持非交互，适合自动化

## 管理哪些文件

`codex-switch` 主要围绕 `~/.codex/` 下的这些文件工作：

```text
~/.codex/
  config.toml
  auth.json
  providers.json
  backups/
```

存储模型：

- `providers.json` 是管理态的单一事实来源
- `config.toml` 和 `auth.json` 是运行态文件
- `backups/latest.json` 记录最近一次可回滚窗口

注意：`providers.json` 可能包含 API key，应视为本地敏感文件。

## 相关文档

- [English README](./README.md)
- [AI README](./README.AI.md)
- [产品概览](./docs/codex-switch-product-overview.md)
- [产品调研](./docs/codex-switch-product-research.md)
- [PRD](./docs/codex-switch-prd.md)
- [技术架构](./docs/codex-switch-technical-architecture.md)
- [命令设计](./docs/codex-switch-command-design.md)

## 最近 3 个版本更新

### 0.0.3

- 为 `add`、`switch`、`remove`、`import`、`export`、`rollback` 增加了交互式 TTY 流程
- 改进了帮助信息和命令级使用说明
- 增强了交互行为和参数处理相关测试覆盖

### 0.0.2

- 增加了统一的变更编排能力，包括写前备份、失败回滚和单进程锁
- 改进了 `status` 和 `doctor`，更清晰地识别运行态漂移
- 加强了底层仓储层和领域层，使配置写入更安全

### 0.0.1

- 发布了第一版 TypeScript CLI 实现
- 落地了核心 MVP 命令和基于文件的 provider 管理模型
- 补齐了首批产品、架构和命令设计文档

## 本地开发

```bash
npm install
npm run build
npm test
node dist/cli.js --help
```

## License

MIT
