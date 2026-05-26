"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const cliPath = path.join(repoRoot, "dist", "cli.js");

function runCli(args, env = {}) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      ...env,
    },
    encoding: "utf8",
  });
}

function runCliAllowFailure(args, env = {}) {
  try {
    return {
      stdout: runCli(args, env),
      stderr: "",
      code: 0,
    };
  } catch (error) {
    assert.ok(error && typeof error === "object");
    return {
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? ""),
      code: typeof error.status === "number" ? error.status : 1,
    };
  }
}

function runJsonCli(args, env = {}) {
  const output = runCli([...args, "--json"], env);
  return JSON.parse(output.trim());
}

function makeTempCodexHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-release-"));
  const toolHome = path.join(root, "tool-home");
  const codexDir = path.join(root, "codex");
  fs.mkdirSync(toolHome, { recursive: true });
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(
    path.join(toolHome, "codex-switch.json"),
    `${JSON.stringify({ version: "0.1.0", defaultCodexDir: codexDir }, null, 2)}\n`,
    "utf8"
  );
  return { root, toolHome, codexDir };
}

function writeConfig(codexDir, contents) {
  fs.writeFileSync(path.join(codexDir, "config.toml"), contents, "utf8");
}

function writeProviders(toolHome, contents) {
  fs.writeFileSync(path.join(toolHome, "providers.json"), `${JSON.stringify(contents, null, 2)}\n`, "utf8");
}

function writeAuth(codexDir, contents) {
  fs.writeFileSync(path.join(codexDir, "auth.json"), `${JSON.stringify(contents, null, 2)}\n`, "utf8");
}

function run() {
  testHelpAndVersion();
  testReleaseDocsExist();
  testDirectProviderLifecycle();
  testDirectProviderBaseUrlDriftDiagnostics();
  testEditBaseUrlSyncsExistingDirectProjection();
  testAmbiguousListAndStatus();
  testDoctorAndSetupContract();
}

function testHelpAndVersion() {
  const help = runCli(["--help"]);
  assert.match(help, /codex-switch/);
  assert.match(help, /Primary workflows: direct providers use init -> add -> switch -> status -> doctor\./);
  assert.match(help, /Deprecated entry: setup still exists only to point callers to init or migrate\./);

  const version = runCli(["--version"]).trim();
  assert.equal(version, "0.1.0");
}

function testReleaseDocsExist() {
  assert.ok(fs.existsSync(path.join(repoRoot, "docs", "Tests", "testing.md")));
  assert.ok(fs.existsSync(path.join(repoRoot, "CHANGELOG.md")));
}

function testDirectProviderLifecycle() {
  const state = makeTempCodexHome();
  writeConfig(
    state.codexDir,
    [
      'profile = "packycode"',
      "",
      "[profiles.packycode]",
      'model = "gpt-5.4"',
      'model_provider = "packycode"',
      "",
      "[model_providers.packycode]",
      'base_url = "https://api.example.com/v1"',
      'name = "packycode"',
      "requires_openai_auth = true",
      'wire_api = "responses"',
      "",
    ].join("\n")
  );
  writeProviders(state.toolHome, {
    providers: {
      packycode: {
        profile: "packycode",
        apiKey: "sk-test",
        baseUrl: "https://api.example.com/v1",
      },
    },
  });

  const list = runJsonCli(["list"], {
    CODEXS_HOME: state.toolHome,
    CODEXS_CODEX_DIR: state.codexDir,
  });
  assert.equal(list.ok, true);
  assert.equal(list.command, "list");
  assert.equal(list.data.providers[0].providerType, "direct");
  assert.equal(list.data.providers[0].isActive, true);

  const status = runJsonCli(["status"], {
    CODEXS_HOME: state.toolHome,
    CODEXS_CODEX_DIR: state.codexDir,
  });
  assert.equal(status.ok, true);
  assert.equal(status.data.currentProfile, "packycode");
  assert.equal(status.data.storage.toolHome.root, state.toolHome);
  assert.equal(status.data.runtimeProvider, null);

  const doctor = runJsonCli(["doctor"], {
    CODEXS_HOME: state.toolHome,
    CODEXS_CODEX_DIR: state.codexDir,
  });
  assert.equal(doctor.ok, true);
  assert.equal(doctor.data.healthy, true);
}

