const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { listProviders } = require("../dist/app/list-providers");
const { getCurrentProfile } = require("../dist/app/get-current-profile");
const { getStatus } = require("../dist/app/get-status");
const { addProvider } = require("../dist/app/add-provider");
const { editProvider } = require("../dist/app/edit-provider");
const { showProvider } = require("../dist/app/show-provider");
const { exportProviders } = require("../dist/app/export-providers");
const { importProviders } = require("../dist/app/import-providers");
const { listBackupEntries } = require("../dist/app/list-backups");
const { removeProvider } = require("../dist/app/remove-provider");
const { rollbackBackup } = require("../dist/app/rollback-backup");
const { setupCodex } = require("../dist/app/setup-codex");
const { switchProvider } = require("../dist/app/switch-provider");
const { runDoctor } = require("../dist/app/run-doctor");
const {
  setCodexSpawnImplementation,
  resetCodexSpawnImplementation,
} = require("../dist/infra/codex-cli");
const { makeTempRoot, createFixturePaths } = require("./helpers");

function run() {
  testReadCommands();
  testProviderMutations();
  testManagedProfileLifecycle();
  testShowEditImportMergeAndSetup();
  testEditUpdatesManagedConfigSection();
  testSetupExplicitAdoptRules();
  testImportMergeAdoptAndRepairFlows();
  testSwitchUsesPlatformCodexCommand();
  testSwitchSuccessWithLogin();
  testSwitchRollbackOnLoginFailure();
  testRollbackCommand();
  testDoctor();
  testFailurePaths();
  testListAndDoctorErrorPaths();
  testLiveStateDriftAndLockConflict();
}

