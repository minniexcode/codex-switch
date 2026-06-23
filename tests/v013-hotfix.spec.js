"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  readCopilotAuthState,
  sendCopilotChatCompletion,
} = require("../dist/runtime/copilot-adapter.js");
const {
  resolveCopilotSdkRuntimeInvocation,
  checkCopilotCliAvailable,
  setCopilotCliSpawnImplementation,
  resetCopilotCliSpawnImplementation,
} = require("../dist/runtime/copilot-cli.js");

async function run() {
  await testSdkRuntimeUsesExplicitRuntimeConnection();
  await testSdkRuntimeResolverTargetsNpmLoader();
  await testHumanCliResolutionStillUsesBundledShim();
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

function withCopilotCliSpawn(mock, runBlock) {
  setCopilotCliSpawnImplementation(mock);
  try {
    return runBlock();
  } finally {
    resetCopilotCliSpawnImplementation();
  }
}

function buildSdkModuleSource(options) {
  const authStatus = options.authenticated ? "{ authenticated: true }" : "{ authenticated: false }";
  return [
    '"use strict";',
    "function approveAll() { return true; }",
    "const RuntimeConnection = {",
    "  forStdio(options) {",
    "    if (!options || typeof options.path !== 'string' || !options.path.endsWith('npm-loader.js')) {",
    "      throw new Error('RuntimeConnection.forStdio requires npm-loader.js path');",
    "    }",
    "    return { kind: 'stdio', path: options.path, args: Array.isArray(options.args) ? options.args : [] };",
    "  },",
    "};",
    "class CopilotClient {",
    "  constructor(options) {",
    "    const connection = options && options.connection;",
    "    if (!connection || connection.kind !== 'stdio' || !String(connection.path || '').endsWith('npm-loader.js')) {",
    "      throw new Error('legacy client options are unsupported');",
    "    }",
    "    this.connection = connection;",
    "  }",
    `  async getAuthStatus() { return ${authStatus}; }`,
    "  async createSession(sessionOptions) {",
    "    if (!sessionOptions || typeof sessionOptions.onPermissionRequest !== 'function') {",
    "      throw new Error('onPermissionRequest is required');",
    "    }",
    "    return {",
    "      async sendAndWait(args) {",
    "        return { data: { content: `hotfix:${String(args.prompt ?? '')}` } };",
    "      },",
    "      async abort() {},",
    "      async disconnect() {},",
    "    };",
    "  }",
    "  async stop() {}",
    "}",
    "module.exports = { CopilotClient, RuntimeConnection, approveAll, default: { CopilotClient, RuntimeConnection, approveAll } };",
    "",
  ].join("\n");
}

function withFakeCopilotSdk(runBlock) {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-v013-sdk-"));
  const packageDir = path.join(runtimeDir, "node_modules", "@github", "copilot-sdk");
  const copilotDir = path.join(runtimeDir, "node_modules", "@github", "copilot");
  const previousRuntimeDir = process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;

  fs.mkdirSync(packageDir, { recursive: true });
  fs.mkdirSync(copilotDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, "package.json"),
    `${JSON.stringify({ name: "@github/copilot-sdk", version: "1.0.2" }, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(path.join(packageDir, "index.js"), buildSdkModuleSource({ authenticated: true }), "utf8");
  fs.writeFileSync(
    path.join(copilotDir, "package.json"),
    `${JSON.stringify({ name: "@github/copilot", version: "1.0.64-3" }, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(path.join(copilotDir, "npm-loader.js"), "#!/usr/bin/env node\n", "utf8");
  writeBundledCopilotShim(runtimeDir);
  process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR = runtimeDir;

  try {
    const result = runBlock(runtimeDir);
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

async function testSdkRuntimeUsesExplicitRuntimeConnection() {
  await withFakeCopilotSdk(async () => {
    const auth = await readCopilotAuthState();
    assert.equal(auth.ready, true);

    const completion = await sendCopilotChatCompletion({
      provider: "copilot",
      payload: {
        model: "gpt-test",
        messages: [{ role: "user", content: "hello" }],
      },
    });
    assert.match(completion.choices[0].message.content, /^hotfix:user: hello/);
  });
}

function testSdkRuntimeResolverTargetsNpmLoader() {
  withFakeCopilotSdk((runtimeDir) => {
    const invocation = resolveCopilotSdkRuntimeInvocation();
    assert.ok(invocation);
    assert.equal(invocation.path, path.join(runtimeDir, "node_modules", "@github", "copilot", "npm-loader.js"));
    assert.deepEqual(invocation.args, []);
  });
}

function testHumanCliResolutionStillUsesBundledShim() {
  withFakeCopilotSdk((runtimeDir) => {
    let captured = null;
    const result = withCopilotCliSpawn(
      (command, args, spawnOptions) => {
        captured = { command, args, options: spawnOptions };
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
      assert.equal(captured.command, path.join(runtimeDir, "node_modules", ".bin", "copilot.cmd"));
      assert.deepEqual(captured.args, ["--help"]);
      assert.equal(captured.options.shell, true);
    } else {
      assert.equal(captured.command, path.join(runtimeDir, "node_modules", ".bin", "copilot"));
      assert.deepEqual(captured.args, ["--help"]);
      assert.equal(captured.options.shell, false);
    }
  });
}

module.exports = { run };
