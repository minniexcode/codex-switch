const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { listProviders } = require("../dist/app/list-providers");
const { getCurrentProfile } = require("../dist/app/get-current-profile");
const { getStatus } = require("../dist/app/get-status");
const { addProvider } = require("../dist/app/add-provider");
const { exportProviders } = require("../dist/app/export-providers");
const { importProviders } = require("../dist/app/import-providers");
const { removeProvider } = require("../dist/app/remove-provider");
const { switchProvider } = require("../dist/app/switch-provider");
const { rollbackLatest } = require("../dist/app/rollback-latest");
const { runDoctor } = require("../dist/app/run-doctor");
const {
  setCodexSpawnImplementation,
  resetCodexSpawnImplementation,
} = require("../dist/infra/codex-cli");
const { makeTempRoot, createFixturePaths } = require("./helpers");

function run() {
  testReadCommands();
  testProviderMutations();
  testSwitchSuccessWithLogin();
  testSwitchRollbackOnLoginFailure();
  testRollbackCommand();
  testDoctor();
  testFailurePaths();
  testListAndDoctorErrorPaths();
}

function testReadCommands() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-read"));

    const listed = listProviders(paths.providersPath);
    assert.equal(listed.data.count, 2);

    const current = getCurrentProfile(paths.configPath);
    assert.equal(current.data.profile, "packycode");

    const status = getStatus(paths.codexDir, paths.configPath, paths.providersPath);
    assert.equal(status.data.currentProfile, "packycode");
    assert.equal(status.data.provider, "packycode");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testProviderMutations() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-mutate"));

    const added = addProvider({
      codexDir: paths.codexDir,
      backupsDir: paths.backupsDir,
      latestBackupPath: paths.latestBackupPath,
      providersPath: paths.providersPath,
      providerName: "newprovider",
      profile: "freemodel",
      apiKey: "sk-added",
      tags: ["daily"],
    });
    assert.equal(added.data.provider, "newprovider");

    const exportFile = path.join(tempRoot, "providers-export.json");
    const exported = exportProviders({
      providersPath: paths.providersPath,
      targetFile: exportFile,
      force: false,
    });
    assert.equal(exported.data.count, 3);
    assert.equal(fs.existsSync(exportFile), true);

    const importFile = path.join(tempRoot, "providers-import.json");
    fs.writeFileSync(
      importFile,
      JSON.stringify({
        providers: {
          imported: {
            profile: "freemodel",
            apiKey: "sk-imported",
          },
        },
      }),
      "utf8"
    );

    const imported = importProviders({
      codexDir: paths.codexDir,
      backupsDir: paths.backupsDir,
      latestBackupPath: paths.latestBackupPath,
      providersPath: paths.providersPath,
      sourceFile: importFile,
    });
    assert.deepEqual(imported.data.importedProviders, ["imported"]);
    assert.equal(listProviders(paths.providersPath).data.count, 1);

    const removed = removeProvider({
      codexDir: paths.codexDir,
      backupsDir: paths.backupsDir,
      latestBackupPath: paths.latestBackupPath,
      providersPath: paths.providersPath,
      providerName: "imported",
    });
    assert.equal(removed.data.provider, "imported");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testSwitchRollbackOnLoginFailure() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-switch-fail"));
    setCodexSpawnImplementation(() => ({
      status: 1,
      stderr: "login failed",
      stdout: "",
      error: undefined,
    }));
    try {
      assert.throws(
        () =>
          switchProvider({
            codexDir: paths.codexDir,
            backupsDir: paths.backupsDir,
            latestBackupPath: paths.latestBackupPath,
            configPath: paths.configPath,
            providersPath: paths.providersPath,
            authPath: paths.authPath,
            providerName: "freemodel",
            noLogin: false,
          }),
        (error) => error.code === "CODEX_LOGIN_FAILED" && error.details.rollbackApplied === true
      );
    } finally {
      resetCodexSpawnImplementation();
    }

    const configContent = fs.readFileSync(paths.configPath, "utf8");
    assert.match(configContent, /profile = "packycode"/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testSwitchSuccessWithLogin() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-switch-success"));
    setCodexSpawnImplementation(() => ({
      status: 0,
      stderr: "",
      stdout: "",
      error: undefined,
    }));
    try {
      const switched = switchProvider({
        codexDir: paths.codexDir,
        backupsDir: paths.backupsDir,
        latestBackupPath: paths.latestBackupPath,
        configPath: paths.configPath,
        providersPath: paths.providersPath,
        authPath: paths.authPath,
        providerName: "freemodel",
        noLogin: false,
      });
      assert.equal(switched.data.provider, "freemodel");
      assert.equal(switched.data.loginPerformed, true);
    } finally {
      resetCodexSpawnImplementation();
    }

    const current = getCurrentProfile(paths.configPath);
    assert.equal(current.data.profile, "freemodel");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testRollbackCommand() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-rollback"));
    const switched = switchProvider({
      codexDir: paths.codexDir,
      backupsDir: paths.backupsDir,
      latestBackupPath: paths.latestBackupPath,
      configPath: paths.configPath,
      providersPath: paths.providersPath,
      authPath: paths.authPath,
      providerName: "freemodel",
      noLogin: true,
    });
    assert.equal(switched.data.provider, "freemodel");

    const rollback = rollbackLatest(paths.latestBackupPath);
    assert.deepEqual(rollback.data.restoredFiles, ["config.toml", "auth.json"]);
    assert.equal(getCurrentProfile(paths.configPath).data.profile, "packycode");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testDoctor() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-doctor"));
    setCodexSpawnImplementation(() => ({
      status: 1,
      stderr: "codex missing",
      stdout: "",
      error: undefined,
    }));
    const doctor = runDoctor({
      codexDir: paths.codexDir,
      configPath: paths.configPath,
      providersPath: paths.providersPath,
    });
    assert.equal(Array.isArray(doctor.data.issues), true);
    resetCodexSpawnImplementation();
  } finally {
    resetCodexSpawnImplementation();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testFailurePaths() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-failures"));

    assert.throws(
      () =>
        switchProvider({
          codexDir: paths.codexDir,
          backupsDir: paths.backupsDir,
          latestBackupPath: paths.latestBackupPath,
          configPath: paths.configPath,
          providersPath: paths.providersPath,
          authPath: paths.authPath,
          providerName: "missing",
          noLogin: true,
        }),
      (error) => error.code === "PROVIDER_NOT_FOUND"
    );

    fs.writeFileSync(
      paths.configPath,
      [
        'profile = "packycode"',
        "",
        "[profiles.packycode]",
        'model = "gpt-5"',
      ].join("\n"),
      "utf8"
    );
    fs.writeFileSync(
      paths.providersPath,
      JSON.stringify({
        providers: {
          packycode: {
            profile: "missing-profile",
            apiKey: "sk-packycode",
          },
        },
      }),
      "utf8"
    );
    assert.throws(
      () =>
        switchProvider({
          codexDir: paths.codexDir,
          backupsDir: paths.backupsDir,
          latestBackupPath: paths.latestBackupPath,
          configPath: paths.configPath,
          providersPath: paths.providersPath,
          authPath: paths.authPath,
          providerName: "packycode",
          noLogin: true,
        }),
      (error) => error.code === "PROFILE_NOT_FOUND"
    );

    const exportFile = path.join(tempRoot, "existing-export.json");
    fs.writeFileSync(exportFile, "existing", "utf8");
    assert.throws(
      () =>
        exportProviders({
          providersPath: paths.providersPath,
          targetFile: exportFile,
          force: false,
        }),
      (error) => error.code === "INVALID_IMPORT_FILE"
    );
    assert.doesNotThrow(() =>
      exportProviders({
        providersPath: paths.providersPath,
        targetFile: exportFile,
        force: true,
      })
    );

    const badImport = path.join(tempRoot, "bad-import.json");
    fs.writeFileSync(badImport, "{not-json", "utf8");
    assert.throws(
      () =>
        importProviders({
          codexDir: paths.codexDir,
          backupsDir: paths.backupsDir,
          latestBackupPath: paths.latestBackupPath,
          providersPath: paths.providersPath,
          sourceFile: badImport,
        }),
      (error) => error.code === "INVALID_IMPORT_FILE"
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testListAndDoctorErrorPaths() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-list-doctor-errors"));

    fs.rmSync(paths.providersPath, { force: true });
    assert.throws(
      () => listProviders(paths.providersPath),
      (error) => error.code === "PROVIDERS_NOT_FOUND"
    );

    fs.writeFileSync(paths.providersPath, "{not-json", "utf8");
    assert.throws(
      () => listProviders(paths.providersPath),
      (error) => error.code === "PROVIDERS_PARSE_ERROR"
    );

    const doctor = runDoctor({
      codexDir: paths.codexDir,
      configPath: paths.configPath,
      providersPath: paths.providersPath,
    });
    const issueCodes = doctor.data.issues.map((issue) => issue.code);
    assert.equal(issueCodes.includes("PROVIDERS_PARSE_ERROR"), true);

    fs.rmSync(paths.configPath, { force: true });
    const doctorWithoutConfig = runDoctor({
      codexDir: paths.codexDir,
      configPath: paths.configPath,
      providersPath: paths.providersPath,
    });
    const configIssueCodes = doctorWithoutConfig.data.issues.map((issue) => issue.code);
    assert.equal(configIssueCodes.includes("CONFIG_NOT_FOUND"), true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

module.exports = { run };
