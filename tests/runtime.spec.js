"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const {
  setCodexSpawnImplementation,
  resetCodexSpawnImplementation,
} = require("../dist/runtime/codex-cli.js");
const {
  setCopilotCliSpawnImplementation,
  resetCopilotCliSpawnImplementation,
  checkCopilotCliAvailable,
  runCopilotLogin,
} = require("../dist/runtime/copilot-cli.js");
const { probeCodexRuntime } = require("../dist/runtime/codex-probe.js");
const {
  probeCopilotSdkInstall,
  getCopilotSdkPackageName,
  setCopilotInstallerSpawnImplementation,
  resetCopilotInstallerSpawnImplementation,
} = require("../dist/runtime/copilot-installer.js");
const {
  startCopilotBridgeServer,
  ensureCopilotBridge,
  stopCopilotBridge,
  setCopilotBridgeSpawnImplementation,
  resetCopilotBridgeSpawnImplementation,
} = require("../dist/runtime/copilot-bridge.js");
const { writeCopilotBridgeState, readCopilotBridgeState } = require("../dist/storage/runtime-state-repo.js");
const { readCopilotAuthState, sendCopilotChatCompletion } = require("../dist/runtime/copilot-adapter.js");

function withSpawn(mock, run) {
  setCodexSpawnImplementation(mock);
  try {
    return run();
  } finally {
    resetCodexSpawnImplementation();
  }
}

function withInstallerSpawn(mock, run) {
  setCopilotInstallerSpawnImplementation(mock);
  try {
    return run();
  } finally {
    resetCopilotInstallerSpawnImplementation();
  }
}

function withCopilotCliSpawn(mock, run) {
  setCopilotCliSpawnImplementation(mock);
  try {
    return run();
  } finally {
    resetCopilotCliSpawnImplementation();
  }
}

function withBridgeSpawn(mock, run) {
  setCopilotBridgeSpawnImplementation(mock);
  try {
    const result = run();
    if (result && typeof result.then === "function") {
      return result.finally(() => {
        resetCopilotBridgeSpawnImplementation();
      });
    }
    resetCopilotBridgeSpawnImplementation();
    return result;
  } finally {
    if (false) {
      resetCopilotBridgeSpawnImplementation();
    }
  }
}

function writeBundledCopilotShim(runtimeDir) {
  const binDir = path.join(runtimeDir, "node_modules", ".bin");
  fs.mkdirSync(binDir, { recursive: true });
  if (process.platform === "win32") {
    fs.writeFileSync(path.join(binDir, "copilot.cmd"), "@echo off\r\n", "utf8");
    return;
  }
  fs.writeFileSync(path.join(binDir, "copilot"), "#!/bin/sh\n", "utf8");
}

function withFakeCopilotSdk(options, run) {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-runtime-sdk-"));
  const packageDir = path.join(runtimeDir, "node_modules", "@github", "copilot-sdk");
  const previousRuntimeDir = process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, "package.json"),
    `${JSON.stringify({ name: "@github/copilot-sdk", version: "0.0.0-test" }, null, 2)}\n`,
    "utf8"
  );
  const moduleSource = options.failAuth
    ? [
        '"use strict";',
        "function approveAll() { return true; }",
        "class CopilotClient {",
        "  async createSession(options) {",
        '    if (!options || typeof options.onPermissionRequest !== "function") throw new Error("onPermissionRequest is required");',
        '    throw new Error("auth required");',
        "  }",
        "  async stop() {}",
        "}",
        "module.exports = { CopilotClient, approveAll, default: { CopilotClient, approveAll } };",
        "",
      ].join("\n")
    : [
        '"use strict";',
        "function approveAll() { return true; }",
        "class CopilotClient {",
        "  async createSession(options) {",
        '    if (!options || typeof options.onPermissionRequest !== "function") throw new Error("onPermissionRequest is required");',
        "    return {",
        "      async sendAndWait(args) {",
        '        return { data: { content: `mock:${String(args.model ?? "")}:${String(args.prompt ?? "")}` } };',
        "      },",
        "    };",
        "  }",
        "  async stop() {}",
        "}",
        "module.exports = { CopilotClient, approveAll, default: { CopilotClient, approveAll } };",
        "",
      ].join("\n");
  fs.writeFileSync(path.join(packageDir, "index.js"), moduleSource, "utf8");
  if (options.includeBundledCli) {
    writeBundledCopilotShim(runtimeDir);
  }
  process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR = runtimeDir;
  try {
    const result = run();
    if (result && typeof result.then === "function") {
      return result.finally(() => {
        if (previousRuntimeDir === undefined) {
          delete process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
        } else {
          process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR = previousRuntimeDir;
        }
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      });
    }
    if (previousRuntimeDir === undefined) {
      delete process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
    } else {
      process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR = previousRuntimeDir;
    }
    fs.rmSync(runtimeDir, { recursive: true, force: true });
    return result;
  } finally {
    if (false) {
      delete process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
    }
  }
}

