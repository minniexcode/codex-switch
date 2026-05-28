"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

const { parseArgs } = require("../dist/commands/args.js");
const { buildHelpText } = require("../dist/commands/help.js");
const { executeCommand } = require("../dist/commands/dispatch.js");
const { renderFailure } = require("../dist/cli/output.js");
const { readCopilotBridgeState } = require("../dist/storage/runtime-state-repo.js");
const { stopCopilotBridge } = require("../dist/runtime/copilot-bridge.js");
const { createCodexPaths } = require("../dist/storage/codex-paths.js");
const {
  setCopilotCliSpawnImplementation,
  resetCopilotCliSpawnImplementation,
} = require("../dist/runtime/copilot-cli.js");
const {
  setCopilotInstallerSpawnImplementation,
  resetCopilotInstallerSpawnImplementation,
} = require("../dist/runtime/copilot-installer.js");

function makeTempCodexDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-commands-"));
  process.env.CODEXS_HOME = root;
  const paths = createCodexPaths({ codexDir: root, toolHomeDir: root });
  fs.mkdirSync(paths.backupsDir, { recursive: true });
  return root;
}

function writeProviders(root, providers) {
  const paths = createCodexPaths(root);
  fs.writeFileSync(paths.providersPath, `${JSON.stringify({ providers }, null, 2)}\n`, "utf8");
}

