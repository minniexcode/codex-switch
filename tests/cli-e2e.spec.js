"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");

const {
  fixtureCodexDir,
  makeEmptyCodexDir,
  makeSandboxCopy,
  makeToolHomeWithManagedState,
  runBuiltCli,
  runJsonCli,
} = require("./helpers");
const { stopCopilotBridge } = require("../dist/runtime/copilot-bridge.js");

function withFakeCopilotSdk(run) {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-cli-e2e-copilot-"));
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

function writeStatusFixture(args) {
  fs.mkdirSync(args.codexDir, { recursive: true });
  fs.writeFileSync(path.join(args.codexDir, "auth.json"), `${JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "sk-test" }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(args.codexDir, "config.toml"), `${args.configToml.trim()}\n`, "utf8");
  fs.writeFileSync(path.join(args.toolHomeDir, "providers.json"), `${JSON.stringify(args.providers, null, 2)}\n`, "utf8");
}

module.exports = {
  name: "cli-e2e",
  tests: [
    {
      name: "help and version render through the built CLI entrypoint",
      async run() {
        const help = await runBuiltCli(["--help"]);
        assert.equal(help.status, 0);
        assert.match(help.stdout, /codexs init/);
        assert.match(help.stdout, /codexs add packycode --profile packycode --api-key sk-xxx/);
        assert.match(help.stdout, /codexs status/);
        assert.match(help.stdout, /codexs doctor/);
        assert.match(help.stdout, /codexs migrate/);
        assert.ok(help.stdout.indexOf("codexs switch packycode") < help.stdout.indexOf("codexs migrate"));

        const version = await runBuiltCli(["--version"]);
        assert.equal(version.status, 0);
        assert.equal(version.stdout.trim(), packageJson.version);
      },
    },
    {
      name: "read commands return stable JSON envelopes against the repository sandbox",
      async run() {
        const list = await runJsonCli(["list", "--json", "--codex-dir", fixtureCodexDir]);
        assert.equal(list.status, 0);
        assert.equal(list.payload.ok, true);
        assert.equal(list.payload.command, "list");
        assert.equal(list.payload.data.count, 4);
        assert.ok(list.payload.data.providers.every((provider) => typeof provider.providerType === "string"));
        assert.ok(list.payload.data.providers.every((provider) => typeof provider.isActive === "boolean"));
        assert.equal(list.payload.data.currentProfile, "freemodel");
        assert.equal(list.payload.data.activeProvider, "freemodel");
        assert.equal(list.payload.data.activeProviderResolvable, true);
        assert.deepEqual(list.payload.data.activeProviderCandidates, ["freemodel"]);

        const show = await runJsonCli(["show", "freemodel", "--json", "--codex-dir", fixtureCodexDir]);
        assert.equal(show.status, 0);
        assert.equal(show.payload.data.providerName, "freemodel");
        assert.equal(show.payload.data.provider.apiKey, "freemodel-123");

        const current = await runJsonCli(["current", "--json", "--codex-dir", fixtureCodexDir]);
        assert.equal(current.status, 0);
        assert.equal(current.payload.data.profile, "freemodel");

        const status = await runJsonCli(["status", "--json", "--codex-dir", fixtureCodexDir]);
        assert.equal(status.status, 0);
        assert.equal(status.payload.data.providersExists, true);
        assert.equal(status.payload.data.currentProfile, "freemodel");

        const configShow = await runJsonCli(["config", "show", "--json", "--codex-dir", fixtureCodexDir]);
        assert.equal(configShow.status, 0);
        assert.equal(configShow.payload.data.activeProfile, "freemodel");
        assert.ok(configShow.payload.data.profiles.length >= 4);

        const configList = await runJsonCli(["config", "list-profiles", "--json", "--codex-dir", fixtureCodexDir]);
        assert.equal(configList.status, 0);
        assert.ok(configList.payload.data.profiles.some((profile) => profile.name === "freemodel"));

        const backups = await runJsonCli(["backups", "list", "--json", "--codex-dir", fixtureCodexDir]);
        assert.ok(backups.status === 0 || backups.status === 1);
        if (backups.status === 0) {
          assert.ok(Array.isArray(backups.payload.data.backups));
        } else {
          assert.equal(backups.payload.error.code, "BACKUP_NOT_FOUND");
        }

        const doctor = await runJsonCli(["doctor", "--json", "--codex-dir", fixtureCodexDir]);
        assert.equal(doctor.status, 0);
        assert.equal(typeof doctor.payload.data.healthy, "boolean");
        assert.ok(Array.isArray(doctor.payload.data.issues));
      },
    },
    {
      name: "init creates providers.json in an empty Codex directory",
      async run() {
        const codexDir = makeEmptyCodexDir();
        const toolHomeDir = makeToolHomeWithManagedState();
        const providersPath = path.join(toolHomeDir, "providers.json");
        const toolConfigPath = path.join(toolHomeDir, "codex-switch.json");
        fs.rmSync(providersPath, { force: true });
        fs.rmSync(toolConfigPath, { force: true });

        const init = await runJsonCli({ args: ["init", "--json", "--codex-dir", codexDir], toolHomeDir });
        assert.equal(init.status, 0);
        assert.equal(init.payload.command, "init");
        assert.equal(init.payload.data.createdProvidersFile, true);
        assert.equal(init.payload.data.toolHomeDir, toolHomeDir);
        assert.deepEqual(JSON.parse(fs.readFileSync(providersPath, "utf8")), { providers: {} });
        assert.equal(fs.existsSync(path.join(codexDir, "providers.json")), false);

        const initHuman = await runBuiltCli({ args: ["init", "--codex-dir", codexDir], toolHomeDir });
        assert.equal(initHuman.status, 0);
        assert.match(initHuman.stdout, /Initialized codex-switch tool home\./);
        assert.match(initHuman.stdout, /tool home:/);
        assert.match(initHuman.stdout, /tool config:/);
        assert.match(initHuman.stdout, /providers registry:/);
        assert.doesNotMatch(initHuman.stdout, /Created codexDir:/);
      },
    },
    {
      name: "status and doctor human-readable output reflect the 0.0.12 release wording",
      async run() {
        const list = await runBuiltCli(["list", "--codex-dir", fixtureCodexDir]);
        assert.equal(list.status, 0);
        assert.match(list.stdout, /Current profile: freemodel/);
        assert.match(list.stdout, /freemodel \[direct\] current -> freemodel/);

        const status = await runBuiltCli(["status", "--codex-dir", fixtureCodexDir]);
        assert.equal(status.status, 0);
        assert.match(status.stdout, /Status summary:/);
        assert.match(status.stdout, /target runtime:/);
        assert.match(status.stdout, /tool home:/);
        assert.match(status.stdout, /provider path: direct/);
        assert.match(status.stdout, /next step:/);

        const doctor = await runBuiltCli(["doctor", "--codex-dir", fixtureCodexDir]);
        assert.equal(doctor.status, 0);
        assert.match(doctor.stdout, /Doctor summary:/);
      },
    },
    {
      name: "status output marks shared active profiles as ambiguous instead of inventing a provider",
      async run() {
        const codexDir = makeEmptyCodexDir();
        const toolHomeDir = makeToolHomeWithManagedState();
        writeStatusFixture({
          codexDir,
          toolHomeDir,
          configToml: [
            'profile = "alpha"',
            "",
            "[profiles.alpha]",
            'model = "gpt-4o-mini"',
            'model_provider = "alpha"',
            "",
            "[model_providers.alpha]",
            'base_url = "https://alpha.example"',
          ].join("\n"),
          providers: {
            providers: {
              alpha: { profile: "alpha", apiKey: "sk-alpha" },
              alphaReplica: { profile: "alpha", apiKey: "sk-alpha-replica" },
            },
          },
        });

        const status = await runJsonCli({ args: ["status", "--json", "--codex-dir", codexDir], toolHomeDir });
        assert.equal(status.status, 0);
        assert.equal(status.payload.data.provider, null);
        assert.equal(status.payload.data.activeProviderResolvable, false);
        assert.deepEqual(status.payload.data.activeProviderCandidates, ["alpha", "alphaReplica"]);
        assert.equal(status.payload.data.liveState.reason, "shared-profile");

        const human = await runBuiltCli({ args: ["status", "--codex-dir", codexDir], toolHomeDir });
        assert.equal(human.status, 0);
        assert.match(human.stdout, /mapped provider: \(ambiguous: alpha, alphaReplica\)/);
        assert.match(human.stdout, /runtime health: active provider ambiguous/);

        const list = await runJsonCli({ args: ["list", "--json", "--codex-dir", codexDir], toolHomeDir });
        assert.equal(list.status, 0);
        assert.equal(list.payload.data.activeProvider, null);
        assert.equal(list.payload.data.activeProviderResolvable, false);
        assert.deepEqual(list.payload.data.activeProviderCandidates, ["alpha", "alphaReplica"]);
        assert.ok(list.payload.data.providers.every((provider) => provider.isActive === false));

        const listHuman = await runBuiltCli({ args: ["list", "--codex-dir", codexDir], toolHomeDir });
        assert.equal(listHuman.status, 0);
        assert.match(listHuman.stdout, /Current provider: ambiguous \(alpha, alphaReplica\)/);
        assert.doesNotMatch(listHuman.stdout, /\[direct\] current ->/);
      },
    },
    {
      name: "status runtime health reports missing Copilot SDK for an active Copilot provider",
      async run() {
        const codexDir = makeEmptyCodexDir();
        const toolHomeDir = makeToolHomeWithManagedState();
        writeStatusFixture({
          codexDir,
          toolHomeDir,
          configToml: [
            'profile = "copilot"',
            "",
            "[profiles.copilot]",
            'model = "gpt-4o-mini"',
            'model_provider = "copilot"',
            "",
            "[model_providers.copilot]",
            'base_url = "http://127.0.0.1:4010/v1"',
          ].join("\n"),
          providers: {
            providers: {
              copilot: {
                profile: "copilot",
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
        });

        const status = await runJsonCli({ args: ["status", "--json", "--codex-dir", codexDir], toolHomeDir });
        assert.equal(status.status, 0);
        assert.equal(status.payload.data.copilotSdk.installed, false);
        assert.equal(status.payload.data.copilotAuth.ready, false);

        const human = await runBuiltCli({ args: ["status", "--codex-dir", codexDir], toolHomeDir });
        assert.equal(human.status, 0);
        assert.match(human.stdout, /runtime health: copilot sdk missing/);
      },
    },
    {
      name: "status runtime health ignores missing Copilot SDK for a direct active provider",
      async run() {
        const codexDir = makeEmptyCodexDir();
        const toolHomeDir = makeToolHomeWithManagedState();
        writeStatusFixture({
          codexDir,
          toolHomeDir,
          configToml: [
            'profile = "alpha"',
            "",
            "[profiles.alpha]",
            'model = "gpt-4o-mini"',
            'model_provider = "alpha"',
            "",
            "[model_providers.alpha]",
            'base_url = "https://api.openai.example/v1"',
          ].join("\n"),
          providers: {
            providers: {
              alpha: {
                profile: "alpha",
                apiKey: "sk-alpha",
                baseUrl: "https://api.openai.example/v1",
              },
            },
          },
        });

        const status = await runJsonCli({ args: ["status", "--json", "--codex-dir", codexDir], toolHomeDir });
        assert.equal(status.status, 0);
        assert.equal(status.payload.data.provider, "alpha");
        assert.equal(status.payload.data.runtimeProvider, null);
        assert.equal(status.payload.data.copilotSdk.installed, false);

        const human = await runBuiltCli({ args: ["status", "--codex-dir", codexDir], toolHomeDir });
        assert.equal(human.status, 0);
        assert.match(human.stdout, /provider path: direct/);
        assert.match(human.stdout, /runtime health: ok/);
        assert.doesNotMatch(human.stdout, /runtime health: copilot sdk missing/);
      },
    },
    {
      name: "add supports explicit non-interactive creation and reports missing profile errors",
      async run() {
        const successDir = makeSandboxCopy();
        const successToolHome = makeToolHomeWithManagedState();
        const add = await runJsonCli({
          args: [
            "add",
            "zeta",
            "--profile",
            "zeta",
            "--api-key",
            "sk-zeta",
            "--create-profile",
            "--model",
            "gpt-4o-mini",
            "--base-url",
            "https://zeta.example/v1",
            "--json",
            "--codex-dir",
            successDir,
          ],
          toolHomeDir: successToolHome,
        });
        assert.equal(add.status, 0);
        assert.equal(add.payload.data.provider, "zeta");
        assert.deepEqual(add.payload.data.createdProfileSections, ["zeta"]);
        assert.deepEqual(add.payload.data.createdModelProviderSections, ["zeta"]);
        const providers = JSON.parse(fs.readFileSync(path.join(successToolHome, "providers.json"), "utf8"));
        const runtimeProviders = JSON.parse(fs.readFileSync(path.join(successDir, "providers.json"), "utf8"));
        assert.equal(providers.providers.zeta.profile, "zeta");
        assert.equal(runtimeProviders.providers.zeta, undefined);

        const failureDir = makeSandboxCopy();
        const failureToolHome = makeToolHomeWithManagedState();
        const missingProfile = await runJsonCli({
          args: [
            "add",
            "ghost",
            "--profile",
            "ghost",
            "--api-key",
            "sk-ghost",
            "--json",
            "--codex-dir",
            failureDir,
          ],
          toolHomeDir: failureToolHome,
        });
        assert.equal(missingProfile.status, 1);
        assert.equal(missingProfile.payload.ok, false);
        assert.equal(missingProfile.payload.error.code, "PROFILE_NOT_FOUND");
      },
    },
    {
      name: "edit switch remove and rollback mutate a sandbox copy through the built CLI entrypoint",
      async run() {
        const codexDir = makeSandboxCopy();

        const edit = await runJsonCli([
          "edit",
          "beta",
          "--note",
          "secondary",
          "--tag",
          "backup",
          "--json",
          "--codex-dir",
          codexDir,
        ]);
        assert.equal(edit.status, 0);
        assert.ok(edit.payload.data.updatedFields.includes("note"));

        const switched = await runJsonCli(["switch", "freemodel", "--json", "--codex-dir", codexDir]);
        assert.equal(switched.status, 0);
        assert.equal(switched.payload.data.profile, "freemodel");
        const switchedConfig = fs.readFileSync(path.join(codexDir, "config.toml"), "utf8");
        assert.match(switchedConfig, /profile = "freemodel"/);
        const switchedAuth = JSON.parse(fs.readFileSync(path.join(codexDir, "auth.json"), "utf8"));
        assert.equal(switchedAuth.auth_mode, "apikey");
        assert.equal(switchedAuth.OPENAI_API_KEY, "freemodel-123");

        const blockedRemove = await runJsonCli(["remove", "freemodel", "--force", "--json", "--codex-dir", codexDir]);
        assert.equal(blockedRemove.status, 1);
        assert.equal(blockedRemove.payload.error.code, "PROFILE_IN_USE");

        const removed = await runJsonCli(["remove", "beta", "--force", "--json", "--codex-dir", codexDir]);
        assert.equal(removed.status, 0);
        assert.equal(removed.payload.data.provider, "beta");

        const rollback = await runJsonCli(["rollback", "--json", "--codex-dir", codexDir]);
        assert.equal(rollback.status, 0);
        const restoredConfig = fs.readFileSync(path.join(codexDir, "config.toml"), "utf8");
        assert.match(restoredConfig, /profile = "freemodel"/);
      },
    },
    {
      name: "switch rejects install-copilot-sdk through the built CLI entrypoint",
      async run() {
        const codexDir = makeSandboxCopy();
        const switched = await runJsonCli(["switch", "freemodel", "--install-copilot-sdk", "--json", "--codex-dir", codexDir]);
        assert.equal(switched.status, 1);
        assert.equal(switched.payload.error.code, "INVALID_ARGUMENT");
        assert.match(switched.payload.error.message, /login copilot/i);
      },
    },
    {
      name: "bridge start status and stop execute through the built CLI entrypoint",
      async run() {
        await withFakeCopilotSdk(async () => {
          const codexDir = makeSandboxCopy();
          const bridgePort = await getFreePort();
          const add = await runJsonCli([
            "add",
            "copilot-main",
            "--copilot",
            "--profile",
            "copilot-main",
            "--create-profile",
            "--model",
            "gpt-4o-mini",
            "--bridge-port",
            String(bridgePort),
            "--json",
            "--codex-dir",
            codexDir,
          ]);
          assert.equal(add.status, 0);

          const started = await runJsonCli(["bridge", "start", "copilot-main", "--json", "--codex-dir", codexDir]);
          assert.equal(started.status, 0);
          assert.equal(started.payload.data.provider, "copilot-main");

          const status = await runJsonCli(["bridge", "status", "copilot-main", "--json", "--codex-dir", codexDir]);
          assert.equal(status.status, 0);
          assert.equal(status.payload.data.provider, "copilot-main");
          assert.equal(status.payload.data.health.ok, true);

          const stopped = await runJsonCli(["bridge", "stop", "copilot-main", "--json", "--codex-dir", codexDir]);
          assert.equal(stopped.status, 0);
          assert.equal(stopped.payload.data.provider, "copilot-main");
          assert.equal(stopped.payload.data.stopped, true);
        });
      },
    },
    {
      name: "import export and explicit rollback errors stay stable through the built CLI entrypoint",
      async run() {
        const codexDir = makeSandboxCopy();
        const toolHomeDir = makeToolHomeWithManagedState();
        const exportFile = path.join(codexDir, "exports", "providers.json");
        const importFile = path.join(codexDir, "imports", "providers.json");
        fs.mkdirSync(path.dirname(importFile), { recursive: true });
        fs.writeFileSync(
          importFile,
          `${JSON.stringify(
            {
              providers: {
                alpha: {
                  profile: "alpha",
                  apiKey: "sk-alpha-updated",
                  note: "restored",
                },
              },
            },
            null,
            2
          )}\n`,
          "utf8"
        );

        const exported = await runJsonCli({
          args: ["export", exportFile, "--force", "--json", "--codex-dir", codexDir],
          toolHomeDir,
        });
        assert.equal(exported.status, 0);
        assert.ok(fs.existsSync(exportFile));

        const imported = await runJsonCli({
          args: ["import", importFile, "--json", "--codex-dir", codexDir],
          toolHomeDir,
        });
        assert.equal(imported.status, 0);
        assert.equal(imported.payload.data.mode, "replace");
        const providers = JSON.parse(fs.readFileSync(path.join(toolHomeDir, "providers.json"), "utf8"));
        assert.deepEqual(Object.keys(providers.providers), ["alpha"]);
        assert.equal(providers.providers.alpha.note, "restored");

        const missingRollback = await runJsonCli({
          args: ["rollback", "missing-backup", "--json", "--codex-dir", codexDir],
          toolHomeDir,
        });
        assert.equal(missingRollback.status, 1);
        assert.equal(missingRollback.payload.error.code, "BACKUP_NOT_FOUND");
      },
    },
    {
      name: "migrate and setup expose the current non-interactive command contract",
      async run() {
        const migrate = await runJsonCli(["migrate", "--overwrite", "--json", "--codex-dir", fixtureCodexDir]);
        assert.equal(migrate.status, 1);
        assert.equal(migrate.payload.error.code, "MIGRATE_NO_ADOPTABLE_PROFILES");
        assert.ok(Array.isArray(migrate.payload.error.details.adoptableProfiles));
        assert.equal(migrate.payload.error.details.adoptableProfiles.length, 0);

        const setup = await runJsonCli(["setup", "--json", "--codex-dir", fixtureCodexDir]);
        assert.equal(setup.status, 1);
        assert.equal(setup.payload.error.code, "COMMAND_DEPRECATED");
      },
    },
  ],
};