function withRuntimeStateDir(run) {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-runtime-state-"));
  const stateDir = path.join(runtimeDir, "state");
  const previousStateDir = process.env.CODEX_SWITCH_RUNTIME_STATE_DIR;
  fs.mkdirSync(stateDir, { recursive: true });
  process.env.CODEX_SWITCH_RUNTIME_STATE_DIR = stateDir;
  try {
    const result = run();
    if (result && typeof result.then === "function") {
      return result.finally(() => {
        if (previousStateDir === undefined) {
          delete process.env.CODEX_SWITCH_RUNTIME_STATE_DIR;
        } else {
          process.env.CODEX_SWITCH_RUNTIME_STATE_DIR = previousStateDir;
        }
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      });
    }
    if (previousStateDir === undefined) {
      delete process.env.CODEX_SWITCH_RUNTIME_STATE_DIR;
    } else {
      process.env.CODEX_SWITCH_RUNTIME_STATE_DIR = previousStateDir;
    }
    fs.rmSync(runtimeDir, { recursive: true, force: true });
    return result;
  } finally {
    if (false) {
      delete process.env.CODEX_SWITCH_RUNTIME_STATE_DIR;
    }
  }
}

module.exports = {
  name: "runtime",
  tests: [
    {
      name: "probeCodexRuntime reports missing runtime failures",
      run() {
        const result = withSpawn(
          () => ({
            error: new Error("spawn ENOENT"),
            status: 1,
            stdout: "",
            stderr: "",
          }),
          () => probeCodexRuntime()
        );

        assert.equal(result.ok, false);
        assert.equal(result.reason, "missing");
      },
    },
    {
      name: "probeCodexRuntime reports unsupported versions separately",
      run() {
        const result = withSpawn(
          () => ({
            error: null,
            status: 0,
            stdout: "codex 0.133.9",
            stderr: "",
          }),
          () => probeCodexRuntime("0.134.0")
        );

        assert.equal(result.ok, false);
        assert.equal(result.reason, "unsupported");
        assert.equal(result.version, "0.133.9");
      },
    },
    {
      name: "probeCopilotSdkInstall reports a stable package contract",
      run() {
        const result = probeCopilotSdkInstall();
        assert.equal(result.packageName, getCopilotSdkPackageName());
        assert.equal(typeof result.installDir, "string");
        assert.equal(typeof result.installed, "boolean");
      },
    },
    {
      name: "Copilot installer spawn hooks are configurable for tests",
      run() {
        const result = withInstallerSpawn(
          () => ({
            error: null,
            status: 0,
            stdout: "",
            stderr: "",
          }),
          () => "ok"
        );
        assert.equal(result, "ok");
      },
    },
    {
      name: "Copilot installer surfaces spawn errors with actionable details",
      run() {
        const runtimeDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "codex-switch-installer-failure-"));
        const previousRuntimeDir = process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
        process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR = runtimeDir;
        try {
          assert.throws(
            () =>
              withInstallerSpawn(
                () => ({
                  error: Object.assign(new Error("spawnSync npm.cmd EINVAL"), { code: "EINVAL" }),
                  status: null,
                  stdout: "",
                  stderr: "",
                  signal: null,
                  pid: 0,
                  output: ["", ""],
                }),
                () => require("../dist/runtime/copilot-installer.js").installCopilotSdk()
              ),
            (error) =>
              error &&
              error.code === "COPILOT_SDK_INSTALL_FAILED" &&
              /spawnSync npm\.cmd EINVAL/.test(String(error.details.cause)) &&
              Array.isArray(error.details.args)
          );
        } finally {
          if (previousRuntimeDir === undefined) {
            delete process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
          } else {
            process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR = previousRuntimeDir;
          }
          fs.rmSync(runtimeDir, { recursive: true, force: true });
        }
      },
    },
    {
      name: "runCopilotLogin surfaces spawn failures with actionable details",
      run() {
        assert.throws(
          () =>
            withCopilotCliSpawn(
              () => ({
                error: Object.assign(new Error("spawnSync cmd.exe ENOENT"), { code: "ENOENT" }),
                status: null,
                stdout: "",
                stderr: "",
                signal: null,
                pid: 0,
                output: ["", ""],
              }),
              () => runCopilotLogin()
            ),
          /spawnSync cmd\.exe ENOENT/
        );
      },
    },
    {
      name: "checkCopilotCliAvailable prefers the bundled runtime shim when present",
      run() {
        withFakeCopilotSdk({ failAuth: false, includeBundledCli: true }, () => {
          let captured = null;
          const result = withCopilotCliSpawn(
            (command, args, options) => {
              captured = { command, args, options };
              return {
                error: null,
                status: 0,
                stdout: "",
                stderr: "",
              };
            },
            () => checkCopilotCliAvailable()
          );

          assert.equal(result.ok, true);
          assert.equal(result.source, "bundled");
          assert.ok(captured);
          if (process.platform === "win32") {
            assert.ok(String(captured.command).endsWith(path.join("node_modules", ".bin", "copilot.cmd")));
            assert.deepEqual(captured.args, ["--help"]);
            assert.equal(captured.options.shell, true);
          } else {
            assert.ok(String(captured.command).endsWith(path.join(".bin", "copilot")));
            assert.deepEqual(captured.args, ["--help"]);
            assert.equal(captured.options.shell, false);
          }
        });
      },
    },
    {
      name: "checkCopilotCliAvailable falls back to PATH when the bundled shim is absent",
      run() {
        let captured = null;
        const result = withCopilotCliSpawn(
          (command, args, options) => {
            captured = { command, args, options };
            return {
              error: new Error("copilot missing"),
              status: 1,
              stdout: "",
              stderr: "",
            };
          },
          () => checkCopilotCliAvailable()
        );

        assert.equal(result.ok, false);
        assert.equal(result.source, "path");
        assert.match(String(result.cause), /copilot missing/);
        assert.ok(captured);
        if (process.platform === "win32") {
          assert.equal(captured.command, "copilot");
          assert.deepEqual(captured.args, ["--help"]);
          assert.equal(captured.options.shell, true);
        } else {
          assert.equal(captured.command, "copilot");
          assert.deepEqual(captured.args, ["--help"]);
          assert.equal(captured.options.shell, false);
        }
      },
    },
    {
      name: "copilot bridge worker uses the 5-digit default fallback port",
      run() {
        const workerSource = fs.readFileSync(path.join(__dirname, "..", "src", "runtime", "copilot-bridge-worker.ts"), "utf8");
        assert.match(workerSource, /CODEX_SWITCH_BRIDGE_PORT \?\? "41415"/);
      },
    },
    {
      name: "Copilot adapter authenticates through CopilotClient session shape",
      async run() {
        await withFakeCopilotSdk({ failAuth: false }, async () => {
          const auth = await readCopilotAuthState();
          assert.equal(auth.ready, true);
          assert.equal(auth.source, "official-sdk");

          const completion = await sendCopilotChatCompletion({
            provider: "copilot",
            payload: {
              model: "gpt-test",
              messages: [{ role: "user", content: "hello" }],
            },
          });
          assert.equal(completion.choices[0].message.role, "assistant");
          assert.match(completion.choices[0].message.content, /^mock:gpt-test:/);
        });
      },
    },
    {
      name: "Copilot adapter preserves CopilotClient method binding for session creation",
      async run() {
        const os = require("node:os");
        const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-runtime-sdk-binding-"));
        const packageDir = path.join(runtimeDir, "node_modules", "@github", "copilot-sdk");
        const previousRuntimeDir = process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
        fs.mkdirSync(packageDir, { recursive: true });
        fs.writeFileSync(
          path.join(packageDir, "package.json"),
          `${JSON.stringify({ name: "@github/copilot-sdk", version: "0.0.0-test" }, null, 2)}\n`,
          "utf8"
        );
        fs.writeFileSync(
          path.join(packageDir, "index.js"),
          [
            '"use strict";',
            "function approveAll() { return true; }",
            "class CopilotClient {",
            "  constructor() {",
            "    this.connection = { ok: true };",
            "  }",
            "  async createSession(options) {",
            '    if (!this || !this.connection) throw new Error("missing bound connection");',
            '    if (!options || typeof options.onPermissionRequest !== "function") throw new Error("onPermissionRequest is required");',
            "    return {",
            "      async sendAndWait(args) {",
            '        return { data: { content: `bound:${String(args.model ?? "")}:${String(args.prompt ?? "")}` } };',
            "      },",
            "    };",
            "  }",
            "  async stop() {}",
            "}",
            "module.exports = { CopilotClient, approveAll, default: { CopilotClient, approveAll } };",
            "",
          ].join("\n"),
          "utf8"
        );
        process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR = runtimeDir;
        try {
          const auth = await readCopilotAuthState();
          assert.equal(auth.ready, true);
          const completion = await sendCopilotChatCompletion({
            provider: "copilot",
            payload: {
              model: "gpt-test",
              messages: [{ role: "user", content: "hello" }],
            },
          });
          assert.match(completion.choices[0].message.content, /^bound:gpt-test:/);
        } finally {
          if (previousRuntimeDir === undefined) {
            delete process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
          } else {
            process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR = previousRuntimeDir;
          }
          fs.rmSync(runtimeDir, { recursive: true, force: true });
        }
      },
    },
    {
      name: "Copilot adapter surfaces auth-required failures from the official SDK session path",
      async run() {
        await withFakeCopilotSdk({ failAuth: true }, async () => {
          await assert.rejects(
            () => readCopilotAuthState(),
            (error) => error && error.code === "COPILOT_AUTH_REQUIRED"
          );
        });
      },
    },
    {
      name: "Copilot adapter reports missing permission-hook support as unsupported",
      async run() {
        await withFakeCopilotSdk({ failAuth: false }, async () => {
          const runtimeDir = process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
          const packageDir = path.join(runtimeDir, "node_modules", "@github", "copilot-sdk");
          fs.writeFileSync(
            path.join(packageDir, "index.js"),
            [
              '"use strict";',
              "class CopilotClient {",
              "  async createSession() {",
              '    throw new Error("onPermissionRequest is required");',
              "  }",
              "  async stop() {}",
              "}",
              "module.exports = { CopilotClient, default: { CopilotClient } };",
              "",
            ].join("\n"),
            "utf8"
          );

          await assert.rejects(
            () => readCopilotAuthState(),
            (error) => error && error.code === "COPILOT_SDK_UNSUPPORTED"
          );
        });
      },
    },
    {
      name: "Copilot bridge serves health and chat completions with bearer auth",
      async run() {
        const port = await getFreePort();
        const server = await startCopilotBridgeServer({
          host: "127.0.0.1",
          port,
          apiKey: "bridge-secret",
          executeChatCompletion: async (payload) => ({
            id: "test-chat",
            object: "chat.completion",
            created: 1,
            model: payload.model || "copilot",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "ok",
                },
                finish_reason: "stop",
              },
            ],
          }),
        });

        try {
          const health = await requestJson({
            host: "127.0.0.1",
            port,
            method: "GET",
            path: "/healthz",
            headers: {
              authorization: "Bearer bridge-secret",
            },
          });
          assert.equal(health.statusCode, 200);
          assert.equal(health.body.ok, true);

          const completion = await requestJson({
            host: "127.0.0.1",
            port,
            method: "POST",
            path: "/v1/chat/completions",
            headers: {
              authorization: "Bearer bridge-secret",
              "content-type": "application/json",
            },
            body: {
              model: "gpt-5",
              messages: [{ role: "user", content: "hello" }],
            },
          });
          assert.equal(completion.statusCode, 200);
          assert.equal(completion.body.choices[0].message.content, "ok");

          const unauthorized = await requestJson({
            host: "127.0.0.1",
            port,
            method: "GET",
            path: "/v1/models",
          });
          assert.equal(unauthorized.statusCode, 401);
        } finally {
          await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        }
      },
    },
    {
      name: "Copilot bridge serves minimal responses payloads with bearer auth",
      async run() {
        const port = await getFreePort();
        const receivedPayloads = [];
        const server = await startCopilotBridgeServer({
          host: "127.0.0.1",
          port,
          apiKey: "bridge-secret",
          executeChatCompletion: async (payload) => {
            receivedPayloads.push(payload);
            return {
              id: "test-response-chat",
              object: "chat.completion",
              created: 2,
              model: payload.model || "copilot",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: "response-ok",
                  },
                  finish_reason: "stop",
                },
              ],
            };
          },
        });

        try {
          const completion = await requestJson({
            host: "127.0.0.1",
            port,
            method: "POST",
            path: "/v1/responses",
            headers: {
              authorization: "Bearer bridge-secret",
              "content-type": "application/json",
            },
            body: {
              model: "gpt-5",
              input: [
                {
                  role: "user",
                  content: [{ type: "input_text", text: "hello" }],
                },
              ],
            },
          });
          assert.equal(completion.statusCode, 200);
          assert.equal(completion.body.object, "response");
          assert.equal(completion.body.output_text, "response-ok");
          assert.equal(completion.body.output[0].content[0].type, "output_text");
          assert.deepEqual(receivedPayloads[0].messages, [{ role: "user", content: "hello" }]);

          const codexCompatible = await requestJson({
            host: "127.0.0.1",
            port,
            method: "POST",
            path: "/v1/responses",
            headers: {
              authorization: "Bearer bridge-secret",
              "content-type": "application/json",
            },
            body: {
              model: "gpt-5",
              input: [
                {
                  role: "assistant",
                  content: [{ type: "output_text", text: "Earlier answer" }],
                },
                {
                  role: "user",
                  content: [
                    { type: "text", text: "What about now?" },
                    { type: "input_image", image_url: "https://example.test/image.png" },
                    { type: "input_file", filename: "README.md" },
                    { type: "reasoning", summary: "internal-only" },
                  ],
                },
              ],
            },
          });
          assert.equal(codexCompatible.statusCode, 200);
          assert.equal(codexCompatible.body.output_text, "response-ok");
          assert.deepEqual(receivedPayloads[1].messages, [
            { role: "assistant", content: "Earlier answer" },
            {
              role: "user",
              content: "What about now?\n[input_image: https://example.test/image.png]\n[input_file: README.md]\n[unsupported content type: reasoning]",
            },
          ]);

          const syntheticUser = await requestJson({
            host: "127.0.0.1",
            port,
            method: "POST",
            path: "/v1/responses",
            headers: {
              authorization: "Bearer bridge-secret",
              "content-type": "application/json",
            },
            body: {
              model: "gpt-5",
              input: [
                { type: "input_text", text: "hello" },
                { type: "input_file", file_id: "file-123" },
              ],
            },
          });
          assert.equal(syntheticUser.statusCode, 200);
          assert.equal(syntheticUser.body.output_text, "response-ok");
          assert.deepEqual(receivedPayloads[2].messages, [
            { role: "user", content: "hello\n[input_file: file-123]" },
          ]);

          const mixedTopLevel = await requestJson({
            host: "127.0.0.1",
            port,
            method: "POST",
            path: "/v1/responses",
            headers: {
              authorization: "Bearer bridge-secret",
              "content-type": "application/json",
            },
            body: {
              model: "gpt-5",
              input: [
                {
                  role: "user",
                  content: [{ type: "input_text", text: "hello" }],
                },
                { type: "input_text", text: "world" },
              ],
            },
          });
          assert.equal(mixedTopLevel.statusCode, 400);
          assert.match(String(mixedTopLevel.body.error.message), /must contain either message objects or content items/);

          const streamed = await requestText({
            host: "127.0.0.1",
            port,
            method: "POST",
            path: "/v1/responses",
            headers: {
              authorization: "Bearer bridge-secret",
              "content-type": "application/json",
            },
            body: {
              model: "gpt-5",
              stream: true,
              input: "hello",
            },
          });
          assert.equal(streamed.statusCode, 200);
          assert.match(String(streamed.body), /event: response\.created/);
          assert.match(String(streamed.body), /event: response\.in_progress/);
          assert.match(String(streamed.body), /event: response\.output_item\.added/);
          assert.match(String(streamed.body), /event: response\.content_part\.added/);
          assert.match(String(streamed.body), /event: response\.output_text\.delta/);
          assert.match(String(streamed.body), /"delta":"response-ok"/);
          assert.match(String(streamed.body), /event: response\.output_text\.done/);
          assert.match(String(streamed.body), /event: response\.content_part\.done/);
          assert.match(String(streamed.body), /event: response\.output_item\.done/);
          assert.match(String(streamed.body), /event: response\.completed/);
          assert.doesNotMatch(String(streamed.body), /data: \[DONE\]/);

          const unauthorized = await requestJson({
            host: "127.0.0.1",
            port,
            method: "POST",
            path: "/v1/responses",
            headers: {
              "content-type": "application/json",
            },
            body: {
              model: "gpt-5",
              input: "hello",
            },
          });
          assert.equal(unauthorized.statusCode, 401);
        } finally {
          await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        }
      },
    },
    {
      name: "ensureCopilotBridge recovers from port conflicts by selecting a new 5-digit port",
      async run() {
        const port = await getFreePort();
        const blocker = net.createServer();
        await new Promise((resolve, reject) => blocker.listen(port, "127.0.0.1", (error) => (error ? reject(error) : resolve())));
        try {
          await withRuntimeStateDir(async () => {
            const bridge = await ensureCopilotBridge("copilot", {
              profile: "copilot",
              apiKey: "bridge-secret",
              baseUrl: `http://127.0.0.1:${String(port)}/v1`,
              runtime: {
                kind: "copilot-sdk-bridge",
                upstream: "github-copilot",
                bridgeHost: "127.0.0.1",
                bridgePort: port,
                bridgePath: "/v1",
                premiumRequests: true,
                authSource: "official-sdk",
                sdkInstallMode: "lazy",
              },
            });
            assert.equal(bridge.reused, false);
            assert.equal(bridge.portChanged, true);
            assert.match(String(bridge.port), /^\d{5}$/);
            assert.notEqual(bridge.port, port);
          });
        } finally {
          await new Promise((resolve, reject) => blocker.close((error) => (error ? reject(error) : resolve())));
        }
      },
    },
    {
      name: "ensureCopilotBridge reports worker startup failures separately",
      async run() {
        const port = await getFreePort();
        await assert.rejects(
          () =>
            withBridgeSpawn(
              () => {
                throw new Error("spawn failed");
              },
              () =>
                ensureCopilotBridge("copilot", {
                  profile: "copilot",
                  apiKey: "bridge-secret",
                  baseUrl: `http://127.0.0.1:${String(port)}/v1`,
                  runtime: {
                    kind: "copilot-sdk-bridge",
                    upstream: "github-copilot",
                    bridgeHost: "127.0.0.1",
                    bridgePort: port,
                    bridgePath: "/v1",
                    premiumRequests: true,
                    authSource: "official-sdk",
                    sdkInstallMode: "lazy",
                  },
                })
            ),
          (error) => error && error.code === "BRIDGE_START_FAILED"
        );
      },
    },
    {
      name: "ensureCopilotBridge replaces a different managed provider instance before starting a new one",
      async run() {
        const previousPort = await getFreePort();
        const nextPort = await getFreePort();
        const previousServer = await startCopilotBridgeServer({
          host: "127.0.0.1",
          port: previousPort,
          apiKey: "old-secret",
          executeChatCompletion: async () => ({
            choices: [{ index: 0, message: { role: "assistant", content: "old" }, finish_reason: "stop" }],
          }),
        });

        try {
          await withRuntimeStateDir(async () => {
            writeCopilotBridgeState({
              provider: "copilot-old",
              pid: null,
              host: "127.0.0.1",
              port: previousPort,
              baseUrl: `http://127.0.0.1:${String(previousPort)}/v1`,
              startedAt: new Date().toISOString(),
              lastHealthcheckAt: new Date().toISOString(),
            });

            const bridge = await ensureCopilotBridge("copilot-new", {
              profile: "copilot-new",
              apiKey: "bridge-secret",
              baseUrl: `http://127.0.0.1:${String(nextPort)}/v1`,
              runtime: {
                kind: "copilot-sdk-bridge",
                upstream: "github-copilot",
                bridgeHost: "127.0.0.1",
                bridgePort: nextPort,
                bridgePath: "/v1",
                premiumRequests: true,
                authSource: "official-sdk",
                sdkInstallMode: "lazy",
              },
            });

            assert.equal(bridge.reused, false);
            assert.equal(bridge.replaced, true);
            assert.equal(readCopilotBridgeState().provider, "copilot-new");
          });
        } finally {
          await new Promise((resolve, reject) => previousServer.close((error) => (error ? reject(error) : resolve())));
          stopCopilotBridge();
        }
      },
    },
    {
      name: "ensureCopilotBridge does not reuse a healthy bridge that rejects the current provider secret",
      async run() {
        const previousPort = await getFreePort();
        const previousServer = await startCopilotBridgeServer({
          host: "127.0.0.1",
          port: previousPort,
          apiKey: "old-secret",
          executeChatCompletion: async () => ({
            choices: [{ index: 0, message: { role: "assistant", content: "old" }, finish_reason: "stop" }],
          }),
        });

        try {
          await withRuntimeStateDir(async () => {
            writeCopilotBridgeState({
              provider: "copilot",
              pid: null,
              host: "127.0.0.1",
              port: previousPort,
              baseUrl: `http://127.0.0.1:${String(previousPort)}/v1`,
              startedAt: new Date().toISOString(),
              lastHealthcheckAt: new Date().toISOString(),
            });

            const bridge = await ensureCopilotBridge("copilot", {
              profile: "copilot",
              apiKey: "new-secret",
              baseUrl: `http://127.0.0.1:${String(previousPort)}/v1`,
              runtime: {
                kind: "copilot-sdk-bridge",
                upstream: "github-copilot",
                bridgeHost: "127.0.0.1",
                bridgePort: previousPort,
                bridgePath: "/v1",
                premiumRequests: true,
                authSource: "official-sdk",
                sdkInstallMode: "lazy",
              },
            });

            assert.equal(bridge.reused, false);
            assert.equal(bridge.replaced, true);
            assert.notEqual(bridge.port, previousPort);

            const authorized = await requestJson({
              host: "127.0.0.1",
              port: bridge.port,
              method: "GET",
              path: "/v1/models",
              headers: {
                authorization: "Bearer new-secret",
              },
            });
            assert.equal(authorized.statusCode, 200);
          });
        } finally {
          await new Promise((resolve, reject) => previousServer.close((error) => (error ? reject(error) : resolve())));
          stopCopilotBridge();
        }
      },
    },
    {
      name: "ensureCopilotBridge replaces a healthy bridge when the persisted worker build is stale",
      async run() {
        const previousPort = await getFreePort();
        const previousServer = await startCopilotBridgeServer({
          host: "127.0.0.1",
          port: previousPort,
          apiKey: "bridge-secret",
          executeChatCompletion: async () => ({
            choices: [{ index: 0, message: { role: "assistant", content: "old" }, finish_reason: "stop" }],
          }),
        });

        try {
          await withRuntimeStateDir(async () => {
            writeCopilotBridgeState({
              provider: "copilot",
              pid: null,
              host: "127.0.0.1",
              port: previousPort,
              baseUrl: `http://127.0.0.1:${String(previousPort)}/v1`,
              startedAt: new Date().toISOString(),
              lastHealthcheckAt: new Date().toISOString(),
            });

            const bridge = await ensureCopilotBridge("copilot", {
              profile: "copilot",
              apiKey: "bridge-secret",
              baseUrl: `http://127.0.0.1:${String(previousPort)}/v1`,
              runtime: {
                kind: "copilot-sdk-bridge",
                upstream: "github-copilot",
                bridgeHost: "127.0.0.1",
                bridgePort: previousPort,
                bridgePath: "/v1",
                premiumRequests: true,
                authSource: "official-sdk",
                sdkInstallMode: "lazy",
              },
            });

            assert.equal(bridge.reused, false);
            assert.equal(bridge.replaced, true);

            const state = readCopilotBridgeState();
            assert.equal(typeof state.workerBuildId, "string");
            assert.notEqual(state.workerBuildId, undefined);
          });
        } finally {
          await new Promise((resolve, reject) => previousServer.close((error) => (error ? reject(error) : resolve())));
          stopCopilotBridge();
        }
      },
    },
  ],
};

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to resolve a free test port.")));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
    server.on("error", reject);
  });
}

function requestJson({ host, port, method, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host,
        port,
        method,
        path,
        headers,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        });
        response.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve({
            statusCode: response.statusCode,
            body: raw ? JSON.parse(raw) : null,
          });
        });
      }
    );
    request.on("error", reject);
    if (body) {
      request.write(JSON.stringify(body));
    }
    request.end();
  });
}

function requestText({ host, port, method, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host,
        port,
        method,
        path,
        headers,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    request.on("error", reject);
    if (body) {
      request.write(JSON.stringify(body));
    }
    request.end();
  });
}