function writeBridgeFixture(root, bridgePort) {
  writeProviders(root, {
    "copilot-main": {
      profile: "copilot-main",
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
  });
  fs.writeFileSync(
    path.join(root, "config.toml"),
    [
      'profile = "copilot-main"',
      "",
      "[profiles.copilot-main]",
      'model = "gpt-4o-mini"',
      'model_provider = "copilot-main"',
      "",
      "[model_providers.copilot-main]",
      `base_url = "http://127.0.0.1:${String(bridgePort)}/v1"`,
      "",
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(root, "auth.json"),
    `${JSON.stringify({ auth_mode: "apikey", COPILOT_MAIN_API_KEY: "bridge-secret" }, null, 2)}\n`,
    "utf8"
  );
}

function withFakeCopilotSdk(run) {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-commands-copilot-"));
  const packageDir = path.join(runtimeDir, "node_modules", "@github", "copilot-sdk");
  const stateDir = path.join(runtimeDir, "state");
  const previousRuntimeDir = process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
  const previousStateDir = process.env.CODEX_SWITCH_RUNTIME_STATE_DIR;
  fs.mkdirSync(packageDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, "package.json"), `${JSON.stringify({ name: "@github/copilot-sdk", version: "0.0.0-test" }, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(packageDir, "index.js"),
    [
      '"use strict";',
      "",
      "function approveAll() { return true; }",
      "async function createSession(options) {",
      '  if (!options || typeof options.onPermissionRequest !== "function") throw new Error("onPermissionRequest is required");',
      "  return {",
      "    async sendAndWait(args) {",
      '      return { content: `mock:${String(args.model ?? "")}:${String(args.prompt ?? "")}` };',
      "    },",
      "  };",
      "}",
      "",
      "module.exports = {",
      "  createSession,",
      "  approveAll,",
      "  default: { createSession, approveAll },",
      "};",
      "",
    ].join("\n"),
    "utf8"
  );
  process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR = runtimeDir;
  process.env.CODEX_SWITCH_RUNTIME_STATE_DIR = stateDir;
  try {
    const result = run();
    if (result && typeof result.then === "function") {
      return result.finally(() => {
        stopCopilotBridge();
        if (previousRuntimeDir === undefined) {
          delete process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
        } else {
          process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR = previousRuntimeDir;
        }
        if (previousStateDir === undefined) {
          delete process.env.CODEX_SWITCH_RUNTIME_STATE_DIR;
        } else {
          process.env.CODEX_SWITCH_RUNTIME_STATE_DIR = previousStateDir;
        }
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      });
    }
    stopCopilotBridge();
    if (previousRuntimeDir === undefined) {
      delete process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
    } else {
      process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR = previousRuntimeDir;
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
      stopCopilotBridge();
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

function withBrokenCopilotAuth(run) {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-commands-copilot-auth-"));
  const packageDir = path.join(runtimeDir, "node_modules", "@github", "copilot-sdk");
  const stateDir = path.join(runtimeDir, "state");
  const previousRuntimeDir = process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
  const previousStateDir = process.env.CODEX_SWITCH_RUNTIME_STATE_DIR;
  fs.mkdirSync(packageDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, "package.json"), `${JSON.stringify({ name: "@github/copilot-sdk", version: "0.0.0-test" }, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(packageDir, "index.js"),
    [
      '"use strict";',
      "",
      "function approveAll() { return true; }",
      "async function createSession(options) {",
      '  if (!options || typeof options.onPermissionRequest !== "function") throw new Error("onPermissionRequest is required");',
      '  throw new Error("login required");',
      "}",
      "",
      "module.exports = {",
      "  createSession,",
      "  approveAll,",
      "  default: { createSession, approveAll },",
      "};",
      "",
    ].join("\n"),
    "utf8"
  );
  process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR = runtimeDir;
  process.env.CODEX_SWITCH_RUNTIME_STATE_DIR = stateDir;
  try {
    const result = run();
    if (result && typeof result.then === "function") {
      return result.finally(() => {
        stopCopilotBridge();
        if (previousRuntimeDir === undefined) {
          delete process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
        } else {
          process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR = previousRuntimeDir;
        }
        if (previousStateDir === undefined) {
          delete process.env.CODEX_SWITCH_RUNTIME_STATE_DIR;
        } else {
          process.env.CODEX_SWITCH_RUNTIME_STATE_DIR = previousStateDir;
        }
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      });
    }
    stopCopilotBridge();
    if (previousRuntimeDir === undefined) {
      delete process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
    } else {
      process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR = previousRuntimeDir;
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
      stopCopilotBridge();
    }
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

module.exports = {
  name: "commands",
  tests: [
    {
      name: "parseArgs resolves multi-token commands through the shared registry",
      run() {
        const parsed = parseArgs(["config", "show", "alpha", "--json"]);
        assert.equal(parsed.command, "config-show");
        assert.deepEqual(parsed.positionals, ["alpha"]);
        assert.equal(parsed.globalOptions.json, true);
      },
    },
    {
      name: "parseArgs resolves bridge nested commands through the shared registry",
      run() {
        const parsed = parseArgs(["bridge", "status", "copilot-main", "--json"]);
        assert.equal(parsed.command, "bridge-status");
        assert.deepEqual(parsed.positionals, ["copilot-main"]);
        assert.equal(parsed.globalOptions.json, true);
      },
    },
    {
      name: "parseArgs preserves multi-token help topics",
      run() {
        const parsed = parseArgs(["help", "config", "show"]);
        assert.equal(parsed.helpRequested, true);
        assert.equal(parsed.helpTarget, "config show");
      },
    },
    {
      name: "buildHelpText renders public multi-token command syntax",
      run() {
        const help = buildHelpText("config");
        assert.match(help, /Available config commands/);
        assert.match(help, /config show/);
        assert.match(help, /config list-profiles/);
      },
    },
    {
      name: "buildHelpText renders detailed multi-token command help",
      run() {
        const help = buildHelpText("backups list");
        assert.match(help, /codexs backups list/);
        assert.match(help, /List historical backup entries/);
      },
    },
    {
      name: "buildHelpText renders bridge command help",
      run() {
        const help = buildHelpText("bridge");
        assert.match(help, /Available bridge commands/);
        assert.match(help, /bridge start/);
        assert.match(help, /bridge stop/);
        assert.match(help, /bridge status/);
      },
    },
    {
      name: "buildHelpText shows the primary workflow before advanced adopt examples",
      run() {
        const help = buildHelpText();
        assert.match(help, /Primary workflows:/);
        assert.match(help, /codexs init/);
        assert.match(help, /codexs add packycode --profile packycode --api-key sk-xxx/);
        assert.match(help, /login copilot -> add --copilot -> switch -> status -> doctor/);
        assert.match(help, /codexs migrate/);
        assert.ok(help.indexOf("codexs switch packycode") < help.indexOf("codexs migrate"));
      },
    },
    {
      name: "buildHelpText describes migrate as an advanced adopt helper",
      run() {
        const help = buildHelpText("migrate");
        assert.match(help, /advanced adopt helper|advanced adopt/i);
      },
    },
    {
      name: "buildHelpText describes login with bundled runtime and PATH fallback semantics",
      run() {
        const help = buildHelpText("login");
        assert.match(help, /bundled Copilot CLI/i);
        assert.match(help, /falls back to PATH/i);
        assert.match(help, /rechecks before succeeding/i);
      },
    },
    {
      name: "parseArgs preserves Copilot add and switch install flags for command validation",
      run() {
        const add = parseArgs([
          "add",
          "copilot-main",
          "--copilot",
          "--profile",
          "copilot-main",
          "--bridge-port",
          "4141",
          "--install-copilot-sdk",
        ]);
        assert.equal(add.command, "add");
        assert.equal(add.positionals[0], "copilot-main");
        assert.equal(add.commandOptions.get("--copilot")[0], "true");
        assert.equal(add.commandOptions.get("--bridge-port")[0], "4141");
        assert.equal(add.commandOptions.get("--install-copilot-sdk")[0], "true");

        const switched = parseArgs(["switch", "copilot-main", "--install-copilot-sdk"]);
        assert.equal(switched.command, "switch");
        assert.equal(switched.commandOptions.get("--install-copilot-sdk")[0], "true");
      },
    },
    {
      name: "buildHelpText renders setup deprecation guidance",
      run() {
        const help = buildHelpText("setup");
        assert.match(help, /Deprecated\./);
        assert.match(help, /Use init for the primary fresh-install workflow/);
      },
    },
    {
      name: "executeCommand dispatches list through the command id",
      async run() {
        const codexDir = makeTempCodexDir();
        writeProviders(codexDir, {
          alpha: {
            profile: "alpha",
            apiKey: "sk-alpha",
          },
        });

        const parsed = parseArgs(["list", "--codex-dir", codexDir, "--json"]);
        const result = await executeCommand(
          {
            command: parsed.command,
            options: parsed.globalOptions,
          },
          parsed
        );

        assert.ok(result.data);
        assert.deepEqual(result.data.providers, [
          {
            name: "alpha",
            profile: "alpha",
            providerType: "direct",
            isActive: false,
            note: null,
            tags: [],
          },
        ]);
        assert.equal(result.data.currentModelProvider, null);
        assert.equal(result.data.activeProvider, null);
        assert.equal(result.data.activeProviderResolvable, false);
        assert.deepEqual(result.data.activeProviderCandidates, []);
      },
    },
    {
      name: "executeCommand init creates an empty providers registry without requiring config files",
      async run() {
        const codexDir = makeTempCodexDir();
        const paths = createCodexPaths({ codexDir, toolHomeDir: codexDir });
        fs.rmSync(paths.providersPath, { force: true });
        const parsed = parseArgs(["init", "--codex-dir", codexDir, "--json"]);

        const result = await executeCommand(
          {
            command: parsed.command,
            options: parsed.globalOptions,
          },
          parsed,
          {
            isInteractive: () => false,
            inputText: async () => "",
            inputSecret: async () => "",
            selectOne: async () => "",
            selectMany: async () => [],
            confirmAction: async () => false,
            writeLine: () => {},
          }
        );

        assert.equal(result.data.createdToolHomeDir, false);
        assert.equal(result.data.createdToolConfigFile, true);
        assert.equal(result.data.createdProvidersFile, true);
        assert.equal(result.data.providersAlreadyExisted, false);
        assert.deepEqual(JSON.parse(fs.readFileSync(paths.providersPath, "utf8")), { providers: {} });
      },
    },
    {
      name: "executeCommand resolves tool home before reading tool config and only then resolves codexDir",
      async run() {
        const previousToolHome = process.env.CODEXS_HOME;
        const previousCodexDirEnv = process.env.CODEXS_CODEX_DIR;
        const toolHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-tool-home-"));
        const codexDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-target-codex-"));
        process.env.CODEXS_HOME = toolHomeDir;
        delete process.env.CODEXS_CODEX_DIR;

        try {
          const toolConfigPath = path.join(toolHomeDir, "codex-switch.json");
          fs.writeFileSync(
            toolConfigPath,
            `${JSON.stringify({ version: "0.0.10", defaultCodexDir: codexDir }, null, 2)}\n`,
            "utf8"
          );
          fs.writeFileSync(
            path.join(toolHomeDir, "providers.json"),
            `${JSON.stringify({ providers: {} }, null, 2)}\n`,
            "utf8"
          );
          fs.writeFileSync(path.join(codexDir, "config.toml"), 'model = "gpt-4o-mini"\nmodel_provider = "alpha"\n', "utf8");
          fs.writeFileSync(
            path.join(codexDir, "auth.json"),
            `${JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "sk-alpha" }, null, 2)}\n`,
            "utf8"
          );

          const parsed = parseArgs(["status", "--json"]);
          const result = await executeCommand(
            {
              command: parsed.command,
              options: parsed.globalOptions,
            },
            parsed
          );

          assert.equal(result.data.codexDir, codexDir);
          assert.equal(result.data.storage.toolHome.root, toolHomeDir);
          assert.equal(result.data.storage.toolHome.toolConfig, toolConfigPath);
          assert.equal(result.data.storage.targetRuntime.root, codexDir);
        } finally {
          if (previousToolHome === undefined) {
            delete process.env.CODEXS_HOME;
          } else {
            process.env.CODEXS_HOME = previousToolHome;
          }
          if (previousCodexDirEnv === undefined) {
            delete process.env.CODEXS_CODEX_DIR;
          } else {
            process.env.CODEXS_CODEX_DIR = previousCodexDirEnv;
          }
          fs.rmSync(toolHomeDir, { recursive: true, force: true });
          fs.rmSync(codexDir, { recursive: true, force: true });
        }
      },
    },
    {
      name: "executeCommand status does not treat legacy top-level profile as the active runtime route",
      async run() {
        const codexDir = makeTempCodexDir();
        fs.writeFileSync(path.join(codexDir, "config.toml"), 'profile = "alpha"\n', "utf8");
        fs.writeFileSync(
          path.join(codexDir, "auth.json"),
          `${JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "sk-alpha" }, null, 2)}\n`,
          "utf8"
        );

        const parsed = parseArgs(["status", "--codex-dir", codexDir, "--json"]);
        const result = await executeCommand(
          {
            command: parsed.command,
            options: parsed.globalOptions,
          },
          parsed
        );

        assert.equal(result.data.currentModelProvider, null);
        assert.ok(result.warnings.some((warning) => /no top-level model_provider/i.test(warning)));
      },
    },
    {
      name: "executeCommand add --copilot rejects install-copilot-sdk and points to login",
      async run() {
        const codexDir = makeTempCodexDir();
        fs.writeFileSync(
          path.join(codexDir, "config.toml"),
          ['profile = "alpha"', "", "[profiles.alpha]", 'model = "gpt-4o-mini"', 'model_provider = "alpha"', "", "[model_providers.alpha]", 'base_url = "https://alpha.example"', ""].join("\n"),
          "utf8"
        );
        const parsed = parseArgs([
          "add",
          "copilot-main",
          "--copilot",
          "--profile",
          "alpha",
          "--bridge-port",
          "41415",
          "--install-copilot-sdk",
          "--codex-dir",
          codexDir,
          "--json",
        ]);
        await assert.rejects(
          () =>
            executeCommand(
              {
                command: parsed.command,
                options: parsed.globalOptions,
              },
              parsed
            ),
          (error) => error && error.code === "INVALID_ARGUMENT" && /login copilot/i.test(error.message)
        );
      },
    },
    {
      name: "executeCommand add --copilot returns auth-required immediately in json mode without prompting",
      async run() {
        const codexDir = makeTempCodexDir();
        fs.writeFileSync(
          path.join(codexDir, "config.toml"),
          ['profile = "alpha"', "", "[profiles.alpha]", 'model = "gpt-4o-mini"', 'model_provider = "alpha"', "", "[model_providers.alpha]", 'base_url = "https://alpha.example"', ""].join("\n"),
          "utf8"
        );

        await withBrokenCopilotAuth(async () => {
          let prompted = false;
          const parsed = parseArgs([
            "add",
            "copilot-main",
            "--copilot",
            "--profile",
            "alpha",
            "--codex-dir",
            codexDir,
            "--json",
          ]);

          await assert.rejects(
            () =>
              executeCommand(
                {
                  command: parsed.command,
                  options: parsed.globalOptions,
                },
                parsed,
                {
                  isInteractive: () => true,
                  inputText: async () => "",
                  inputSecret: async () => "",
                  selectOne: async () => "",
                  selectMany: async () => [],
                  confirmAction: async () => {
                    prompted = true;
                    return true;
                  },
                  writeLine: () => {
                    prompted = true;
                  },
                }
              ),
            (error) => error && error.code === "COPILOT_AUTH_REQUIRED"
          );

          assert.equal(prompted, false);
          const providersPath = path.join(codexDir, "providers.json");
          assert.equal(fs.existsSync(providersPath), false);
        });
      },
    },
    {
      name: "executeCommand login copilot requires an interactive tty",
      async run() {
        const parsed = parseArgs(["login", "copilot", "--json"]);
        await assert.rejects(
          () =>
            executeCommand(
              {
                command: parsed.command,
                options: parsed.globalOptions,
              },
              parsed,
              {
                isInteractive: () => false,
                inputText: async () => "",
                inputSecret: async () => "",
                selectOne: async () => "",
                selectMany: async () => [],
                confirmAction: async () => false,
                writeLine: () => {},
              }
            ),
          (error) => error && error.code === "COPILOT_LOGIN_REQUIRES_TTY"
        );
      },
    },
    {
      name: "executeCommand login copilot fails clearly when neither bundled nor PATH copilot cli is available",
      async run() {
        const codexDir = makeTempCodexDir();
        await withBrokenCopilotAuth(async () => {
          setCopilotCliSpawnImplementation(() => ({
            error: new Error("copilot missing"),
            status: 1,
            stdout: "",
            stderr: "",
            signal: null,
            pid: 0,
            output: ["", ""],
          }));

          try {
            const parsed = parseArgs(["login", "copilot", "--codex-dir", codexDir]);
            await assert.rejects(
              () =>
                executeCommand(
                  {
                    command: parsed.command,
                    options: parsed.globalOptions,
                  },
                  parsed,
                  {
                    isInteractive: () => true,
                    inputText: async () => "",
                    inputSecret: async () => "",
                    selectOne: async () => "",
                    selectMany: async () => [],
                    confirmAction: async () => true,
                    writeLine: () => {},
                  }
                ),
              (error) => error && error.code === "COPILOT_CLI_MISSING"
            );
          } finally {
            resetCopilotCliSpawnImplementation();
          }
        });
      },
    },
    {
      name: "executeCommand login copilot prefers the bundled runtime cli before PATH lookup",
      async run() {
        const codexDir = makeTempCodexDir();
        await withBrokenCopilotAuth(async () => {
          writeBundledCopilotShim(process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR);
          const spawnCalls = [];
          setCopilotCliSpawnImplementation((command, args, options) => {
            spawnCalls.push({ command, args, options });
            return {
              error: null,
              status: 0,
              stdout: "",
              stderr: "",
              signal: null,
              pid: 0,
              output: ["", ""],
            };
          });

          try {
            const parsed = parseArgs(["login", "copilot", "--codex-dir", codexDir]);
            await assert.rejects(
              () =>
                executeCommand(
                  {
                    command: parsed.command,
                    options: parsed.globalOptions,
                  },
                  parsed,
                  {
                    isInteractive: () => true,
                    inputText: async () => "",
                    inputSecret: async () => "",
                    selectOne: async () => "",
                    selectMany: async () => [],
                    confirmAction: async () => true,
                    writeLine: () => {},
                  }
                ),
              (error) => error && error.code === "COPILOT_LOGIN_RECHECK_FAILED"
            );
            assert.equal(spawnCalls.length, 2);
            if (process.platform === "win32") {
              assert.ok(String(spawnCalls[0].command).includes(path.join("node_modules", ".bin", "copilot.cmd")));
              assert.ok(String(spawnCalls[1].command).includes(path.join("node_modules", ".bin", "copilot.cmd")));
              assert.deepEqual(spawnCalls[0].args, ["--help"]);
              assert.deepEqual(spawnCalls[1].args, ["login"]);
              assert.equal(spawnCalls[0].options.shell, true);
              assert.equal(spawnCalls[1].options.shell, true);
            } else {
              assert.ok(String(spawnCalls[0].command).endsWith(path.join(".bin", "copilot")));
              assert.ok(String(spawnCalls[1].command).endsWith(path.join(".bin", "copilot")));
              assert.deepEqual(spawnCalls[0].args, ["--help"]);
              assert.deepEqual(spawnCalls[1].args, ["login"]);
              assert.equal(spawnCalls[0].options.shell, false);
              assert.equal(spawnCalls[1].options.shell, false);
            }
          } finally {
            resetCopilotCliSpawnImplementation();
          }
        });
      },
    },
    {
      name: "executeCommand switch rejects install-copilot-sdk outside add --copilot",
      async run() {
        const codexDir = makeTempCodexDir();
        writeProviders(codexDir, {
          alpha: {
            profile: "alpha",
            apiKey: "sk-alpha",
          },
        });
        fs.writeFileSync(
          path.join(codexDir, "config.toml"),
          ['profile = "alpha"', "", "[profiles.alpha]", 'model = "gpt-4o-mini"', 'model_provider = "alpha"', "", "[model_providers.alpha]", 'base_url = "https://alpha.example"', ""].join("\n"),
          "utf8"
        );
        fs.writeFileSync(path.join(codexDir, "auth.json"), `${JSON.stringify({ auth_mode: "apikey", ALPHA_API_KEY: "sk-alpha" }, null, 2)}\n`, "utf8");

        const parsed = parseArgs(["switch", "alpha", "--install-copilot-sdk", "--codex-dir", codexDir, "--json"]);
        await assert.rejects(
          () =>
            executeCommand(
              {
                command: parsed.command,
                options: parsed.globalOptions,
              },
              parsed
            ),
          (error) =>
            error &&
            error.code === "INVALID_ARGUMENT" &&
            /login copilot/i.test(error.message)
        );
      },
    },
    {
      name: "executeCommand setup returns a structured deprecation error",
      async run() {
        const codexDir = makeTempCodexDir();
        const parsed = parseArgs(["setup", "--codex-dir", codexDir, "--json"]);

        await assert.rejects(
          () =>
            executeCommand(
              {
                command: parsed.command,
                options: parsed.globalOptions,
              },
              parsed
            ),
          (error) =>
            error &&
            error.code === "COMMAND_DEPRECATED" &&
            /split into init and migrate/.test(error.message) &&
            Array.isArray(error.details.replacements) &&
            error.details.replacements.includes("init") &&
            error.details.replacements.includes("migrate")
        );
      },
    },
    {
      name: "executeCommand dispatches bridge start status and stop through the shared registry",
      async run() {
        await withFakeCopilotSdk(async () => {
          const codexDir = makeTempCodexDir();
          const bridgePort = await getFreePort();
          writeBridgeFixture(codexDir, bridgePort);

          const startParsed = parseArgs(["bridge", "start", "copilot-main", "--codex-dir", codexDir, "--json"]);
          const started = await executeCommand(
            {
              command: startParsed.command,
              options: startParsed.globalOptions,
            },
            startParsed
          );
          assert.equal(started.data.provider, "copilot-main");

          const statusParsed = parseArgs(["bridge", "status", "copilot-main", "--codex-dir", codexDir, "--json"]);
          const status = await executeCommand(
            {
              command: statusParsed.command,
              options: statusParsed.globalOptions,
            },
            statusParsed
          );
          assert.equal(status.data.provider, "copilot-main");
          assert.equal(status.data.health.ok, true);

          const stopParsed = parseArgs(["bridge", "stop", "copilot-main", "--codex-dir", codexDir, "--json"]);
          const stopped = await executeCommand(
            {
              command: stopParsed.command,
              options: stopParsed.globalOptions,
            },
            stopParsed
          );
          assert.equal(stopped.data.provider, "copilot-main");
          assert.equal(stopped.data.stopped, true);
          assert.equal(readCopilotBridgeState(), null);
        });
      },
    },
    {
      name: "unknown help topics keep the help command name in JSON envelopes",
      run() {
        const rendered = renderFailure(
          { command: "help", options: { json: true, codexDir: process.cwd() } },
          {
            code: "INVALID_ARGUMENT",
            message: "Unknown help topic: nope",
            details: {
              availableCommands: ["config show", "config list-profiles"],
            },
          }
        );

        assert.equal(rendered.exitCode, 1);
        assert.equal(rendered.stderr.length, 1);
        const payload = JSON.parse(rendered.stderr[0]);
        assert.equal(payload.command, "help");
        assert.equal(payload.ok, false);
        assert.equal(payload.error.message, "Unknown help topic: nope");
        assert.deepEqual(payload.error.details.availableCommands, ["config show", "config list-profiles"]);
      },
    },
  ],
};
