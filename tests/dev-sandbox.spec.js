const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  setCodexSpawnImplementation,
  resetCodexSpawnImplementation,
} = require("../dist/infra/codex-cli");
const {
  makeTempRoot,
  runCliJson,
  devSandboxDir,
} = require("./helpers");

async function run() {
  await testDevelopmentDefaultReadCommands();
  await testExplicitSandboxReadCommandsAndDoctor();
}

async function testDevelopmentDefaultReadCommands() {
  const options = {
    env: {
      NODE_ENV: "development",
    },
    deleteEnv: ["CODEXS_CODEX_DIR"],
  };

  const listResult = await runCliJson(["list"], options);
  assert.equal(listResult.status, 0, listResult.stderrText);
  assert.equal(listResult.envelope.ok, true);
  assert.equal(listResult.envelope.command, "list");
  assert.equal(listResult.envelope.data.count, 2);
  assert.deepEqual(
    listResult.envelope.data.providers.map((provider) => provider.name).sort(),
    ["freemodel", "packycode"]
  );

  const currentResult = await runCliJson(["current"], options);
  assert.equal(currentResult.status, 0, currentResult.stderrText);
  assert.equal(currentResult.envelope.data.profile, "packycode");

  const statusResult = await runCliJson(["status"], options);
  assert.equal(statusResult.status, 0, statusResult.stderrText);
  assert.equal(statusResult.envelope.data.codexDir, devSandboxDir);
  assert.equal(statusResult.envelope.data.currentProfile, "packycode");
  assert.equal(statusResult.envelope.data.provider, "packycode");
  assert.deepEqual(statusResult.envelope.data.issues, []);
}

async function testExplicitSandboxReadCommandsAndDoctor() {
  const tempRoot = makeTempRoot();
  try {
    setCodexSpawnImplementation((_command, args) => {
      if (args.includes("--version") || args.some((value) => String(value).includes("codex --version"))) {
        return { status: 0, stderr: "", stdout: "codex 0.0.5", error: undefined };
      }
      return { status: 0, stderr: "", stdout: "", error: undefined };
    });

    const configResult = await runCliJson(["config", "show", "--codex-dir", devSandboxDir]);
    assert.equal(configResult.status, 0, configResult.stderrText);
    assert.equal(configResult.envelope.command, "config-show");
    assert.equal(configResult.envelope.data.activeProfile, "packycode");
    assert.deepEqual(
      configResult.envelope.data.profiles.map((profile) => profile.name).sort(),
      ["freemodel", "packycode"]
    );

    const backupsResult = await runCliJson(["backups", "list", "--codex-dir", devSandboxDir]);
    assert.equal(backupsResult.status, 0, backupsResult.stderrText);
    assert.equal(backupsResult.envelope.command, "backups-list");
    assert.equal(backupsResult.envelope.data.count >= 1, true);

    const doctorResult = await runCliJson(["doctor", "--codex-dir", devSandboxDir]);
    assert.equal(doctorResult.status, 0, doctorResult.stderrText);
    assert.equal(doctorResult.envelope.command, "doctor");
    assert.equal(doctorResult.envelope.data.codexDir, devSandboxDir);
    assert.equal(doctorResult.envelope.data.healthy, true);
    assert.deepEqual(doctorResult.envelope.data.issues, []);
  } finally {
    resetCodexSpawnImplementation();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

module.exports = { run };
