"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const {
  probeCopilotSdkRuntime,
  readCopilotAuthState,
  createCopilotRuntimeClient,
  startCopilotRuntimeClient,
  stopCopilotRuntimeClient,
  sendCopilotChatCompletion,
} = require("../dist/runtime/copilot-adapter.js");
const { switchProvider } = require("../dist/app/switch-provider.js");
const {
  startCopilotBridgeServer,
  setCopilotBridgeSpawnImplementation,
  resetCopilotBridgeSpawnImplementation,
  stopCopilotBridge,
} = require("../dist/runtime/copilot-bridge.js");

async function run() {
  await testProbeRuntimeRejectsPrereleaseAndAuthCheckDoesNotCreateSession();
  await testSendFallbackUsesSendAndRequiresAbort();
  await testCopilotSwitchProjectsManagedBridgeRouteThroughMockedWorker();
}

async function testProbeRuntimeRejectsPrereleaseAndAuthCheckDoesNotCreateSession() {
  await withFakeCopilotSdk(
    {
      version: "1.0.2-beta.1",
      moduleSource: buildSdkModuleSource({ authenticated: true, sessionMode: "sendAndWait" }),
    },
    async (runtimeDir) => {
      const status = probeCopilotSdkRuntime(runtimeDir);
      assert.equal(status.ok, false);
      assert.equal(status.reason, "unsupported");
    }
  );

  await withFakeCopilotSdk(
    {
      version: "1.0.2",
      moduleSource: [
        '"use strict";',
        "function approveAll() { return true; }",
        "const RuntimeConnection = {",
        "  forStdio(connectionOptions) {",
        "    if (!connectionOptions || typeof connectionOptions.path !== \"string\") throw new Error(\"RuntimeConnection.forStdio requires path\");",
        "    return { kind: \"stdio\", path: connectionOptions.path, args: Array.isArray(connectionOptions.args) ? connectionOptions.args : [] };",
        "  },",
        "};",
        "class CopilotClient {",
        "  constructor(clientOptions) {",
        "    if (!clientOptions || !clientOptions.connection || clientOptions.connection.kind !== \"stdio\") throw new Error(\"RuntimeConnection.forStdio connection is required\");",
        "    this.connection = clientOptions.connection;",
        "  }",
        "  async getAuthStatus() { return { authenticated: true }; }",
        "  async createSession() { throw new Error('createSession should not be called during auth check'); }",
        "  async stop() {}",
        "}",
        "module.exports = { CopilotClient, RuntimeConnection, approveAll, default: { CopilotClient, RuntimeConnection, approveAll } };",
        "",
      ].join("\n"),
    },
    async (runtimeDir) => {
      const status = await readCopilotAuthState(runtimeDir);
      assert.equal(status.ready, true);
      assert.equal(status.mode, "auth-status");
    }
  );
}

async function testSendFallbackUsesSendAndRequiresAbort() {
  await withFakeCopilotSdk(
    {
      version: "1.0.2",
      moduleSource: buildSdkModuleSource({ authenticated: true, sessionMode: "send", includeAbort: true }),
    },
    async (runtimeDir) => {
      const response = await sendCopilotChatCompletion({
        provider: "copilot",
        runtimesDir: runtimeDir,
        payload: {
          model: "gpt-5",
          messages: [{ role: "user", content: "hello" }],
        },
      });
      assert.match(response.choices[0].message.content, /^mock:user: hello/);
    }
  );

  await withFakeCopilotSdk(
    {
      version: "1.0.2",
      moduleSource: buildSdkModuleSource({ authenticated: true, sessionMode: "send", includeAbort: false }),
    },
    async (runtimeDir) => {
      await assert.rejects(
        () =>
          sendCopilotChatCompletion({
            provider: "copilot",
            runtimesDir: runtimeDir,
            payload: {
              model: "gpt-5",
              messages: [{ role: "user", content: "hello" }],
            },
          }),
        (error) => error && error.code === "COPILOT_SDK_API_UNSUPPORTED"
      );
    }
  );
}

