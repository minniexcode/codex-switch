"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const { addProvider } = require("../dist/app/add-provider.js");
const { editProvider } = require("../dist/app/edit-provider.js");
const { exportProviders } = require("../dist/app/export-providers.js");
const { getStatus } = require("../dist/app/get-status.js");
const { initCodex } = require("../dist/app/init-codex.js");
const { importProviders } = require("../dist/app/import-providers.js");
const { listBackupEntries } = require("../dist/app/list-backups.js");
const { listProviders } = require("../dist/app/list-providers.js");
const { migrateCodex } = require("../dist/app/setup-codex.js");
const { removeProvider } = require("../dist/app/remove-provider.js");
const { rollbackBackup } = require("../dist/app/rollback-backup.js");
const { runDoctor } = require("../dist/app/run-doctor.js");
const { showConfig } = require("../dist/app/show-config.js");
const { startBridge, stopBridge, statusBridge } = require("../dist/app/bridge.js");
const { switchProvider } = require("../dist/app/switch-provider.js");
const { readCurrentProfile } = require("../dist/storage/config-repo.js");
const { createCodexPaths } = require("../dist/storage/codex-paths.js");
const { readProvidersFile } = require("../dist/storage/providers-repo.js");
const { readCopilotBridgeState, writeCopilotBridgeState } = require("../dist/storage/runtime-state-repo.js");
const { stopCopilotBridge, startCopilotBridgeServer } = require("../dist/runtime/copilot-bridge.js");
const { executeCommand } = require("../dist/commands/dispatch.js");
const { parseArgs } = require("../dist/commands/args.js");
const {
  setCodexSpawnImplementation,
  resetCodexSpawnImplementation,
} = require("../dist/runtime/codex-cli.js");

