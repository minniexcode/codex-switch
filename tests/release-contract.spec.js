"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runBuiltCli, runJsonCli, repoRoot } = require("./helpers.js");

async function runCli(args, env = {}) {
  const result = await runBuiltCli({
    args,
    toolHomeDir: env.CODEXS_HOME,
  });
  if (result.status !== 0) {
    const error = new Error(result.stderr || result.stdout || `CLI failed with status ${result.status}`);
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    error.status = result.status;
    throw error;
  }
  return result.stdout;
}

async function runCliAllowFailure(args, env = {}) {
  const result = await runBuiltCli({
    args,
    toolHomeDir: env.CODEXS_HOME,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    code: result.status,
  };
}

async function runJsonCliWithEnv(args, env = {}) {
  const result = await runJsonCli({
    args: [...args, "--json"],
    toolHomeDir: env.CODEXS_HOME,
  });
  return result.payload;
}

function makeTempCodexHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-release-"));
  const toolHome = path.join(root, "tool-home");
  const codexDir = path.join(root, "codex");
  fs.mkdirSync(toolHome, { recursive: true });
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(
    path.join(toolHome, "codex-switch.json"),
      `${JSON.stringify({ version: "0.1.2", defaultCodexDir: codexDir }, null, 2)}\n`,
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

async function run() {
  await testHelpAndVersion();
  testReleaseDocsExist();
  await testDirectProviderLifecycle();
  await testDirectProviderBaseUrlDriftDiagnostics();
  await testEditBaseUrlSyncsExistingDirectProjection();
  await testAmbiguousListAndStatus();
  await testDoctorAndSetupContract();
}

async function testHelpAndVersion() {
  const help = await runCli(["--help"]);
  assert.match(help, /codex-switch/);
  assert.match(help, /Primary workflows: direct providers use init -> add -> switch -> status -> doctor\./);
  assert.match(help, /Deprecated entry: setup still exists only to point callers to init or migrate\./);

  const version = (await runCli(["--version"])).trim();
  assert.equal(version, "0.1.2");
}

function testReleaseDocsExist() {
  assert.ok(fs.existsSync(path.join(repoRoot, "docs", "Tests", "testing.md")));
  assert.ok(fs.existsSync(path.join(repoRoot, "CHANGELOG.md")));
  assert.ok(fs.existsSync(path.join(repoRoot, "docs", "Design", "codex-switch-v0.1.1-design.md")));
}

async function testDirectProviderLifecycle() {
  const state = makeTempCodexHome();
  writeConfig(
    state.codexDir,
    [
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
        model: "gpt-5.4",
        apiKey: "sk-test",
        baseUrl: "https://api.example.com/v1",
      },
    },
  });

  const list = await runJsonCliWithEnv(["list", "--codex-dir", state.codexDir], {
    CODEXS_HOME: state.toolHome,
  });
  assert.equal(list.ok, true);
  assert.equal(list.command, "list");
  assert.equal(list.data.providers[0].providerType, "direct");
  assert.equal(list.data.providers[0].isActive, true);
  assert.equal(list.data.currentModelProvider, "packycode");

  const status = await runJsonCliWithEnv(["status", "--codex-dir", state.codexDir], {
    CODEXS_HOME: state.toolHome,
  });
  assert.equal(status.ok, true);
  assert.equal(status.data.currentModelProvider, "packycode");
  assert.equal(status.data.currentModel, "gpt-5.4");
  assert.equal(status.data.storage.toolHome.root, state.toolHome);
  assert.equal(status.data.runtimeProvider, null);
}

async function testDirectProviderBaseUrlDriftDiagnostics() {
  const state = makeTempCodexHome();
  writeConfig(
    state.codexDir,
    [
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
        model: "gpt-5.4",
        apiKey: "sk-test",
        baseUrl: "https://provider.example.com/v1",
      },
    },
  });

  const status = await runJsonCliWithEnv(["status", "--codex-dir", state.codexDir], {
    CODEXS_HOME: state.toolHome,
  });
  const statusMismatch = status.data.issues.find((issue) => issue.code === "PROVIDER_BASE_URL_MISMATCH");
  assert.ok(statusMismatch);
  assert.equal(statusMismatch.modelProvider, "packycode");
  assert.equal(statusMismatch.provider, "packycode");
}

async function testEditBaseUrlSyncsExistingDirectProjection() {
  const state = makeTempCodexHome();
  writeConfig(
    state.codexDir,
    [
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
        model: "gpt-5.4",
        apiKey: "sk-test",
        baseUrl: "https://old.example.com/v1",
      },
    },
  });

  const edit = await runJsonCliWithEnv(["edit", "packycode", "--base-url", "https://new.example.com/v1", "--codex-dir", state.codexDir], {
    CODEXS_HOME: state.toolHome,
  });
  assert.equal(edit.ok, true);

  const providers = JSON.parse(fs.readFileSync(path.join(state.toolHome, "providers.json"), "utf8"));
  assert.equal(providers.providers.packycode.baseUrl, "https://new.example.com/v1");

  const config = fs.readFileSync(path.join(state.codexDir, "config.toml"), "utf8");
  assert.match(config, /base_url = "https:\/\/new\.example\.com\/v1"/);
}

async function testAmbiguousListAndStatus() {
  const state = makeTempCodexHome();
  writeConfig(
    state.codexDir,
    [
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
        model: "gpt-5.4",
        apiKey: "sk-alpha",
        baseUrl: "https://api.example.com/v1",
      },
      beta: {
        profile: "shared",
        model: "gpt-5.4",
        apiKey: "sk-beta",
        baseUrl: "https://api.example.com/v1",
      },
    },
  });

  const list = await runJsonCliWithEnv(["list", "--codex-dir", state.codexDir], {
    CODEXS_HOME: state.toolHome,
  });
  assert.equal(list.data.activeProviderResolvable, false);
  assert.deepEqual(list.data.activeProviderCandidates, ["alpha", "beta"]);
}

async function testDoctorAndSetupContract() {
  const state = makeTempCodexHome();
  writeConfig(
    state.codexDir,
    [
      'model = "gpt-5.4"',
      'model_provider = "packycode"',
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
      'env_key = "PACKYCODE_API_KEY"',
      "",
    ].join("\n")
  );
  writeProviders(state.toolHome, { providers: {} });

  const doctor = await runJsonCliWithEnv(["doctor", "--codex-dir", state.codexDir], {
    CODEXS_HOME: state.toolHome,
  });
  assert.equal(doctor.ok, true);
  assert.equal(doctor.data.healthy, false);
  assert.ok(doctor.data.issues.some((issue) => issue.code === "LEGACY_PROFILE_SECTION"));
  assert.ok(doctor.data.issues.some((issue) => issue.code === "LEGACY_MODEL_PROVIDER_ENV_KEY"));

  const setup = await runCliAllowFailure(["setup", "--codex-dir", state.codexDir], {
    CODEXS_HOME: state.toolHome,
  });
  assert.equal(setup.code, 1);
  assert.match(setup.stderr, /setup has been split into init and migrate/);
}

module.exports = { run };