function testDirectProviderBaseUrlDriftDiagnostics() {
  const state = makeTempCodexHome();
  writeConfig(
    state.codexDir,
    [
      'profile = "packycode"',
      "",
      "[profiles.packycode]",
      'model = "gpt-5.4"',
      'model_provider = "packycode"',
      "",
      "[model_providers.packycode]",
      'base_url = "https://config.example.com/v1"',
      'name = "packycode"',
      "requires_openai_auth = true",
      'wire_api = "responses"',
      "",
    ].join("\n")
  );
  writeProviders(state.toolHome, {
    providers: {
      packycode: {
        profile: "packycode",
        apiKey: "sk-test",
        baseUrl: "https://provider.example.com/v1",
      },
    },
  });

  const status = runJsonCli(["status"], {
    CODEXS_HOME: state.toolHome,
    CODEXS_CODEX_DIR: state.codexDir,
  });
  const statusMismatch = status.data.issues.find((issue) => issue.code === "PROVIDER_BASE_URL_MISMATCH");
  assert.ok(statusMismatch);
  assert.equal(statusMismatch.profile, "packycode");
  assert.equal(statusMismatch.provider, "packycode");
  assert.equal(statusMismatch.providerBaseUrl, "https://provider.example.com/v1");
  assert.equal(statusMismatch.configBaseUrl, "https://config.example.com/v1");
  assert.equal(statusMismatch.providerType, "direct");

  const doctor = runJsonCli(["doctor"], {
    CODEXS_HOME: state.toolHome,
    CODEXS_CODEX_DIR: state.codexDir,
  });
  const doctorMismatch = doctor.data.issues.find((issue) => issue.code === "PROVIDER_BASE_URL_MISMATCH");
  assert.ok(doctorMismatch);
  assert.equal(doctor.data.healthy, false);

  const statusText = runCli(["status"], {
    CODEXS_HOME: state.toolHome,
    CODEXS_CODEX_DIR: state.codexDir,
  });
  assert.match(statusText, /runtime health: provider projection drift/);
}

function testEditBaseUrlSyncsExistingDirectProjection() {
  const state = makeTempCodexHome();
  writeConfig(
    state.codexDir,
    [
      'profile = "packycode"',
      "",
      "[profiles.packycode]",
      'model = "gpt-5.4"',
      'model_provider = "packycode"',
      "",
      "[model_providers.packycode]",
      'base_url = "https://old.example.com/v1"',
      'name = "packycode"',
      "requires_openai_auth = true",
      'wire_api = "responses"',
      "",
    ].join("\n")
  );
  writeProviders(state.toolHome, {
    providers: {
      packycode: {
        profile: "packycode",
        apiKey: "sk-test",
        baseUrl: "https://old.example.com/v1",
      },
    },
  });

  const edit = runJsonCli(["edit", "packycode", "--base-url", "https://new.example.com/v1"], {
    CODEXS_HOME: state.toolHome,
    CODEXS_CODEX_DIR: state.codexDir,
  });
  assert.equal(edit.ok, true);

  const providers = JSON.parse(fs.readFileSync(path.join(state.toolHome, "providers.json"), "utf8"));
  assert.equal(providers.providers.packycode.baseUrl, "https://new.example.com/v1");

  const config = fs.readFileSync(path.join(state.codexDir, "config.toml"), "utf8");
  assert.match(config, /base_url = "https:\/\/new\.example\.com\/v1"/);
  assert.match(config, /name = "packycode"/);
  assert.match(config, /requires_openai_auth = true/);
  assert.match(config, /wire_api = "responses"/);
}

function testAmbiguousListAndStatus() {
  const state = makeTempCodexHome();
  writeConfig(
    state.codexDir,
    [
      'profile = "shared"',
      "",
      "[profiles.shared]",
      'model = "gpt-5.4"',
      'model_provider = "shared"',
      "",
      "[model_providers.shared]",
      'base_url = "https://api.example.com/v1"',
      'name = "shared"',
      "requires_openai_auth = true",
      'wire_api = "responses"',
      "",
    ].join("\n")
  );
  writeProviders(state.toolHome, {
    providers: {
      alpha: {
        profile: "shared",
        apiKey: "sk-alpha",
        baseUrl: "https://api.example.com/v1",
      },
      beta: {
        profile: "shared",
        apiKey: "sk-beta",
        baseUrl: "https://api.example.com/v1",
      },
    },
  });

  const list = runJsonCli(["list"], {
    CODEXS_HOME: state.toolHome,
    CODEXS_CODEX_DIR: state.codexDir,
  });
  assert.equal(list.data.activeProviderResolvable, false);
  assert.deepEqual(list.data.activeProviderCandidates, ["alpha", "beta"]);

  const statusText = runCli(["status"], {
    CODEXS_HOME: state.toolHome,
    CODEXS_CODEX_DIR: state.codexDir,
  });
  assert.match(statusText, /mapped provider: \(ambiguous: alpha, beta\)/);
  assert.match(statusText, /next step:/);
}

function testDoctorAndSetupContract() {
  const state = makeTempCodexHome();
  writeConfig(
    state.codexDir,
    [
      'profile = "packycode"',
      "",
      "[profiles.packycode]",
      'model = "gpt-5.4"',
      'model_provider = "packycode"',
      "",
      "[model_providers.packycode]",
      'base_url = "https://api.example.com/v1"',
      'name = "packycode"',
      "requires_openai_auth = true",
      'wire_api = "responses"',
      "",
    ].join("\n")
  );

  const migrate = runCliAllowFailure(["migrate", "--codex-dir", state.codexDir], {
    CODEXS_HOME: state.toolHome,
  });
  assert.equal(migrate.code, 1);
  assert.match(migrate.stderr, /migrate currently requires an interactive TTY/i);

  const setup = runCliAllowFailure(["setup", "--codex-dir", state.codexDir], {
    CODEXS_HOME: state.toolHome,
  });
  assert.equal(setup.code, 1);
  assert.match(setup.stderr, /setup has been split into init and migrate/);
}

module.exports = { run };