function makeFixture() {
  const codexDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-workflows-"));
  process.env.CODEXS_HOME = codexDir;
  const paths = createCodexPaths({ codexDir, toolHomeDir: codexDir });
  fs.mkdirSync(paths.codexDir, { recursive: true });
  fs.mkdirSync(paths.backupsDir, { recursive: true });
  fs.writeFileSync(paths.authPath, `${JSON.stringify({ auth_mode: "apikey", ALPHA_API_KEY: "sk-alpha" }, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    paths.configPath,
    [
      'model = "gpt-4o-mini"',
      'model_provider = "alpha"',
      "",
      "[profiles.alpha]",
      'model = "gpt-4o-mini"',
      'model_provider = "alpha"',
      "",
      "[profiles.beta]",
      'model = "gpt-4o-mini"',
      'model_provider = "beta"',
      "",
      "[model_providers.alpha]",
      'base_url = "https://alpha.example"',
      "",
      "[model_providers.beta]",
      'base_url = "https://beta.example"',
      "",
      "[model_providers.gamma]",
      'base_url = "https://gamma.example"',
      "",
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    paths.providersPath,
    `${JSON.stringify(
        {
          providers: {
            alpha: { profile: "alpha", apiKey: "sk-alpha" },
            beta: { profile: "beta", apiKey: "sk-beta" },
          },
        },
      null,
      2
    )}\n`,
    "utf8"
  );
  return paths;
}

function withCodexAvailable(run) {
  setCodexSpawnImplementation(() => ({
    error: null,
    status: 0,
    stdout: "codex 0.134.0",
    stderr: "",
  }));
  try {
    const result = run();
    if (result && typeof result.then === "function") {
      return result.finally(() => {
        resetCodexSpawnImplementation();
      });
    }
    resetCodexSpawnImplementation();
    return result;
  } finally {
    if (false) {
      resetCodexSpawnImplementation();
    }
  }
}

function withFakeCopilotSdk(run) {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-copilot-runtime-"));
  const packageDir = path.join(runtimeDir, "node_modules", "@github", "copilot-sdk");
  const previousRuntimeDir = process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
  const previousStateDir = process.env.CODEX_SWITCH_RUNTIME_STATE_DIR;
  const stateDir = path.join(runtimeDir, "state");
  fs.mkdirSync(packageDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, "package.json"),
    `${JSON.stringify({ name: "@github/copilot-sdk", version: "0.0.0-test" }, null, 2)}\n`,
    "utf8"
  );
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
    const result = run(runtimeDir);
    if (result && typeof result.then === "function") {
      return result.finally(() => {
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
      delete process.env.CODEX_SWITCH_COPILOT_RUNTIME_DIR;
    }
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

function installFakeCopilotSdkAt(runtimesDir) {
  const packageDir = path.join(runtimesDir, "copilot", "node_modules", "@github", "copilot-sdk");
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

module.exports = {
  name: "workflows",
  tests: [
    {
      name: "init is idempotent and succeeds without config.toml or auth.json",
      run() {
        const codexDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-init-"));
        const toolHomeDir = codexDir;
        const providersPath = path.join(toolHomeDir, "providers.json");
        const toolConfigPath = path.join(toolHomeDir, "codex-switch.json");

        const first = initCodex({
          toolHomeDir,
          toolConfigPath,
          providersPath,
          version: "0.0.10-test",
          defaultCodexDir: null,
        });
        assert.equal(first.data.createdToolHomeDir, false);
        assert.equal(first.data.createdToolConfigFile, true);
        assert.equal(first.data.createdProvidersFile, true);
        assert.equal(first.data.providersAlreadyExisted, false);

        const second = initCodex({
          toolHomeDir,
          toolConfigPath,
          providersPath,
          version: "0.0.10-test",
          defaultCodexDir: null,
        });
        assert.equal(second.data.createdToolConfigFile, false);
        assert.equal(second.data.createdProvidersFile, false);
        assert.equal(second.data.providersAlreadyExisted, true);
        assert.deepEqual(JSON.parse(fs.readFileSync(providersPath, "utf8")), { providers: {} });
      },
    },
    {
      name: "status data storage and doctor issue codes stay stable for direct workflow state",
      async run() {
        const paths = makeFixture();
        const status = await withCodexAvailable(() =>
          getStatus(paths.codexDir, paths.configPath, paths.providersPath, paths.authPath)
        );
        assert.equal(status.data.storage.toolHome.root, paths.toolHomeDir);
        assert.equal(status.data.storage.targetRuntime.root, paths.codexDir);
        assert.equal(typeof status.data.currentModelProvider, "string");

        const doctor = await withCodexAvailable(() =>
          runDoctor({
            codexDir: paths.codexDir,
            configPath: paths.configPath,
            providersPath: paths.providersPath,
            authPath: paths.authPath,
          })
        );
        assert.ok(Array.isArray(doctor.data.issues));
        assert.ok(doctor.data.issues.every((issue) => typeof issue.code === "string"));
      },
    },
    {
      name: "status leaves provider unresolved when the active profile is shared by multiple providers",
      async run() {
        const paths = makeFixture();
        fs.writeFileSync(
          paths.providersPath,
          `${JSON.stringify(
            {
              providers: {
                alpha: { profile: "alpha", apiKey: "sk-alpha" },
                alphaReplica: { profile: "alpha", apiKey: "sk-alpha-replica" },
                beta: { profile: "beta", apiKey: "sk-beta" },
              },
            },
            null,
            2
          )}\n`,
          "utf8"
        );

        const status = await withCodexAvailable(() =>
          getStatus(paths.codexDir, paths.configPath, paths.providersPath, paths.authPath)
        );
        assert.equal(status.data.currentModelProvider, "alpha");
        assert.equal(status.data.currentModelProviderMapped, true);
        assert.equal(status.data.provider, null);
        assert.equal(status.data.activeProviderResolvable, false);
        assert.deepEqual(status.data.activeProviderCandidates, ["alpha", "alphaReplica"]);
        assert.equal(status.data.liveState.reason, "shared-profile");
        assert.ok(status.warnings.some((warning) => /cannot be resolved uniquely/i.test(warning)));

        const listed = listProviders(paths.providersPath, paths.configPath);
        assert.equal(listed.data.currentModelProvider, "alpha");
        assert.equal(listed.data.activeProvider, null);
        assert.equal(listed.data.activeProviderResolvable, false);
        assert.deepEqual(listed.data.activeProviderCandidates, ["alpha", "alphaReplica"]);
        assert.ok(listed.data.providers.every((provider) => provider.isActive === false));
      },
    },
    {
      name: "status collects config and copilot runtime health signals instead of reporting ok optimistically",
      async run() {
        const paths = makeFixture();
        fs.writeFileSync(
          paths.providersPath,
          `${JSON.stringify(
            {
              providers: {
                copilot: {
                  profile: "alpha",
                  apiKey: "copilot-placeholder",
                  baseUrl: "http://127.0.0.1:4010/v1",
                  runtime: {
                    kind: "copilot-sdk-bridge",
                    upstream: "github-copilot",
                    bridgeHost: "127.0.0.1",
                    bridgePort: 4010,
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

        const status = await withCodexAvailable(() =>
          getStatus(paths.codexDir, paths.configPath, paths.providersPath, paths.authPath, {
            runtimesDir: path.join(paths.toolHomeDir, "missing-runtimes"),
          })
        );
        assert.equal(status.data.provider, "copilot");
        assert.equal(status.data.copilotSdk.installed, false);
        assert.equal(status.data.copilotAuth.ready, false);
        assert.ok(Array.isArray(status.data.issues));
      },
    },
    {
      name: "init still succeeds in non-interactive mode when the target codex directory is missing",
      async run() {
        const missingCodexDir = path.join(os.tmpdir(), `codex-switch-missing-${Date.now()}-${Math.random().toString(16).slice(2)}`);
        const parsed = parseArgs(["init", "--codex-dir", missingCodexDir, "--json"]);
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
        assert.equal(result.data.createdToolConfigFile, true);
        assert.equal(result.data.createdProvidersFile, false);
      },
    },
    {
      name: "migrate fails before TTY handling when no adoptable profiles are available",
      async run() {
        const paths = makeFixture();
        const parsed = parseArgs(["migrate", "--codex-dir", paths.codexDir, "--overwrite", "--json"]);

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
          (error) =>
            error &&
            error.code === "MIGRATE_NO_ADOPTABLE_PROFILES" &&
            Array.isArray(error.details.availableProfiles) &&
            Array.isArray(error.details.adoptableProfiles) &&
            error.details.adoptableProfiles.length === 0
        );
      },
    },
    {
      name: "migrate reports blocking reasons for broken unmanaged profiles before interactive prompts",
      async run() {
        const paths = makeFixture();
        fs.writeFileSync(
          paths.providersPath,
          `${JSON.stringify({ providers: {} }, null, 2)}\n`,
          "utf8"
        );
        fs.writeFileSync(
          paths.configPath,
          [
            'profile = "broken"',
            "",
            "[profiles.broken]",
            'model_provider = "wrong-name"',
            "",
          ].join("\n"),
          "utf8"
        );
        const parsed = parseArgs(["migrate", "--codex-dir", paths.codexDir, "--json"]);

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
          (error) =>
            error &&
            error.code === "MIGRATE_NO_ADOPTABLE_PROFILES" &&
            error.details.blockingReasonsByProfile.broken.includes("model is missing.") &&
            error.details.blockingReasonsByProfile.broken.includes('model_provider must match the profile name "broken".') &&
            error.details.blockingReasonsByProfile.broken.includes("model_providers.wrong-name section is missing.")
        );
      },
    },
    {
      name: "migrate adopts unmanaged profiles using runtime base_url metadata and interactive apiKey input",
      async run() {
        const paths = makeFixture();
        fs.writeFileSync(
          paths.configPath,
          [
            'profile = "freemodel"',
            "",
            "[profiles.freemodel]",
            'model = "gpt-5.4"',
            'model_provider = "freemodel"',
            "",
            "[profiles.packycode]",
            'model = "gpt-5.4"',
            'model_provider = "packycode"',
            "",
            "[model_providers.freemodel]",
            'base_url = "https://free.example/v1"',
            "",
            "[model_providers.packycode]",
            'base_url = "https://paid.example/v1"',
            "",
          ].join("\n"),
          "utf8"
        );
        fs.writeFileSync(
          paths.providersPath,
          `${JSON.stringify({ providers: { alpha: { profile: "alpha", apiKey: "sk-alpha" } } }, null, 2)}\n`,
          "utf8"
        );
        const authBefore = fs.readFileSync(paths.authPath, "utf8");
        const parsed = parseArgs(["migrate", "--codex-dir", paths.codexDir, "--merge"]);
        const textAnswers = ["", "", "", "", "", ""];
        const secretAnswers = ["sk-freemodel", "sk-packycode"];

        const result = await withCodexAvailable(() =>
          executeCommand(
            {
              command: parsed.command,
              options: parsed.globalOptions,
            },
            parsed,
            {
              isInteractive: () => true,
              inputText: async () => textAnswers.shift() ?? "",
              inputSecret: async () => secretAnswers.shift() ?? "",
              selectOne: async () => "",
              selectMany: async (message) => {
                if (message === "Choose unmanaged config profiles to adopt into providers.json.") {
                  return ["freemodel", "packycode"];
                }
                if (message === "Select tags (optional)") {
                  return [];
                }
                return [];
              },
              confirmAction: async () => true,
              writeLine: () => {},
            }
          )
        );

        assert.equal(result.data.providersInitialized, 2);
        const providers = readProvidersFile(paths.providersPath).providers;
        assert.equal(providers.freemodel.apiKey, "sk-freemodel");
        assert.equal(providers.packycode.apiKey, "sk-packycode");
        assert.equal(providers.freemodel.baseUrl, "https://free.example/v1");
        assert.equal(providers.packycode.baseUrl, "https://paid.example/v1");
        assert.equal(fs.readFileSync(paths.authPath, "utf8"), authBefore);
      },
    },
    {
      name: "migrate use case preserves adopt flow and doctor payload",
      async run() {
        const paths = makeFixture();
        fs.writeFileSync(
          paths.configPath,
          [
            'profile = "freemodel"',
            "",
            "[profiles.freemodel]",
            'model = "gpt-5.4"',
            'model_provider = "freemodel"',
            "",
            "[model_providers.freemodel]",
            'base_url = "https://free.example/v1"',
            "",
          ].join("\n"),
          "utf8"
        );
        fs.writeFileSync(paths.providersPath, `${JSON.stringify({ providers: {} }, null, 2)}\n`, "utf8");
        fs.writeFileSync(paths.authPath, `${JSON.stringify({ auth_mode: "apikey", FREEMODEL_API_KEY: "sk-old" }, null, 2)}\n`, "utf8");
        const authBefore = fs.readFileSync(paths.authPath, "utf8");

        const result = await withCodexAvailable(() =>
          migrateCodex({
            codexDir: paths.codexDir,
            lockPath: paths.lockPath,
            configPath: paths.configPath,
            providersPath: paths.providersPath,
            authPath: paths.authPath,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            strategy: "overwrite",
            adoptProfiles: ["freemodel"],
            providerDetailsByProfile: {
              freemodel: {
                providerName: "freemodel",
                apiKey: "sk-freemodel",
                baseUrl: "https://free.example/v1",
              },
            },
          })
        );

        assert.equal(result.data.providersInitialized, 1);
        assert.equal(result.data.strategy, "overwrite");
        assert.deepEqual(result.data.adoptedProfiles, ["freemodel"]);
        assert.equal(result.data.doctor.healthy, true);
        assert.equal(readProvidersFile(paths.providersPath).providers.freemodel.baseUrl, "https://free.example/v1");
        assert.equal(fs.readFileSync(paths.authPath, "utf8"), authBefore);
      },
    },
    {
      name: "migrate adopts runtime base_url without env-key coupling",
      async run() {
        const paths = makeFixture();
        fs.writeFileSync(
          paths.configPath,
          [
            'profile = "freemodel"',
            "",
            "[profiles.freemodel]",
            'model = "gpt-5.4"',
            'model_provider = "freemodel"',
            "",
            "[model_providers.freemodel]",
            'base_url = "https://free.example/v1"',
            "",
          ].join("\n"),
          "utf8"
        );
        fs.writeFileSync(paths.providersPath, `${JSON.stringify({ providers: {} }, null, 2)}\n`, "utf8");

        await withCodexAvailable(() =>
          migrateCodex({
            codexDir: paths.codexDir,
            lockPath: paths.lockPath,
            configPath: paths.configPath,
            providersPath: paths.providersPath,
            authPath: paths.authPath,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            strategy: "overwrite",
            adoptProfiles: ["freemodel"],
            providerDetailsByProfile: {
              freemodel: {
                providerName: "freemodel",
                apiKey: "sk-freemodel",
                baseUrl: "https://free.example/v1",
              },
            },
          })
        );

        assert.equal(readProvidersFile(paths.providersPath).providers.freemodel.baseUrl, "https://free.example/v1");
      },
    },
    {
      name: "migrate skips strategy prompt when providers.json exists but the registry is empty",
      async run() {
        const paths = makeFixture();
        fs.writeFileSync(
          paths.configPath,
          [
            'profile = "freemodel"',
            "",
            "[profiles.freemodel]",
            'model = "gpt-5.4"',
            'model_provider = "freemodel"',
            "",
            "[model_providers.freemodel]",
            'base_url = "https://free.example/v1"',
            "",
          ].join("\n"),
          "utf8"
        );
        fs.writeFileSync(paths.providersPath, `${JSON.stringify({ providers: {} }, null, 2)}\n`, "utf8");
        const parsed = parseArgs(["migrate", "--codex-dir", paths.codexDir]);
        let strategyPromptCount = 0;

        const result = await withCodexAvailable(() =>
          executeCommand(
            {
              command: parsed.command,
              options: parsed.globalOptions,
            },
            parsed,
            {
              isInteractive: () => true,
              inputText: async () => "",
              inputSecret: async () => "sk-freemodel",
              selectOne: async () => {
                strategyPromptCount += 1;
                return "overwrite";
              },
              selectMany: async (message) => {
                if (message === "Choose unmanaged config profiles to adopt into providers.json.") {
                  return ["freemodel"];
                }
                if (message === "Select tags (optional)") {
                  return [];
                }
                return [];
              },
              confirmAction: async () => true,
              writeLine: () => {},
            }
          )
        );

        assert.equal(strategyPromptCount, 0);
        assert.equal(result.data.strategy, "overwrite");
        assert.ok(readProvidersFile(paths.providersPath).providers.freemodel);
      },
    },
    {
      name: "config show and doctor stay stable on a healthy workspace",
      async run() {
        const paths = makeFixture();
        const configResult = showConfig({
          configPath: paths.configPath,
          providersPath: paths.providersPath,
        });
        assert.equal(configResult.data.currentModelProvider, "alpha");
        assert.equal(configResult.data.profiles.length, 2);

        const doctorResult = await withCodexAvailable(() =>
          runDoctor({
            codexDir: paths.codexDir,
            configPath: paths.configPath,
            providersPath: paths.providersPath,
            authPath: paths.authPath,
          })
        );
        assert.equal(doctorResult.data.healthy, true);
        assert.deepEqual(doctorResult.data.issues, []);

        const statusResult = await withCodexAvailable(() =>
          getStatus(paths.codexDir, paths.configPath, paths.providersPath, paths.authPath)
        );
        assert.deepEqual(statusResult.data.auth, {
          exists: true,
          valid: true,
          parseError: null,
          authMode: "apikey",
        });
        const expectedBackupsDir = path.join(paths.toolHomeDir, "backups");
        assert.deepEqual(statusResult.data.storage, {
          toolHome: {
            root: paths.toolHomeDir,
            toolConfig: path.join(paths.toolHomeDir, "codex-switch.json"),
            providers: paths.providersPath,
            backupsDir: expectedBackupsDir,
            latestBackup: paths.latestBackupPath,
            runtimeStateDir: paths.runtimeDir,
            runtimeInstallDir: paths.runtimesDir,
          },
          targetRuntime: {
            root: paths.codexDir,
            config: paths.configPath,
            auth: paths.authPath,
          },
          managementSSOT: {
            scope: "toolHome",
            path: paths.providersPath,
          },
          runtimeMirrors: [
            {
              scope: "targetRuntime",
              path: paths.configPath,
            },
          ],
          authStateFile: {
            scope: "targetRuntime",
            path: paths.authPath,
          },
          rollbackState: {
            scope: "toolHome",
            path: paths.latestBackupPath,
          },
          runtimeState: {
            scope: "toolHome",
            path: paths.runtimeDir,
            managedBackup: false,
          },
          runtimeInstall: {
            scope: "toolHome",
            path: paths.runtimesDir,
            managedBackup: false,
          },
        });
      },
    },
    {
      name: "add edit and remove mutate providers and managed profiles under backup flow",
      async run() {
        const paths = makeFixture();

        const added = await addProvider({
          toolHomeDir: paths.toolHomeDir,
          lockPath: paths.lockPath,
          runtimesDir: paths.runtimesDir,
          codexDir: paths.codexDir,
          backupsDir: paths.backupsDir,
          latestBackupPath: paths.latestBackupPath,
          providersPath: paths.providersPath,
          configPath: paths.configPath,
          authPath: paths.authPath,
          providerName: "gamma",
          profile: "gamma",
          apiKey: "sk-gamma",
          model: "gpt-4o-mini",
          tags: [],
          createProfile: true,
        });
        assert.deepEqual(added.data.createdProfileSections, []);
        assert.ok(readProvidersFile(paths.providersPath).providers.gamma);
        assert.equal(readProvidersFile(paths.providersPath).providers.gamma.baseUrl, undefined);
        assert.match(fs.readFileSync(paths.configPath, "utf8"), /\[model_providers\.gamma\]/);

        const edited = editProvider({
          codexDir: paths.codexDir,
          lockPath: paths.lockPath,
          backupsDir: paths.backupsDir,
          latestBackupPath: paths.latestBackupPath,
          providersPath: paths.providersPath,
          configPath: paths.configPath,
          authPath: paths.authPath,
          providerName: "gamma",
          note: "primary",
          tags: ["paid"],
        });
        assert.deepEqual(edited.data.updatedFields, ["note", "tags"]);
        assert.equal(readProvidersFile(paths.providersPath).providers.gamma.note, "primary");

        const removed = removeProvider({
          codexDir: paths.codexDir,
          lockPath: paths.lockPath,
          backupsDir: paths.backupsDir,
          latestBackupPath: paths.latestBackupPath,
          providersPath: paths.providersPath,
          configPath: paths.configPath,
          providerName: "gamma",
        });
        assert.deepEqual(removed.data.deletedProfileSections, []);
        assert.equal(readProvidersFile(paths.providersPath).providers.gamma, undefined);
        assert.doesNotMatch(fs.readFileSync(paths.configPath, "utf8"), /\[model_providers\.gamma\]/);
      },
    },
    {
      name: "add can create a brand-new profile and runtime section together",
      async run() {
        const paths = makeFixture();

        const added = await addProvider({
          toolHomeDir: paths.toolHomeDir,
          lockPath: paths.lockPath,
          runtimesDir: paths.runtimesDir,
          codexDir: paths.codexDir,
          backupsDir: paths.backupsDir,
          latestBackupPath: paths.latestBackupPath,
          providersPath: paths.providersPath,
          configPath: paths.configPath,
          authPath: paths.authPath,
          providerName: "delta",
          profile: "delta",
          apiKey: "sk-delta",
          model: "gpt-4o-mini",
          baseUrl: "https://delta.example",
          tags: ["paid"],
          createProfile: true,
        });
        assert.deepEqual(added.data.createdProfileSections, []);
        assert.deepEqual(added.data.createdModelProviderSections, ["delta"]);
        const providers = readProvidersFile(paths.providersPath).providers;
        assert.equal(providers.delta.baseUrl, "https://delta.example");
        const config = fs.readFileSync(paths.configPath, "utf8");
        assert.match(config, /\[model_providers\.delta\]/);
        assert.match(config, /base_url = "https:\/\/delta\.example"/);
      },
    },
    {
      name: "switch updates auth.json for direct providers and rollback restores it",
      async run() {
        const paths = makeFixture();
        fs.writeFileSync(paths.authPath, `${JSON.stringify({ auth_mode: "apikey", ALPHA_API_KEY: "sk-alpha", user: { id: "dev" } }, null, 2)}\n`, "utf8");
        const authBeforeSwitch = fs.readFileSync(paths.authPath, "utf8");

        const switched = await switchProvider({
          codexDir: paths.codexDir,
          lockPath: paths.lockPath,
          backupsDir: paths.backupsDir,
          latestBackupPath: paths.latestBackupPath,
          configPath: paths.configPath,
          providersPath: paths.providersPath,
          authPath: paths.authPath,
          providerName: "beta",
        });
        assert.equal(switched.data.profile, "beta");
        assert.equal(readCurrentProfile(paths.configPath), "beta");
        const authAfterSwitch = JSON.parse(fs.readFileSync(paths.authPath, "utf8"));
        assert.equal(authAfterSwitch.auth_mode, "apikey");
        assert.equal(authAfterSwitch.OPENAI_API_KEY, "sk-beta");
        assert.equal(authAfterSwitch.user.id, "dev");
        assert.ok(fs.existsSync(paths.latestBackupPath));

        const rolledBack = rollbackBackup({
          latestBackupPath: paths.latestBackupPath,
          backupsDir: paths.backupsDir,
        });
        assert.ok(Array.isArray(rolledBack.data.restoredFiles));
        assert.equal(rolledBack.data.backupId, null);
        assert.equal(typeof rolledBack.data.backupPath, "string");
        assert.equal(readCurrentProfile(paths.configPath), "alpha");
        assert.equal(fs.readFileSync(paths.authPath, "utf8"), authBeforeSwitch);

        const backups = listBackupEntries(paths.backupsDir);
        assert.ok(Array.isArray(backups.data.backups));
        assert.ok(backups.data.backups.length >= 1);
        assert.deepEqual(
          Object.keys(backups.data.backups[0]).sort(),
          ["backupId", "backupPath", "createdAt", "files", "reason"]
        );
      },
    },
    {
      name: "switch does not inherit model from a legacy profile section anymore",
      async run() {
        const paths = makeFixture();
        fs.writeFileSync(
          paths.providersPath,
          `${JSON.stringify({ providers: { beta: { profile: "beta", apiKey: "sk-beta", baseUrl: "https://beta.example" } } }, null, 2)}\n`,
          "utf8"
        );
        fs.writeFileSync(
          paths.configPath,
          [
            'model_provider = "alpha"',
            "",
            "[profiles.beta]",
            'model = "gpt-4o-mini"',
            'model_provider = "beta"',
            "",
            "[model_providers.beta]",
            'base_url = "https://beta.example"',
            'name = "beta"',
            "requires_openai_auth = true",
            'wire_api = "responses"',
            "",
          ].join("\n"),
          "utf8"
        );

        await assert.rejects(
          () =>
            switchProvider({
              codexDir: paths.codexDir,
              lockPath: paths.lockPath,
              backupsDir: paths.backupsDir,
              latestBackupPath: paths.latestBackupPath,
              configPath: paths.configPath,
              providersPath: paths.providersPath,
              authPath: paths.authPath,
              providerName: "beta",
            }),
          (error) => error && error.code === "MANAGED_PROFILE_FIELDS_MISSING"
        );
      },
    },
    {
      name: "switch uses the tool-home lock path instead of creating a codexDir fallback lock",
      async run() {
        const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-lock-home-"));
        const codexDir = path.join(rootDir, ".codex-runtime");
        const toolHomeDir = path.join(rootDir, ".codex-switch");
        const paths = createCodexPaths({ codexDir, toolHomeDir });
        fs.mkdirSync(paths.codexDir, { recursive: true });
        fs.mkdirSync(paths.toolHomeDir, { recursive: true });
        fs.mkdirSync(paths.backupsDir, { recursive: true });
        fs.writeFileSync(paths.providersPath, `${JSON.stringify({ providers: { beta: { profile: "beta", apiKey: "sk-beta" } } }, null, 2)}\n`, "utf8");
        fs.writeFileSync(
          paths.configPath,
          [
            'profile = "alpha"',
            "",
            "[profiles.alpha]",
            'model = "gpt-4o-mini"',
            'model_provider = "alpha"',
            "",
            "[model_providers.alpha]",
            'base_url = "https://alpha.example"',
            "",
            "[profiles.beta]",
            'model = "gpt-4o-mini"',
            'model_provider = "beta"',
            "",
            "[model_providers.beta]",
            'base_url = "https://beta.example"',
            "",
          ].join("\n"),
          "utf8"
        );
        fs.writeFileSync(paths.authPath, `${JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "sk-alpha" }, null, 2)}\n`, "utf8");

        const switched = await switchProvider({
          codexDir: paths.codexDir,
          lockPath: paths.lockPath,
          backupsDir: paths.backupsDir,
          latestBackupPath: paths.latestBackupPath,
          configPath: paths.configPath,
          providersPath: paths.providersPath,
          authPath: paths.authPath,
          providerName: "beta",
        });

        assert.equal(switched.data.profile, "beta");
        assert.equal(fs.existsSync(paths.lockPath), false);
        assert.equal(fs.existsSync(path.join(paths.codexDir, ".codex-switch.lock")), false);
      },
    },
    {
      name: "add rollback restores providers.json and config.toml to separate tool and codex roots",
      async run() {
        const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-dual-root-"));
        const codexDir = path.join(rootDir, ".codex-runtime");
        const toolHomeDir = path.join(rootDir, ".codex-switch");
        process.env.CODEXS_HOME = toolHomeDir;
        const paths = createCodexPaths({ codexDir, toolHomeDir });
        fs.mkdirSync(paths.codexDir, { recursive: true });
        fs.mkdirSync(paths.toolHomeDir, { recursive: true });
        fs.mkdirSync(paths.backupsDir, { recursive: true });
        fs.writeFileSync(paths.authPath, `${JSON.stringify({ auth_mode: "apikey", ALPHA_API_KEY: "sk-alpha" }, null, 2)}\n`, "utf8");
        fs.writeFileSync(
          paths.configPath,
          [
            'profile = "alpha"',
            "",
            "[profiles.alpha]",
            'model = "gpt-4o-mini"',
            'model_provider = "alpha"',
            "",
            "[model_providers.alpha]",
            'base_url = "https://alpha.example"',
            "",
          ].join("\n"),
          "utf8"
        );
        const providersBefore = `${JSON.stringify({ providers: { alpha: { profile: "alpha", apiKey: "sk-alpha" } } }, null, 2)}\n`;
        const configBefore = fs.readFileSync(paths.configPath, "utf8");
        fs.writeFileSync(paths.providersPath, providersBefore, "utf8");

        await addProvider({
          toolHomeDir: paths.toolHomeDir,
          lockPath: paths.lockPath,
          runtimesDir: paths.runtimesDir,
          codexDir: paths.codexDir,
          backupsDir: paths.backupsDir,
          latestBackupPath: paths.latestBackupPath,
          providersPath: paths.providersPath,
          configPath: paths.configPath,
          authPath: paths.authPath,
          providerName: "beta",
          profile: "beta",
          apiKey: "sk-beta",
          model: "gpt-4o-mini",
          baseUrl: "https://beta.example",
          tags: [],
          createProfile: true,
        });

        assert.notEqual(fs.readFileSync(paths.providersPath, "utf8"), providersBefore);
        assert.notEqual(fs.readFileSync(paths.configPath, "utf8"), configBefore);

        const rolledBack = rollbackBackup({
          latestBackupPath: paths.latestBackupPath,
          backupsDir: paths.backupsDir,
        });
        assert.ok(Array.isArray(rolledBack.data.restoredFiles));
        assert.equal(fs.readFileSync(paths.providersPath, "utf8"), providersBefore);
        assert.equal(fs.readFileSync(paths.configPath, "utf8"), configBefore);
        assert.equal(fs.existsSync(path.join(paths.toolHomeDir, "config.toml")), false);
        assert.equal(fs.existsSync(path.join(paths.codexDir, "providers.json")), false);
      },
    },
    {
      name: "copilot provider uses lazy SDK runtime and starts the local bridge on switch",
      async run() {
        const paths = makeFixture();
        const bridgePort = await getFreePort();

        await withFakeCopilotSdk(async () => {
          const added = await addProvider({
            toolHomeDir: paths.toolHomeDir,
            lockPath: paths.lockPath,
            runtimesDir: paths.runtimesDir,
            codexDir: paths.codexDir,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            providersPath: paths.providersPath,
            configPath: paths.configPath,
            authPath: paths.authPath,
            providerName: "copilot",
            profile: "copilot",
            apiKey: "",
            model: "gpt-4o-mini",
            tags: ["copilot"],
            createProfile: true,
            copilot: true,
            bridgePort,
            installCopilotSdk: false,
            interactive: true,
          });

          assert.equal(added.data.runtimeKind, "copilot-sdk-bridge");
          const providersAfterAdd = readProvidersFile(paths.providersPath).providers;
          assert.equal(providersAfterAdd.copilot.runtime.kind, "copilot-sdk-bridge");
          assert.equal(providersAfterAdd.copilot.baseUrl, `http://127.0.0.1:${String(bridgePort)}/v1`);
          assert.ok(providersAfterAdd.copilot.apiKey);

          try {
            const switched = await switchProvider({
              codexDir: paths.codexDir,
              lockPath: paths.lockPath,
              backupsDir: paths.backupsDir,
              latestBackupPath: paths.latestBackupPath,
              configPath: paths.configPath,
              providersPath: paths.providersPath,
              authPath: paths.authPath,
              providerName: "copilot",
            });

            assert.equal(switched.data.profile, "copilot");
            assert.equal(readCurrentProfile(paths.configPath), "copilot");

            const authAfterSwitch = JSON.parse(fs.readFileSync(paths.authPath, "utf8"));
            assert.equal(authAfterSwitch.auth_mode, "apikey");
            assert.equal(authAfterSwitch.OPENAI_API_KEY, providersAfterAdd.copilot.apiKey);

            const configAfterSwitch = fs.readFileSync(paths.configPath, "utf8");
            assert.match(configAfterSwitch, /\[model_providers\.copilot\]/);
            assert.match(configAfterSwitch, new RegExp(`base_url = "http://127\\.0\\.0\\.1:${String(bridgePort)}/v1"`));
            assert.match(configAfterSwitch, /name = "copilot"/);
            assert.match(configAfterSwitch, /requires_openai_auth = true/);
            assert.match(configAfterSwitch, /wire_api = "responses"/);

            const completion = await requestJson({
              host: "127.0.0.1",
              port: bridgePort,
              method: "POST",
              path: "/v1/chat/completions",
              headers: {
                authorization: `Bearer ${providersAfterAdd.copilot.apiKey}`,
                "content-type": "application/json",
              },
              body: {
                model: "copilot-test",
                messages: [{ role: "user", content: "hello" }],
              },
            });
            assert.equal(completion.statusCode, 200);
            assert.match(completion.body.choices[0].message.content, /^mock:copilot-test:/);

            const doctorResult = await withCodexAvailable(() =>
              runDoctor({
                codexDir: paths.codexDir,
                configPath: paths.configPath,
                providersPath: paths.providersPath,
                authPath: paths.authPath,
              })
            );
            assert.equal(doctorResult.data.healthy, true);
          } finally {
            stopCopilotBridge();
          }
        });
      },
    },
    {
      name: "copilot switch repairs an incomplete existing model_providers section even when bridge port is reused",
      async run() {
        const paths = makeFixture();
        const bridgePort = await getFreePort();
        fs.writeFileSync(
          paths.configPath,
          [
            'profile = "alpha"',
            "",
            "[profiles.alpha]",
            'model = "gpt-4o-mini"',
            'model_provider = "alpha"',
            "",
            "[profiles.copilot]",
            'model = "gpt-4o-mini"',
            'model_provider = "copilot"',
            "",
            "[model_providers.alpha]",
            'base_url = "https://alpha.example"',
            "",
            "[model_providers.copilot]",
            `base_url = "http://127.0.0.1:${String(bridgePort)}/v1"`,
            "",
          ].join("\n"),
          "utf8"
        );

        await withFakeCopilotSdk(async () => {
          fs.writeFileSync(
            paths.providersPath,
            `${JSON.stringify(
              {
                providers: {
                  alpha: { profile: "alpha", apiKey: "sk-alpha" },
                  copilot: {
                    profile: "copilot",
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

          try {
            const switched = await switchProvider({
              codexDir: paths.codexDir,
              lockPath: paths.lockPath,
              backupsDir: paths.backupsDir,
              latestBackupPath: paths.latestBackupPath,
              configPath: paths.configPath,
              providersPath: paths.providersPath,
              authPath: paths.authPath,
              providerName: "copilot",
            });
            assert.equal(switched.data.portChanged, false);
            const updatedConfig = fs.readFileSync(paths.configPath, "utf8");
            assert.match(updatedConfig, /\[model_providers\.copilot\]/);
            assert.match(updatedConfig, /name = "copilot"/);
            assert.match(updatedConfig, /requires_openai_auth = true/);
            assert.match(updatedConfig, /wire_api = "responses"/);
          } finally {
            stopCopilotBridge();
          }
        });
      },
    },
    {
      name: "add copilot repairs an incomplete existing model_providers section for an existing profile",
      async run() {
        const paths = makeFixture();
        const bridgePort = await getFreePort();
        fs.writeFileSync(
          paths.configPath,
          [
            'profile = "alpha"',
            "",
            "[profiles.alpha]",
            'model = "gpt-4o-mini"',
            'model_provider = "alpha"',
            "",
            "[profiles.copilot]",
            'model = "gpt-4o-mini"',
            'model_provider = "copilot"',
            "",
            "[model_providers.alpha]",
            'base_url = "https://alpha.example"',
            "",
            "[model_providers.copilot]",
            `base_url = "http://127.0.0.1:${String(bridgePort)}/v1"`,
            "",
          ].join("\n"),
          "utf8"
        );

        await withFakeCopilotSdk(async () => {
          const added = await addProvider({
            toolHomeDir: paths.toolHomeDir,
            lockPath: paths.lockPath,
            runtimesDir: paths.runtimesDir,
            codexDir: paths.codexDir,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            providersPath: paths.providersPath,
            configPath: paths.configPath,
            authPath: paths.authPath,
            providerName: "copilot",
            profile: "copilot",
            apiKey: "",
            model: "gpt-4o-mini",
            tags: ["copilot"],
            createProfile: false,
            copilot: true,
            bridgePort,
          });
          assert.equal(added.data.runtimeKind, "copilot-sdk-bridge");
          const updatedConfig = fs.readFileSync(paths.configPath, "utf8");
          assert.match(updatedConfig, /\[model_providers\.copilot\]/);
          assert.match(updatedConfig, /name = "copilot"/);
          assert.match(updatedConfig, /requires_openai_auth = true/);
          assert.match(updatedConfig, /wire_api = "responses"/);
        });
      },
    },
    {
      name: "copilot switch backs up providers.json when bridge port recovery rewrites provider state",
      async run() {
        const paths = makeFixture();
        const requestedPort = await getFreePort();
        const blocker = net.createServer();
        await new Promise((resolve, reject) => blocker.listen(requestedPort, "127.0.0.1", (error) => (error ? reject(error) : resolve())));

        await withFakeCopilotSdk(async () => {
          await addProvider({
            toolHomeDir: paths.toolHomeDir,
            lockPath: paths.lockPath,
            runtimesDir: paths.runtimesDir,
            codexDir: paths.codexDir,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            providersPath: paths.providersPath,
            configPath: paths.configPath,
            authPath: paths.authPath,
            providerName: "copilot",
            profile: "copilot",
            apiKey: "",
            model: "gpt-4o-mini",
            tags: ["copilot"],
            createProfile: true,
            copilot: true,
            bridgePort: requestedPort,
            interactive: true,
          });

          try {
            const switched = await switchProvider({
              codexDir: paths.codexDir,
              lockPath: paths.lockPath,
              backupsDir: paths.backupsDir,
              latestBackupPath: paths.latestBackupPath,
              configPath: paths.configPath,
              providersPath: paths.providersPath,
              authPath: paths.authPath,
              providerName: "copilot",
            });

            assert.equal(switched.data.portChanged, true);
            assert.ok(switched.data.managedState.backupFiles.includes("providers.json"));
            assert.ok(switched.data.managedState.backupFiles.includes("config.toml"));
          } finally {
            stopCopilotBridge();
            await new Promise((resolve, reject) => blocker.close((error) => (error ? reject(error) : resolve())));
          }
        });
      },
    },
    {
      name: "bridge start status and stop manage the copilot runtime explicitly",
      async run() {
        const paths = makeFixture();
        const bridgePort = await getFreePort();

        await withFakeCopilotSdk(async () => {
          await addProvider({
            toolHomeDir: paths.toolHomeDir,
            lockPath: paths.lockPath,
            runtimesDir: paths.runtimesDir,
            codexDir: paths.codexDir,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            providersPath: paths.providersPath,
            configPath: paths.configPath,
            authPath: paths.authPath,
            providerName: "copilot",
            profile: "copilot",
            apiKey: "",
            model: "gpt-4o-mini",
            tags: ["copilot"],
            createProfile: true,
            copilot: true,
            bridgePort,
            interactive: true,
          });

          try {
            const started = await startBridge({
              providersPath: paths.providersPath,
              configPath: paths.configPath,
              providerName: "copilot",
              runtime: {
                isInteractive: () => false,
                inputText: async () => "",
                inputSecret: async () => "",
                selectOne: async () => "",
                selectMany: async () => [],
                confirmAction: async () => false,
                writeLine: () => {},
              },
              json: true,
            });
            assert.equal(started.data.provider, "copilot");

            const status = await statusBridge({
              providersPath: paths.providersPath,
              configPath: paths.configPath,
              providerName: "copilot",
              runtime: {
                isInteractive: () => false,
                inputText: async () => "",
                inputSecret: async () => "",
                selectOne: async () => "",
                selectMany: async () => [],
                confirmAction: async () => false,
                writeLine: () => {},
              },
              json: true,
            });
            assert.equal(status.data.provider, "copilot");
            assert.equal(typeof status.data.expectedBaseUrl, "string");

            const stopped = await stopBridge({
              providersPath: paths.providersPath,
              configPath: paths.configPath,
              providerName: "copilot",
              runtime: {
                isInteractive: () => false,
                inputText: async () => "",
                inputSecret: async () => "",
                selectOne: async () => "",
                selectMany: async () => [],
                confirmAction: async () => false,
                writeLine: () => {},
              },
              json: true,
            });
            assert.equal(stopped.data.provider, "copilot");
          } finally {
            stopCopilotBridge();
          }
        });
      },
    },
    {
      name: "bridge stop is idempotent when no managed runtime state exists",
      async run() {
        const paths = makeFixture();

        const stopped = await stopBridge({
          providersPath: paths.providersPath,
          configPath: paths.configPath,
          providerName: null,
          runtime: {
            isInteractive: () => false,
            inputText: async () => "",
            inputSecret: async () => "",
            selectOne: async () => "",
            selectMany: async () => [],
            confirmAction: async () => false,
            writeLine: () => {},
          },
          json: true,
        });

        assert.equal(stopped.data.stopped, true);
        assert.equal(stopped.data.hadRuntimeState, false);
        assert.equal(stopped.data.provider, null);
      },
    },
    {
      name: "bridge start persists recovered copilot ports into providers and config projection",
      async run() {
        const paths = makeFixture();
        const requestedPort = await getFreePort();
        const blocker = net.createServer();
        await new Promise((resolve, reject) => blocker.listen(requestedPort, "127.0.0.1", (error) => (error ? reject(error) : resolve())));

        await withFakeCopilotSdk(async () => {
          await addProvider({
            toolHomeDir: paths.toolHomeDir,
            lockPath: paths.lockPath,
            runtimesDir: paths.runtimesDir,
            codexDir: paths.codexDir,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            providersPath: paths.providersPath,
            configPath: paths.configPath,
            authPath: paths.authPath,
            providerName: "copilot",
            profile: "copilot",
            apiKey: "",
            model: "gpt-4o-mini",
            tags: ["copilot"],
            createProfile: true,
            copilot: true,
            bridgePort: requestedPort,
            interactive: true,
          });

          try {
            const started = await startBridge({
              providersPath: paths.providersPath,
              configPath: paths.configPath,
              providerName: "copilot",
              runtime: {
                isInteractive: () => false,
                inputText: async () => "",
                inputSecret: async () => "",
                selectOne: async () => "",
                selectMany: async () => [],
                confirmAction: async () => false,
                writeLine: () => {},
              },
              json: true,
            });

            assert.equal(started.data.portChanged, true);
            assert.notEqual(started.data.port, requestedPort);
            assert.match(String(started.data.port), /^\d{5}$/);

            const provider = readProvidersFile(paths.providersPath).providers.copilot;
            assert.equal(provider.runtime.bridgePort, started.data.port);
            assert.equal(provider.baseUrl, `http://127.0.0.1:${String(started.data.port)}/v1`);
            assert.match(fs.readFileSync(paths.configPath, "utf8"), new RegExp(`http://127\\.0\\.0\\.1:${String(started.data.port)}/v1`));
          } finally {
            stopCopilotBridge();
            await new Promise((resolve, reject) => blocker.close((error) => (error ? reject(error) : resolve())));
          }
        });
      },
    },
    {
      name: "bridge start cleans up a newly started worker when recovered-port persistence fails",
      async run() {
        const paths = makeFixture();
        const requestedPort = await getFreePort();
        const blocker = net.createServer();
        await new Promise((resolve, reject) => blocker.listen(requestedPort, "127.0.0.1", (error) => (error ? reject(error) : resolve())));

        await withFakeCopilotSdk(async () => {
          await addProvider({
            toolHomeDir: paths.toolHomeDir,
            lockPath: paths.lockPath,
            runtimesDir: paths.runtimesDir,
            codexDir: paths.codexDir,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            providersPath: paths.providersPath,
            configPath: paths.configPath,
            authPath: paths.authPath,
            providerName: "copilot",
            profile: "copilot",
            apiKey: "",
            model: "gpt-4o-mini",
            tags: ["copilot"],
            createProfile: true,
            copilot: true,
            bridgePort: requestedPort,
            interactive: true,
          });

          fs.rmSync(paths.providersPath, { force: true });

          try {
            await assert.rejects(
              () =>
                startBridge({
                  providersPath: paths.providersPath,
                  configPath: paths.configPath,
                  providerName: "copilot",
                  runtime: {
                    isInteractive: () => false,
                    inputText: async () => "",
                    inputSecret: async () => "",
                    selectOne: async () => "",
                    selectMany: async () => [],
                    confirmAction: async () => false,
                    writeLine: () => {},
                  },
                  json: true,
                })
            );
            assert.equal(readCopilotBridgeState(), null);
          } finally {
            stopCopilotBridge();
            await new Promise((resolve, reject) => blocker.close((error) => (error ? reject(error) : resolve())));
          }
        });
      },
    },
    {
      name: "bridge start ignores stray env_key removal while recovering a replaced worker",
      async run() {
        const paths = makeFixture();
        const stalePort = await getFreePort();
        const requestedPort = await getFreePort();
        const blocker = net.createServer();
        const previousServer = await startCopilotBridgeServer({
          host: "127.0.0.1",
          port: stalePort,
          apiKey: "old-secret",
          executeChatCompletion: async () => ({
            choices: [{ index: 0, message: { role: "assistant", content: "old" }, finish_reason: "stop" }],
          }),
        });
        await new Promise((resolve, reject) => blocker.listen(requestedPort, "127.0.0.1", (error) => (error ? reject(error) : resolve())));

        await withFakeCopilotSdk(async () => {
          await addProvider({
            toolHomeDir: paths.toolHomeDir,
            lockPath: paths.lockPath,
            runtimesDir: paths.runtimesDir,
            codexDir: paths.codexDir,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            providersPath: paths.providersPath,
            configPath: paths.configPath,
            authPath: paths.authPath,
            providerName: "copilot",
            profile: "copilot",
            apiKey: "",
            model: "gpt-4o-mini",
            tags: ["copilot"],
            createProfile: true,
            copilot: true,
            bridgePort: requestedPort,
            interactive: true,
          });

          writeCopilotBridgeState({
            provider: "copilot-old",
            pid: null,
            host: "127.0.0.1",
            port: stalePort,
            baseUrl: `http://127.0.0.1:${String(stalePort)}/v1`,
            startedAt: new Date().toISOString(),
            lastHealthcheckAt: new Date().toISOString(),
          });
          const originalConfig = fs.readFileSync(paths.configPath, "utf8");
          fs.writeFileSync(
            paths.configPath,
            originalConfig,
            "utf8"
          );

          try {
            const result = await startBridge({
              providersPath: paths.providersPath,
              configPath: paths.configPath,
              providerName: "copilot",
              runtime: {
                isInteractive: () => false,
                inputText: async () => "",
                inputSecret: async () => "",
                selectOne: async () => "",
                selectMany: async () => [],
                confirmAction: async () => false,
                writeLine: () => {},
              },
              json: true,
            });
            assert.equal(result.data.provider, "copilot");
            assert.notEqual(readCopilotBridgeState(), null);
          } finally {
            stopCopilotBridge();
            await new Promise((resolve, reject) => blocker.close((error) => (error ? reject(error) : resolve())));
            await new Promise((resolve, reject) => previousServer.close((error) => (error ? reject(error) : resolve())));
          }
        });
      },
    },
    {
      name: "bridge start preserves providers and tolerates missing env_key lines during config projection update",
      async run() {
        const paths = makeFixture();
        const requestedPort = await getFreePort();
        const blocker = net.createServer();
        await new Promise((resolve, reject) => blocker.listen(requestedPort, "127.0.0.1", (error) => (error ? reject(error) : resolve())));

        await withFakeCopilotSdk(async () => {
          await addProvider({
            toolHomeDir: paths.toolHomeDir,
            lockPath: paths.lockPath,
            runtimesDir: paths.runtimesDir,
            codexDir: paths.codexDir,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            providersPath: paths.providersPath,
            configPath: paths.configPath,
            authPath: paths.authPath,
            providerName: "copilot",
            profile: "copilot",
            apiKey: "",
            model: "gpt-4o-mini",
            tags: ["copilot"],
            createProfile: true,
            copilot: true,
            bridgePort: requestedPort,
            interactive: true,
          });

          const beforeProviders = fs.readFileSync(paths.providersPath, "utf8");
          const beforeConfig = fs.readFileSync(paths.configPath, "utf8");
          fs.writeFileSync(
            paths.configPath,
            beforeConfig,
            "utf8"
          );

          try {
            const result = await startBridge({
              providersPath: paths.providersPath,
              configPath: paths.configPath,
              providerName: "copilot",
              runtime: {
                isInteractive: () => false,
                inputText: async () => "",
                inputSecret: async () => "",
                selectOne: async () => "",
                selectMany: async () => [],
                confirmAction: async () => false,
                writeLine: () => {},
              },
              json: true,
            });
            assert.equal(result.data.provider, "copilot");
            assert.notEqual(fs.readFileSync(paths.providersPath, "utf8").length, 0);
            const updatedConfig = fs.readFileSync(paths.configPath, "utf8");
            assert.doesNotMatch(updatedConfig, /env_key = "COPILOT_API_KEY"/);
            assert.match(updatedConfig, /\[model_providers\.copilot\]/);
            assert.match(updatedConfig, /name = "copilot"/);
            assert.match(updatedConfig, /requires_openai_auth = true/);
            assert.match(updatedConfig, /wire_api = "responses"/);
          } finally {
            stopCopilotBridge();
            await new Promise((resolve, reject) => blocker.close((error) => (error ? reject(error) : resolve())));
          }
        });
      },
    },
    {
      name: "status and doctor surface stale copilot runtime state even when a direct provider is active",
      async run() {
        const paths = makeFixture();
        const stalePort = await getFreePort();

        await withFakeCopilotSdk(async () => {
          await addProvider({
            toolHomeDir: paths.toolHomeDir,
            lockPath: paths.lockPath,
            runtimesDir: paths.runtimesDir,
            codexDir: paths.codexDir,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            providersPath: paths.providersPath,
            configPath: paths.configPath,
            authPath: paths.authPath,
            providerName: "copilot",
            profile: "copilot",
            apiKey: "",
            model: "gpt-4o-mini",
            tags: ["copilot"],
            createProfile: true,
            copilot: true,
            bridgePort: stalePort,
            interactive: true,
          });

          writeCopilotBridgeState({
            provider: "copilot",
            pid: null,
            host: "127.0.0.1",
            port: stalePort,
            baseUrl: `http://127.0.0.1:${String(stalePort)}/v1`,
            startedAt: new Date().toISOString(),
            lastHealthcheckAt: new Date().toISOString(),
          });

          const switched = await switchProvider({
            codexDir: paths.codexDir,
            lockPath: paths.lockPath,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            configPath: paths.configPath,
            providersPath: paths.providersPath,
            authPath: paths.authPath,
            providerName: "beta",
          });
          assert.equal(switched.data.profile, "beta");

          const status = await withCodexAvailable(() =>
            require("../dist/app/get-status.js").getStatus(paths.codexDir, paths.configPath, paths.providersPath, paths.authPath)
          );
          assert.equal(status.data.copilotRuntimeState.provider, "copilot");
          assert.equal(status.data.copilotBridge.ok, false);

          const doctor = await withCodexAvailable(() =>
            runDoctor({
              codexDir: paths.codexDir,
              configPath: paths.configPath,
              providersPath: paths.providersPath,
              authPath: paths.authPath,
            })
          );
          assert.ok(doctor.data.issues.some((issue) => issue.code === "BRIDGE_STATE_STALE"));
        }).finally(() => {
          stopCopilotBridge();
        });
      },
    },
    {
      name: "status and doctor stay stable when Copilot runtime state is malformed",
      async run() {
        const paths = makeFixture();
        const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-runtime-state-"));
        const previousStateDir = process.env.CODEX_SWITCH_RUNTIME_STATE_DIR;
        process.env.CODEX_SWITCH_RUNTIME_STATE_DIR = stateDir;
        try {
          fs.writeFileSync(path.join(stateDir, "copilot-bridge-state.json"), "{ invalid-json", "utf8");

          const status = await withCodexAvailable(() =>
            require("../dist/app/get-status.js").getStatus(paths.codexDir, paths.configPath, paths.providersPath, paths.authPath)
          );
          assert.equal(status.data.copilotRuntimeState, null);
          assert.equal(status.data.copilotBridge.ok, false);
          assert.ok(status.warnings.some((warning) => /runtime state is unreadable/i.test(warning)));

          const doctor = await withCodexAvailable(() =>
            runDoctor({
              codexDir: paths.codexDir,
              configPath: paths.configPath,
              providersPath: paths.providersPath,
              authPath: paths.authPath,
            })
          );
          assert.ok(doctor.data.issues.some((issue) => issue.code === "BRIDGE_STATE_STALE"));
          assert.ok(doctor.data.issues.some((issue) => /runtime state is unreadable/i.test(issue.message)));
        } finally {
          if (previousStateDir === undefined) {
            delete process.env.CODEX_SWITCH_RUNTIME_STATE_DIR;
          } else {
            process.env.CODEX_SWITCH_RUNTIME_STATE_DIR = previousStateDir;
          }
          fs.rmSync(stateDir, { recursive: true, force: true });
        }
      },
    },
    {
      name: "copilot runtime install and state resolve from explicit tool-home paths instead of CODEXS_HOME fallback",
      async run() {
        const previousToolHome = process.env.CODEXS_HOME;
        const wrongToolHome = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-wrong-home-"));
        const codexDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-explicit-codex-"));
        const toolHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-explicit-home-"));
        process.env.CODEXS_HOME = wrongToolHome;
        const paths = createCodexPaths({ codexDir, toolHomeDir });
        const bridgePort = await getFreePort();

        try {
          fs.mkdirSync(paths.codexDir, { recursive: true });
          fs.mkdirSync(paths.backupsDir, { recursive: true });
          fs.writeFileSync(paths.authPath, `${JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "sk-openai" }, null, 2)}\n`, "utf8");
          fs.writeFileSync(
            paths.configPath,
            [
              'profile = "copilot"',
              "",
              "[profiles.copilot]",
              'model = "gpt-4o-mini"',
              'model_provider = "copilot"',
              "",
              "[model_providers.copilot]",
              `base_url = "http://127.0.0.1:${String(bridgePort)}/v1"`,
              'name = "copilot"',
              "requires_openai_auth = true",
              'wire_api = "responses"',
              "",
            ].join("\n"),
            "utf8"
          );
          fs.writeFileSync(
            paths.providersPath,
            `${JSON.stringify({
              providers: {
                copilot: {
                  profile: "copilot",
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
            }, null, 2)}\n`,
            "utf8"
          );
          installFakeCopilotSdkAt(paths.runtimesDir);

          const switched = await switchProvider({
            codexDir: paths.codexDir,
            lockPath: paths.lockPath,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            configPath: paths.configPath,
            providersPath: paths.providersPath,
            authPath: paths.authPath,
            runtimeDir: paths.runtimeDir,
            runtimesDir: paths.runtimesDir,
            providerName: "copilot",
          });
          assert.equal(switched.data.profile, "copilot");
          assert.equal(readCopilotBridgeState(paths.runtimeDir).provider, "copilot");
          assert.equal(readCopilotBridgeState(path.join(wrongToolHome, "runtime")), null);

          const status = await getStatus(paths.codexDir, paths.configPath, paths.providersPath, paths.authPath, {
            runtimeDir: paths.runtimeDir,
            runtimesDir: paths.runtimesDir,
          });
          assert.equal(status.data.copilotSdk.installDir, path.join(paths.runtimesDir, "copilot"));
          assert.equal(status.data.copilotRuntimeState.provider, "copilot");

          const doctor = await withCodexAvailable(() =>
            runDoctor({
              codexDir: paths.codexDir,
              configPath: paths.configPath,
              providersPath: paths.providersPath,
              authPath: paths.authPath,
              runtimeDir: paths.runtimeDir,
              runtimesDir: paths.runtimesDir,
            })
          );
          assert.equal(doctor.data.healthy, true);
        } finally {
          stopCopilotBridge(paths.runtimeDir);
          if (previousToolHome === undefined) {
            delete process.env.CODEXS_HOME;
          } else {
            process.env.CODEXS_HOME = previousToolHome;
          }
          fs.rmSync(wrongToolHome, { recursive: true, force: true });
          fs.rmSync(toolHomeDir, { recursive: true, force: true });
          fs.rmSync(codexDir, { recursive: true, force: true });
        }
      },
    },
    {
      name: "malformed auth.json is replaced when switching direct providers",
      async run() {
        const paths = makeFixture();
        fs.writeFileSync(paths.authPath, "{ invalid-json", "utf8");

        const switched = await switchProvider({
          codexDir: paths.codexDir,
          lockPath: paths.lockPath,
          backupsDir: paths.backupsDir,
          latestBackupPath: paths.latestBackupPath,
          configPath: paths.configPath,
          providersPath: paths.providersPath,
          authPath: paths.authPath,
          providerName: "beta",
        });

        assert.equal(switched.data.profile, "beta");
        assert.equal(readCurrentProfile(paths.configPath), "beta");
        const authAfterSwitch = JSON.parse(fs.readFileSync(paths.authPath, "utf8"));
        assert.equal(authAfterSwitch.auth_mode, "apikey");
        assert.equal(authAfterSwitch.OPENAI_API_KEY, "sk-beta");

        const doctor = await withCodexAvailable(() =>
          runDoctor({
            codexDir: paths.codexDir,
            configPath: paths.configPath,
            providersPath: paths.providersPath,
            authPath: paths.authPath,
          })
        );
        const issueCodes = doctor.data.issues.map((issue) => issue.code);
        assert.ok(!issueCodes.includes("AUTH_JSON_INVALID"));
        assert.ok(!issueCodes.includes("AUTH_JSON_ENV_KEY_MISMATCH"));
        assert.ok(!issueCodes.includes("AUTH_JSON_APIKEY_MISMATCH"));
      },
    },
    {
      name: "copilot switch fails fast when SDK is missing",
      async run() {
        const paths = makeFixture();
        const bridgePort = await getFreePort();
        await withFakeCopilotSdk(async (runtimeDir) => {
          await addProvider({
            toolHomeDir: paths.toolHomeDir,
            lockPath: paths.lockPath,
            runtimesDir: paths.runtimesDir,
            codexDir: paths.codexDir,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            providersPath: paths.providersPath,
            configPath: paths.configPath,
            authPath: paths.authPath,
            providerName: "copilot",
            profile: "copilot",
            apiKey: "",
            model: "gpt-4o-mini",
            tags: ["copilot"],
            createProfile: true,
            copilot: true,
            bridgePort,
            interactive: true,
          });
          fs.rmSync(runtimeDir, { recursive: true, force: true });

          await assert.rejects(
            () =>
              switchProvider({
                codexDir: paths.codexDir,
                lockPath: paths.lockPath,
                backupsDir: paths.backupsDir,
                latestBackupPath: paths.latestBackupPath,
                configPath: paths.configPath,
                providersPath: paths.providersPath,
                authPath: paths.authPath,
                providerName: "copilot",
              }),
            (error) => error && error.code === "COPILOT_SDK_MISSING"
          );
        });
      },
    },
    {
      name: "newly started copilot bridge is cleaned up when switch fails after the bridge starts",
      async run() {
        const paths = makeFixture();
        const bridgePort = await getFreePort();

        await withFakeCopilotSdk(async () => {
          await addProvider({
            toolHomeDir: paths.toolHomeDir,
            lockPath: paths.lockPath,
            runtimesDir: paths.runtimesDir,
            codexDir: paths.codexDir,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            providersPath: paths.providersPath,
            configPath: paths.configPath,
            authPath: paths.authPath,
            providerName: "copilot",
            profile: "copilot",
            apiKey: "",
            model: "gpt-4o-mini",
            tags: ["copilot"],
            createProfile: true,
            copilot: true,
            bridgePort,
            interactive: true,
          });
          const originalConfig = fs.readFileSync(paths.configPath, "utf8");
          fs.writeFileSync(
            paths.configPath,
            `${originalConfig}\nenv_key = "BROKEN_COPILOT_API_KEY"\n`,
            "utf8"
          );

          const switched = await switchProvider({
            codexDir: paths.codexDir,
            lockPath: paths.lockPath,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            configPath: paths.configPath,
            providersPath: paths.providersPath,
            authPath: paths.authPath,
            providerName: "copilot",
          });
          assert.equal(switched.data.profile, "copilot");
          assert.equal(readCurrentProfile(paths.configPath), "copilot");
        }).finally(() => {
          stopCopilotBridge();
        });
      },
    },
    {
      name: "reused copilot bridge stays alive when switch fails after bridge reuse",
      async run() {
        const paths = makeFixture();
        const bridgePort = await getFreePort();

        await withFakeCopilotSdk(async () => {
          await addProvider({
            toolHomeDir: paths.toolHomeDir,
            lockPath: paths.lockPath,
            runtimesDir: paths.runtimesDir,
            codexDir: paths.codexDir,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            providersPath: paths.providersPath,
            configPath: paths.configPath,
            authPath: paths.authPath,
            providerName: "copilot",
            profile: "copilot",
            apiKey: "",
            model: "gpt-4o-mini",
            tags: ["copilot"],
            createProfile: true,
            copilot: true,
            bridgePort,
            interactive: true,
          });

          const provider = readProvidersFile(paths.providersPath).providers.copilot;
          const server = await startCopilotBridgeServer({
            host: "127.0.0.1",
            port: bridgePort,
            apiKey: provider.apiKey,
            executeChatCompletion: async () => ({
              choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
            }),
          });
          try {
            writeCopilotBridgeState({
                provider: "copilot",
                pid: null,
                host: "127.0.0.1",
                port: bridgePort,
                baseUrl: `http://127.0.0.1:${String(bridgePort)}/v1`,
                startedAt: new Date().toISOString(),
                lastHealthcheckAt: new Date().toISOString(),
              });
            const originalConfig = fs.readFileSync(paths.configPath, "utf8");
            fs.writeFileSync(
              paths.configPath,
              `${originalConfig}\nenv_key = "BROKEN_COPILOT_API_KEY"\n`,
              "utf8"
            );

            const switched = await switchProvider({
              codexDir: paths.codexDir,
              lockPath: paths.lockPath,
              backupsDir: paths.backupsDir,
              latestBackupPath: paths.latestBackupPath,
              configPath: paths.configPath,
              providersPath: paths.providersPath,
              authPath: paths.authPath,
              providerName: "copilot",
            });
            assert.equal(switched.data.profile, "copilot");
            assert.notEqual(readCopilotBridgeState(), null);
          } finally {
            await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
          }
        }).finally(() => {
          stopCopilotBridge();
        });
      },
    },
    {
      name: "copilot switch replaces a healthy bridge when the provider secret has rotated",
      async run() {
        const paths = makeFixture();
        const bridgePort = await getFreePort();

        await withFakeCopilotSdk(async () => {
          await addProvider({
            toolHomeDir: paths.toolHomeDir,
            lockPath: paths.lockPath,
            runtimesDir: paths.runtimesDir,
            codexDir: paths.codexDir,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            providersPath: paths.providersPath,
            configPath: paths.configPath,
            authPath: paths.authPath,
            providerName: "copilot",
            profile: "copilot",
            apiKey: "",
            model: "gpt-4o-mini",
            tags: ["copilot"],
            createProfile: true,
            copilot: true,
            bridgePort,
            interactive: true,
          });

          const providers = readProvidersFile(paths.providersPath);
          const originalProvider = providers.providers.copilot;
          const originalServer = await startCopilotBridgeServer({
            host: "127.0.0.1",
            port: bridgePort,
            apiKey: originalProvider.apiKey,
            executeChatCompletion: async () => ({
              choices: [{ index: 0, message: { role: "assistant", content: "old" }, finish_reason: "stop" }],
            }),
          });

          try {
            writeCopilotBridgeState({
              provider: "copilot",
              pid: null,
              host: "127.0.0.1",
              port: bridgePort,
              baseUrl: `http://127.0.0.1:${String(bridgePort)}/v1`,
              startedAt: new Date().toISOString(),
              lastHealthcheckAt: new Date().toISOString(),
            });

            const rotatedProvider = {
              ...originalProvider,
              apiKey: "rotated-bridge-secret",
            };
            fs.writeFileSync(
              paths.providersPath,
              `${JSON.stringify(
                {
                  providers: {
                    ...providers.providers,
                    copilot: rotatedProvider,
                  },
                },
                null,
                2
              )}\n`,
              "utf8"
            );

            const switched = await switchProvider({
              codexDir: paths.codexDir,
              lockPath: paths.lockPath,
              backupsDir: paths.backupsDir,
              latestBackupPath: paths.latestBackupPath,
              configPath: paths.configPath,
              providersPath: paths.providersPath,
              authPath: paths.authPath,
              runtimeDir: paths.runtimeDir,
              runtimesDir: paths.runtimesDir,
              providerName: "copilot",
            });

            assert.equal(switched.data.profile, "copilot");
            assert.equal(switched.data.portChanged, true);

            const auth = JSON.parse(fs.readFileSync(paths.authPath, "utf8"));
            assert.equal(auth.OPENAI_API_KEY, "rotated-bridge-secret");

            const updatedProvider = readProvidersFile(paths.providersPath).providers.copilot;
            const authorized = await requestJson({
              host: updatedProvider.runtime.bridgeHost,
              port: updatedProvider.runtime.bridgePort,
              method: "GET",
              path: "/v1/models",
              headers: {
                authorization: `Bearer ${auth.OPENAI_API_KEY}`,
              },
            });
            assert.equal(authorized.statusCode, 200);
          } finally {
            await new Promise((resolve, reject) => originalServer.close((error) => (error ? reject(error) : resolve())));
          }
        }).finally(() => {
          stopCopilotBridge(paths.runtimeDir);
        });
      },
    },
    {
      name: "export and import preserve provider file operations",
      run() {
        const paths = makeFixture();
        const exportFile = path.join(paths.codexDir, "exports", "providers.json");
        const importFile = path.join(paths.codexDir, "imports", "providers.json");
        fs.mkdirSync(path.dirname(importFile), { recursive: true });
        fs.writeFileSync(
          importFile,
          `${JSON.stringify(
            {
              providers: {
                beta: { profile: "beta", apiKey: "sk-beta-updated", note: "restored" },
              },
            },
            null,
            2
          )}\n`,
          "utf8"
        );

        const exported = exportProviders({
          providersPath: paths.providersPath,
          targetFile: exportFile,
          force: true,
        });
        assert.equal(exported.data.exportedTo, path.resolve(exportFile));
        assert.ok(fs.existsSync(exportFile));

        const imported = importProviders({
          codexDir: paths.codexDir,
          lockPath: paths.lockPath,
          backupsDir: paths.backupsDir,
          latestBackupPath: paths.latestBackupPath,
          providersPath: paths.providersPath,
          configPath: paths.configPath,
          sourceFile: importFile,
        });
        assert.equal(imported.data.mode, "replace");
        const providers = readProvidersFile(paths.providersPath).providers;
        assert.deepEqual(Object.keys(providers), ["beta"]);
        assert.equal(providers.beta.note, "restored");
      },
    },
  ],
};