function testSwitchUsesPlatformCodexCommand() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-switch-platform-command"));
    const expectedCommand = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "codex";
    const expectedArgs = process.platform === "win32"
      ? ["/d", "/s", "/c", "codex login --with-api-key"]
      : ["login", "--with-api-key"];

    setCodexSpawnImplementation((command, args) => {
      assert.equal(command, expectedCommand);
      assert.deepEqual(args, expectedArgs);
      return {
        status: 0,
        stderr: "",
        stdout: "",
        error: undefined,
      };
    });

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
      assert.equal(switched.data.loginPerformed, true);
    } finally {
      resetCodexSpawnImplementation();
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testReadCommands() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-read"));
    assert.equal(listProviders(paths.providersPath).data.count, 2);
    assert.equal(getCurrentProfile(paths.configPath).data.profile, "packycode");

    const status = getStatus(paths.codexDir, paths.configPath, paths.providersPath);
    assert.equal(status.data.currentProfile, "packycode");
    assert.equal(status.data.provider, "packycode");
    assert.equal(status.data.storage.managementSSOT, "providers.json");
    assert.equal(status.data.liveState.reason, "ok");
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
      configPath: paths.configPath,
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
      configPath: paths.configPath,
      sourceFile: importFile,
    });
    assert.deepEqual(imported.data.importedProviders, ["imported"]);
    assert.equal(listProviders(paths.providersPath).data.count, 1);

    const removed = removeProvider({
      codexDir: paths.codexDir,
      backupsDir: paths.backupsDir,
      latestBackupPath: paths.latestBackupPath,
      providersPath: paths.providersPath,
      configPath: paths.configPath,
      providerName: "imported",
    });
    assert.equal(removed.data.provider, "imported");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testManagedProfileLifecycle() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-managed-profile-lifecycle"));

    const added = addProvider({
      codexDir: paths.codexDir,
      backupsDir: paths.backupsDir,
      latestBackupPath: paths.latestBackupPath,
      providersPath: paths.providersPath,
      configPath: paths.configPath,
      providerName: "created",
      profile: "created-profile",
      apiKey: "sk-created",
      baseUrl: "https://created.example.com/v1",
      model: "gpt-4.1",
      createProfile: true,
      tags: [],
    });
    assert.deepEqual(added.data.createdProfileSections, ["created-profile"]);
    let configContent = fs.readFileSync(paths.configPath, "utf8");
    assert.match(configContent, /\[profiles\.created-profile\]/);
    assert.match(configContent, /base_url = "https:\/\/created\.example\.com\/v1"/);

    const removed = removeProvider({
      codexDir: paths.codexDir,
      backupsDir: paths.backupsDir,
      latestBackupPath: paths.latestBackupPath,
      providersPath: paths.providersPath,
      configPath: paths.configPath,
      providerName: "packycode",
      switchToProfile: "freemodel",
    });
    assert.equal(removed.data.switchedActiveProfile, true);
    configContent = fs.readFileSync(paths.configPath, "utf8");
    assert.match(configContent, /profile = "freemodel"/);
    assert.equal(configContent.includes("[profiles.packycode]"), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testShowEditImportMergeAndSetup() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-show-edit-merge-setup"));

    const shown = showProvider({
      providersPath: paths.providersPath,
      providerName: "packycode",
      includeSecret: false,
    });
    assert.equal(shown.data.provider.apiKey, "sk-***de");

    const edited = editProvider({
      codexDir: paths.codexDir,
      backupsDir: paths.backupsDir,
      latestBackupPath: paths.latestBackupPath,
      providersPath: paths.providersPath,
      configPath: paths.configPath,
      providerName: "packycode",
      note: "updated",
      tags: ["daily", "paid"],
    });
    assert.deepEqual(edited.data.updatedFields, ["note", "tags"]);
    assert.equal(JSON.parse(fs.readFileSync(paths.providersPath, "utf8")).providers.packycode.note, "updated");

    const importFile = path.join(tempRoot, "providers-import-merge.json");
    fs.writeFileSync(
      importFile,
      JSON.stringify(
        {
          providers: {
            freemodel: {
              profile: "freemodel",
              apiKey: "sk-freemodel-next",
            },
            imported: {
              profile: "packycode",
              apiKey: "sk-imported",
            },
          },
        },
        null,
        2
      ),
      "utf8"
    );
    const merged = importProviders({
      codexDir: paths.codexDir,
      backupsDir: paths.backupsDir,
      latestBackupPath: paths.latestBackupPath,
      providersPath: paths.providersPath,
      configPath: paths.configPath,
      sourceFile: importFile,
      merge: true,
    });
    assert.equal(merged.data.mode, "merge");
    assert.deepEqual(merged.data.replacedProviders, ["freemodel"]);
    const mergedProviders = JSON.parse(fs.readFileSync(paths.providersPath, "utf8")).providers;
    assert.equal(mergedProviders.freemodel.apiKey, "sk-freemodel-next");
    assert.equal(mergedProviders.imported.apiKey, "sk-imported");

    setCodexSpawnImplementation((_command, args) => {
      if (args.includes("--version") || args.some((value) => value.includes("codex --version"))) {
        return { status: 0, stderr: "", stdout: "codex 0.0.4", error: undefined };
      }
      return { status: 0, stderr: "", stdout: "", error: undefined };
    });
    try {
      fs.rmSync(paths.providersPath, { force: true });
      const setup = setupCodex({
        codexDirOption: paths.codexDir,
        codexDir: paths.codexDir,
        configPath: paths.configPath,
        providersPath: paths.providersPath,
        backupsDir: paths.backupsDir,
        latestBackupPath: paths.latestBackupPath,
        strategy: "overwrite",
        adoptProfiles: ["manual-only"],
        providerDetailsByProfile: {
          "manual-only": { providerName: "manual-only", apiKey: "sk-manual-only" },
        },
      });
      assert.equal(setup.data.providersInitialized, 1);
      assert.equal(setup.data.doctor.healthy, false);
      assert.deepEqual(setup.data.adoptedProfiles, ["manual-only"]);
    } finally {
      resetCodexSpawnImplementation();
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testEditUpdatesManagedConfigSection() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-edit-managed-config"));

    let edited = editProvider({
      codexDir: paths.codexDir,
      backupsDir: paths.backupsDir,
      latestBackupPath: paths.latestBackupPath,
      providersPath: paths.providersPath,
      configPath: paths.configPath,
      providerName: "packycode",
      model: "gpt-5.1",
    });
    assert.deepEqual(edited.data.updatedFields, ["model"]);
    let configContent = fs.readFileSync(paths.configPath, "utf8");
    assert.match(configContent, /\[profiles\.packycode\][\s\S]*model = "gpt-5\.1"/);

    edited = editProvider({
      codexDir: paths.codexDir,
      backupsDir: paths.backupsDir,
      latestBackupPath: paths.latestBackupPath,
      providersPath: paths.providersPath,
      configPath: paths.configPath,
      providerName: "packycode",
      baseUrl: "https://relay-next.example.com/v1",
    });
    assert.deepEqual(edited.data.updatedFields, ["baseUrl"]);
    configContent = fs.readFileSync(paths.configPath, "utf8");
    assert.match(configContent, /base_url = "https:\/\/relay-next\.example\.com\/v1"/);
    const providers = JSON.parse(fs.readFileSync(paths.providersPath, "utf8"));
    assert.equal(providers.providers.packycode.baseUrl, "https://relay-next.example.com/v1");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testSetupExplicitAdoptRules() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-setup-adopt-rules"));
    setCodexSpawnImplementation((_command, args) => {
      if (args.includes("--version") || args.some((value) => value.includes("codex --version"))) {
        return { status: 0, stderr: "", stdout: "codex 0.0.5", error: undefined };
      }
      return { status: 0, stderr: "", stdout: "", error: undefined };
    });

    const setup = setupCodex({
      codexDirOption: paths.codexDir,
      codexDir: paths.codexDir,
      configPath: paths.configPath,
      providersPath: paths.providersPath,
      backupsDir: paths.backupsDir,
      latestBackupPath: paths.latestBackupPath,
      strategy: "merge",
      adoptProfiles: ["manual-only"],
      providerDetailsByProfile: {
        "manual-only": { providerName: "manual-only", apiKey: "sk-manual" },
      },
    });
    assert.deepEqual(setup.data.adoptedProfiles, ["manual-only"]);
    assert.equal(JSON.parse(fs.readFileSync(paths.providersPath, "utf8")).providers["manual-only"].apiKey, "sk-manual");

    fs.writeFileSync(
      paths.configPath,
      [
        'profile = "packycode"',
        "",
        "[profiles.packycode]",
        'model = "gpt-5"',
        'base_url = "https://relay.example.com/v1"',
        "",
        "[profiles.partial]",
        'model = "gpt-4.1-mini"',
        "",
      ].join("\n"),
      "utf8"
    );

    assert.throws(
      () =>
        setupCodex({
          codexDirOption: paths.codexDir,
          codexDir: paths.codexDir,
          configPath: paths.configPath,
          providersPath: paths.providersPath,
          backupsDir: paths.backupsDir,
          latestBackupPath: paths.latestBackupPath,
          strategy: "merge",
          adoptProfiles: ["partial"],
          providerDetailsByProfile: {
            partial: { providerName: "partial", apiKey: "sk-partial" },
          },
        }),
      (error) => error.code === "INVALID_ARGUMENT"
    );
  } finally {
    resetCodexSpawnImplementation();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testImportMergeAdoptAndRepairFlows() {
  const tempRoot = makeTempRoot();
  try {
    const adoptPaths = createFixturePaths(path.join(tempRoot, "case-import-adopt"));
    const adoptFile = path.join(tempRoot, "providers-import-adopt.json");
    fs.writeFileSync(
      adoptFile,
      JSON.stringify({
        providers: {
          adopted: {
            profile: "manual-only",
            apiKey: "sk-adopted",
          },
        },
      }),
      "utf8"
    );
    const adopted = importProviders({
      codexDir: adoptPaths.codexDir,
      backupsDir: adoptPaths.backupsDir,
      latestBackupPath: adoptPaths.latestBackupPath,
      providersPath: adoptPaths.providersPath,
      configPath: adoptPaths.configPath,
      sourceFile: adoptFile,
      merge: true,
    });
    assert.deepEqual(adopted.data.adoptedProfiles, ["manual-only"]);

    const repairPaths = createFixturePaths(path.join(tempRoot, "case-import-repair"));
    const repairFile = path.join(tempRoot, "providers-import-repair.json");
    fs.writeFileSync(
      repairFile,
      JSON.stringify({
        providers: {
          repaired: {
            profile: "missing-profile",
            apiKey: "sk-repaired",
          },
        },
      }),
      "utf8"
    );
    const repaired = importProviders({
      codexDir: repairPaths.codexDir,
      backupsDir: repairPaths.backupsDir,
      latestBackupPath: repairPaths.latestBackupPath,
      providersPath: repairPaths.providersPath,
      configPath: repairPaths.configPath,
      sourceFile: repairFile,
      merge: true,
      repairProfiles: {
        "missing-profile": {
          model: "gpt-4.1",
          baseUrl: "https://missing.example.com/v1",
        },
      },
    });
    assert.deepEqual(repaired.data.repairedProfiles, ["missing-profile"]);
    assert.match(fs.readFileSync(repairPaths.configPath, "utf8"), /\[profiles\.missing-profile\]/);

    const missingRepairPaths = createFixturePaths(path.join(tempRoot, "case-import-repair-missing"));
    assert.throws(
      () =>
        importProviders({
          codexDir: missingRepairPaths.codexDir,
          backupsDir: missingRepairPaths.backupsDir,
          latestBackupPath: missingRepairPaths.latestBackupPath,
          providersPath: missingRepairPaths.providersPath,
          configPath: missingRepairPaths.configPath,
          sourceFile: repairFile,
          merge: true,
        }),
      (error) => error.code === "MANAGED_PROFILE_FIELDS_MISSING"
    );
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
      assert.equal(switched.data.managedState.transaction, "single-process-file-lock");
    } finally {
      resetCodexSpawnImplementation();
    }

    assert.equal(getCurrentProfile(paths.configPath).data.profile, "freemodel");
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

    const backups = listBackupEntries(paths.backupsDir);
    assert.equal(backups.data.count >= 1, true);
    const backupId = backups.data.backups[0].backupId;

    const rollback = rollbackBackup({
      latestBackupPath: paths.latestBackupPath,
      backupsDir: paths.backupsDir,
      backupId,
    });
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
    assert.equal(doctor.data.storage.managementSSOT, "providers.json");
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

    const badImport = path.join(tempRoot, "bad-import.json");
    fs.writeFileSync(badImport, "{not-json", "utf8");
    assert.throws(
      () =>
        importProviders({
          codexDir: paths.codexDir,
          backupsDir: paths.backupsDir,
          latestBackupPath: paths.latestBackupPath,
          providersPath: paths.providersPath,
          configPath: paths.configPath,
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

function testLiveStateDriftAndLockConflict() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-drift-lock"));

    fs.writeFileSync(
      paths.configPath,
      [
        'profile = "manual-only"',
        "",
        "[profiles.packycode]",
        'model = "gpt-5"',
        "",
        "[profiles.manual-only]",
        'model = "gpt-5-mini"',
      ].join("\n"),
      "utf8"
    );

    const status = getStatus(paths.codexDir, paths.configPath, paths.providersPath);
    assert.equal(status.data.currentProfileMapped, false);
    assert.equal(status.data.liveState.canBackfillActiveProvider, true);
    assert.equal(status.warnings.length > 0, true);

    const doctor = runDoctor({
      codexDir: paths.codexDir,
      configPath: paths.configPath,
      providersPath: paths.providersPath,
    });
    const issueCodes = doctor.data.issues.map((issue) => issue.code);
    assert.equal(issueCodes.includes("UNMANAGED_ACTIVE_PROFILE"), true);

    const lockPath = path.join(paths.codexDir, ".codex-switch.lock");
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: 999,
        operation: "switch",
        createdAt: "2026-05-11T00:00:00.000Z",
      }),
      "utf8"
    );

    assert.throws(
      () =>
        addProvider({
          codexDir: paths.codexDir,
          backupsDir: paths.backupsDir,
          latestBackupPath: paths.latestBackupPath,
          providersPath: paths.providersPath,
          configPath: paths.configPath,
          providerName: "blocked",
          profile: "packycode",
          apiKey: "sk-blocked",
          tags: [],
        }),
      (error) => error.code === "LOCK_CONFLICT"
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

module.exports = { run };