async function testCopilotSwitchProjectsManagedBridgeRouteThroughMockedWorker() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-v012-"));
  const codexDir = path.join(root, "codex");
  const toolHomeDir = path.join(root, "tool-home");
  const runtimeStateDir = path.join(root, "runtime-state");
  fs.mkdirSync(codexDir, { recursive: true });
  fs.mkdirSync(toolHomeDir, { recursive: true });
  fs.mkdirSync(runtimeStateDir, { recursive: true });

  const configPath = path.join(codexDir, "config.toml");
  const authPath = path.join(codexDir, "auth.json");
  const providersPath = path.join(toolHomeDir, "providers.json");
  const lockPath = path.join(toolHomeDir, ".codex-switch.lock");
  const backupsDir = path.join(toolHomeDir, "backups");
  const latestBackupPath = path.join(backupsDir, "latest.json");
  fs.mkdirSync(backupsDir, { recursive: true });

  const bridgePort = await getFreePort();
  fs.writeFileSync(
    configPath,
    [
      'model = "gpt-5"',
      'model_provider = "default"',
      "",
      "[model_providers.default]",
      'base_url = "https://api.example.com/v1"',
      'name = "default"',
      "requires_openai_auth = true",
      'wire_api = "responses"',
      "",
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    providersPath,
    `${JSON.stringify(
      {
        providers: {
          copilot: {
            profile: "copilot",
            model: "gpt-4o-mini",
            apiKey: "bridge-secret",
            baseUrl: `http://127.0.0.1:${String(bridgePort)}/v1`,
            runtime: {
              kind: "copilot-sdk-bridge",
              upstream: "github-copilot",
              bridgeHost: "127.0.0.1",
              bridgePort,
              bridgePath: "/v1",
              premiumRequests: true,
              authSource: "official-sdk",
              sdkInstallMode: "lazy",
            },
          },
        },
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const previousStateDir = process.env.CODEX_SWITCH_RUNTIME_STATE_DIR;
  process.env.CODEX_SWITCH_RUNTIME_STATE_DIR = runtimeStateDir;

  try {
    await withFakeCopilotSdk(
      {
        version: "1.0.2",
        moduleSource: buildSdkModuleSource({ authenticated: true, sessionMode: "sendAndWait" }),
      },
      async (runtimeDir) => {
        const spawnCalls = [];
        await withMockedBridgeWorker(
          async () => {
            const switched = await switchProvider({
              codexDir,
              lockPath,
              backupsDir,
              latestBackupPath,
              configPath,
              providersPath,
              authPath,
              runtimeDir: runtimeStateDir,
              runtimesDir: runtimeDir,
              providerName: "copilot",
            });

            assert.equal(switched.data.profile, "copilot");
            const configAfterSwitch = fs.readFileSync(configPath, "utf8");
            assert.match(configAfterSwitch, /\[model_providers\.copilot\]/);
            assert.match(configAfterSwitch, /wire_api = "responses"/);
            assert.match(configAfterSwitch, /stream_idle_timeout_ms = 300000/);
            assert.match(configAfterSwitch, new RegExp(`base_url = "http://127\\.0\\.0\\.1:${String(bridgePort)}/v1"`));

            const authAfterSwitch = JSON.parse(fs.readFileSync(authPath, "utf8"));
            assert.equal(authAfterSwitch.OPENAI_API_KEY, "bridge-secret");

            const completion = await requestJson({
              host: "127.0.0.1",
              port: bridgePort,
              method: "POST",
              path: "/v1/chat/completions",
              headers: {
                authorization: "Bearer bridge-secret",
                "content-type": "application/json",
              },
              body: {
                model: "copilot-test",
                messages: [{ role: "user", content: "hello" }],
              },
            });
            assert.equal(completion.statusCode, 200);
            assert.match(completion.body.choices[0].message.content, /^mock:user: hello/);
          },
          spawnCalls
        );

        assert.equal(spawnCalls.length, 1);
        assert.equal(spawnCalls[0].env.CODEX_SWITCH_RUNTIME_DIR, runtimeStateDir);
        assert.equal(spawnCalls[0].env.CODEX_SWITCH_RUNTIMES_DIR, runtimeDir);
      }
    );
  } finally {
    stopCopilotBridge(runtimeStateDir);
    if (previousStateDir === undefined) {
      delete process.env.CODEX_SWITCH_RUNTIME_STATE_DIR;
    } else {
      process.env.CODEX_SWITCH_RUNTIME_STATE_DIR = previousStateDir;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function buildSdkModuleSource(options) {
  const methods = [];
  if (options.sessionMode === "sendAndWait") {
    methods.push("      async sendAndWait(args) { return { data: { content: `mock:${String(args.prompt ?? \"\")}` } }; },");
  } else {
    methods.push("      async send(args) { return { data: { content: `mock:${String(args.prompt ?? \"\")}` } }; },");
  }
  if (options.includeAbort !== false) {
    methods.push("      async abort() {},");
  }
  methods.push("      async disconnect() {},");

  return [
    '"use strict";',
    "function approveAll() { return true; }",
    "const RuntimeConnection = {",
    "  forStdio(connectionOptions) {",
    "    if (!connectionOptions || typeof connectionOptions.path !== \"string\") throw new Error(\"RuntimeConnection.forStdio requires path\");",
    "    return { kind: \"stdio\", path: connectionOptions.path, args: Array.isArray(connectionOptions.args) ? connectionOptions.args : [] };",
    "  },",
    "};",
    "class CopilotClient {",
    "  constructor(clientOptions) {",
    "    if (!clientOptions || !clientOptions.connection || clientOptions.connection.kind !== \"stdio\") throw new Error(\"RuntimeConnection.forStdio connection is required\");",
    "    this.connection = clientOptions.connection;",
    "  }",
    `  async getAuthStatus() { return { authenticated: ${options.authenticated ? "true" : "false"} }; }`,
    "  async createSession(options) {",
    '    if (!options || typeof options.onPermissionRequest !== "function") throw new Error("onPermissionRequest is required");',
    "    return {",
    ...methods,
    "    };",
    "  }",
    "  async stop() {}",
    "}",
    "module.exports = { CopilotClient, RuntimeConnection, approveAll, default: { CopilotClient, RuntimeConnection, approveAll } };",
    "",
  ].join("\n");
}

async function withFakeCopilotSdk(options, run) {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-v012-sdk-"));
  const packageDir = path.join(runtimeDir, "node_modules", "@github", "copilot-sdk");
  const copilotDir = path.join(runtimeDir, "node_modules", "@github", "copilot");
  const previousRuntimeDir = process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
  fs.mkdirSync(packageDir, { recursive: true });
  fs.mkdirSync(copilotDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, "package.json"), `${JSON.stringify({ name: "@github/copilot-sdk", version: options.version }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(packageDir, "index.js"), options.moduleSource, "utf8");
  fs.writeFileSync(path.join(copilotDir, "package.json"), `${JSON.stringify({ name: "@github/copilot", version: "1.0.64-3" }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(copilotDir, "npm-loader.js"), "#!/usr/bin/env node\n", "utf8");
  process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR = runtimeDir;
  try {
    await run(runtimeDir);
  } finally {
    if (previousRuntimeDir === undefined) {
      delete process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
    } else {
      process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR = previousRuntimeDir;
    }
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

async function withMockedBridgeWorker(run, spawnCalls) {
  const servers = [];
  setCopilotBridgeSpawnImplementation((_command, _args, options) => {
    const child = new EventEmitter();
    child.pid = null;
    child.unref = () => {};
    spawnCalls.push(options);

    (async () => {
      const runtimesDir = options.env.CODEX_SWITCH_RUNTIMES_DIR || undefined;
      const runtimeClient = await createCopilotRuntimeClient(runtimesDir);
      await startCopilotRuntimeClient(runtimeClient);
      let requestQueue = Promise.resolve();
      const server = await startCopilotBridgeServer({
        host: options.env.CODEX_SWITCH_BRIDGE_HOST,
        port: Number(options.env.CODEX_SWITCH_BRIDGE_PORT),
        apiKey: options.env.CODEX_SWITCH_BRIDGE_API_KEY,
        executeChatCompletion: async (payload, executionOptions) => {
          const task = () =>
            sendCopilotChatCompletion({
              provider: options.env.CODEX_SWITCH_BRIDGE_PROVIDER,
              payload,
              runtimesDir,
              runtimeClient,
              timeoutMs: executionOptions?.timeoutMs,
              onStreamEvent: (event) => {
                if (event.type === "delta") {
                  executionOptions?.onTextDelta?.(event.delta);
                } else {
                  executionOptions?.onTextDone?.(event.text);
                }
              },
            });
          const next = requestQueue.then(task, task);
          requestQueue = next.catch(() => undefined);
          return next;
        },
      });
      servers.push({ server, runtimeClient });
    })().catch((error) => {
      child.emit("error", error);
    });

    return child;
  });

  try {
    await run();
  } finally {
    resetCopilotBridgeSpawnImplementation();
    for (const entry of servers) {
      await closeServer(entry.server);
      await stopCopilotRuntimeClient(entry.runtimeClient);
    }
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : null;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

function requestJson(options) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: options.host,
        port: options.port,
        method: options.method,
        path: options.path,
        headers: options.headers,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve({
            statusCode: response.statusCode,
            body: raw.trim() === "" ? null : JSON.parse(raw),
          });
        });
      }
    );
    request.on("error", reject);
    if (options.body !== undefined) {
      request.write(JSON.stringify(options.body));
    }
    request.end();
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

module.exports = { run };
