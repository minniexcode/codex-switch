const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("../dist/cli/args");
const { executeCommand } = require("../dist/cli");
const {
  setCodexSpawnImplementation,
  resetCodexSpawnImplementation,
} = require("../dist/infra/codex-cli");
const {
  makeTempRoot,
  copyDevSandbox,
  readJsonFile,
  runCliJson,
} = require("./helpers");

async function run() {
  await testSwitchAndRollbackViaCli();
  await testProviderMutationsViaCli();
  await testCreateProfileAndBlockDestructiveRemove();
  await testImportExportAndBackupFailuresViaCli();
  await testMixedProviderLifecycleWorkflowViaCli();
  await testMixedImportRemoveRollbackWorkflowViaCli();
  await testSetupAgainstSandboxCopy();
}

function createMockRuntime(overrides = {}) {
  return {
    isInteractive: () => false,
    inputText: async (_message, options) => options?.defaultValue ?? "",
    inputSecret: async () => "",
    selectOne: async () => {
      throw new Error("selectOne not stubbed");
    },
    selectMany: async () => [],
    confirmAction: async () => false,
    writeLine: () => {},
    ...overrides,
  };
}

function setFakeCodexSpawn(options = {}) {
  const version = options.version ?? "0.0.5";
  const authToken = options.authToken ?? "fake-login";
  setCodexSpawnImplementation((_command, args, spawnOptions = {}) => {
    if (args.includes("--version") || args.some((value) => String(value).includes("codex --version"))) {
      return { status: 0, stderr: "", stdout: `codex ${version}`, error: undefined };
    }
    if (args.some((value) => String(value).includes("codex login --with-api-key"))) {
      fs.writeFileSync(path.join(spawnOptions.cwd, "auth.json"), `{\n  "token": "${authToken}"\n}\n`, "utf8");
      return { status: 0, stderr: "", stdout: "", error: undefined };
    }
    return { status: 1, stderr: "unsupported codex args", stdout: "", error: undefined };
  });
}

async function testSwitchAndRollbackViaCli() {
  const tempRoot = makeTempRoot();
  try {
    const paths = copyDevSandbox(tempRoot, "case-switch-rollback");
    setFakeCodexSpawn();

    const switched = await runCliJson(["switch", "freemodel", "--codex-dir", paths.codexDir]);
    assert.equal(switched.status, 0, switched.stderrText);
    assert.equal(switched.envelope.command, "switch");
    assert.equal(switched.envelope.data.provider, "freemodel");
    assert.equal(switched.envelope.data.profile, "freemodel");
    assert.equal(switched.envelope.data.loginPerformed, true);
    assert.match(fs.readFileSync(paths.configPath, "utf8"), /profile = "freemodel"/);
    assert.equal(readJsonFile(paths.authPath).token, "fake-login");

    const latestBackup = readJsonFile(paths.latestBackupPath);
    assert.equal(latestBackup.reason, "switch");
    assert.deepEqual(
      latestBackup.files.map((file) => file.relativePath),
      ["config.toml", "auth.json"]
    );

    const rolledBack = await runCliJson(["rollback", "--codex-dir", paths.codexDir]);
    assert.equal(rolledBack.status, 0, rolledBack.stderrText);
    assert.equal(rolledBack.envelope.command, "rollback");
    assert.deepEqual(rolledBack.envelope.data.restoredFiles, ["config.toml", "auth.json"]);
    assert.match(fs.readFileSync(paths.configPath, "utf8"), /profile = "packycode"/);
    assert.equal(readJsonFile(paths.authPath).token, "cached");
  } finally {
    resetCodexSpawnImplementation();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testProviderMutationsViaCli() {
  const tempRoot = makeTempRoot();
  try {
    const paths = copyDevSandbox(tempRoot, "case-provider-mutations");

    const added = await runCliJson(
      [
        "add",
        "temp-provider",
        "--profile",
        "freemodel",
        "--api-key",
        "sk-added",
        "--note",
        "added",
        "--tag",
        "alpha",
        "--tag",
        "beta",
        "--codex-dir",
        paths.codexDir,
      ]
    );
    assert.equal(added.status, 0, added.stderrText);
    assert.equal(added.envelope.command, "add");
    assert.equal(added.envelope.data.provider, "temp-provider");
    assert.equal(readJsonFile(paths.providersPath).providers["temp-provider"].note, "added");
    assert.deepEqual(readJsonFile(paths.providersPath).providers["temp-provider"].tags, ["alpha", "beta"]);

    const edited = await runCliJson(
      [
        "edit",
        "temp-provider",
        "--note",
        "updated",
        "--tag",
        "gamma",
        "--codex-dir",
        paths.codexDir,
      ]
    );
    assert.equal(edited.status, 0, edited.stderrText);
    assert.deepEqual(edited.envelope.data.updatedFields, ["note", "tags"]);
    assert.equal(readJsonFile(paths.providersPath).providers["temp-provider"].note, "updated");
    assert.deepEqual(readJsonFile(paths.providersPath).providers["temp-provider"].tags, ["gamma"]);

    const removed = await runCliJson(["remove", "temp-provider", "--force", "--codex-dir", paths.codexDir]);
    assert.equal(removed.status, 0, removed.stderrText);
    assert.equal(removed.envelope.command, "remove");
    assert.equal(removed.envelope.data.provider, "temp-provider");
    assert.equal(readJsonFile(paths.providersPath).providers["temp-provider"], undefined);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testCreateProfileAndBlockDestructiveRemove() {
  const tempRoot = makeTempRoot();
  try {
    const paths = copyDevSandbox(tempRoot, "case-create-profile-remove-block");
    fs.appendFileSync(
      paths.configPath,
      ['[model_providers.fresh-profile]', 'base_url = "https://fresh.example.com/v1"', ""].join("\n"),
      "utf8"
    );

    const added = await runCliJson(
      [
        "add",
        "fresh-provider",
        "--profile",
        "fresh-profile",
        "--api-key",
        "sk-fresh",
        "--create-profile",
        "--model",
        "gpt-4.1",
        "--base-url",
        "https://fresh.example.com/v1",
        "--codex-dir",
        paths.codexDir,
      ]
    );
    assert.equal(added.status, 0, added.stderrText);
    assert.deepEqual(added.envelope.data.createdProfileSections, ["fresh-profile"]);
    const configContent = fs.readFileSync(paths.configPath, "utf8");
    assert.match(configContent, /\[profiles\.fresh-profile\]/);
    assert.match(configContent, /model_provider = "fresh-profile"/);

    const blocked = await runCliJson(["remove", "packycode", "--force", "--codex-dir", paths.codexDir]);
    assert.equal(blocked.status, 1);
    assert.equal(blocked.envelope.error.code, "PROFILE_IN_USE");
    assert.equal(readJsonFile(paths.providersPath).providers.packycode.profile, "packycode");
    assert.match(fs.readFileSync(paths.configPath, "utf8"), /profile = "packycode"/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testImportExportAndBackupFailuresViaCli() {
  const tempRoot = makeTempRoot();
  try {
    const paths = copyDevSandbox(tempRoot, "case-import-export-backups");
    const importFile = path.join(tempRoot, "providers-import.json");
    const exportFile = path.join(tempRoot, "providers-export.json");
    fs.writeFileSync(
      importFile,
      JSON.stringify(
        {
          providers: {
            freemodel: {
              profile: "freemodel",
              apiKey: "sk-freemodel-updated",
            },
            imported: {
              profile: "packycode",
              apiKey: "sk-imported",
              tags: ["shared"],
            },
          },
        },
        null,
        2
      ),
      "utf8"
    );

    const imported = await runCliJson(["import", importFile, "--merge", "--codex-dir", paths.codexDir]);
    assert.equal(imported.status, 0, imported.stderrText);
    assert.equal(imported.envelope.data.mode, "merge");
    assert.deepEqual(imported.envelope.data.replacedProviders, ["freemodel"]);
    const providersAfterImport = readJsonFile(paths.providersPath).providers;
    assert.equal(providersAfterImport.freemodel.apiKey, "sk-freemodel-updated");
    assert.equal(providersAfterImport.imported.profile, "packycode");

    const exported = await runCliJson(["export", exportFile, "--codex-dir", paths.codexDir]);
    assert.equal(exported.status, 0, exported.stderrText);
    assert.equal(exported.envelope.data.exportedTo, path.resolve(exportFile));
    assert.equal(readJsonFile(exportFile).providers.imported.apiKey, "sk-imported");

    const corruptBackupDir = path.join(paths.backupsDir, "corrupt-backup");
    fs.mkdirSync(corruptBackupDir, { recursive: true });
    const backups = await runCliJson(["backups", "list", "--codex-dir", paths.codexDir]);
    assert.equal(backups.status, 0, backups.stderrText);
    assert.equal(backups.envelope.warnings.some((warning) => warning.includes("corrupt-backup")), true);

    const missingRollback = await runCliJson(["rollback", "missing-backup", "--codex-dir", paths.codexDir]);
    assert.equal(missingRollback.status, 1);
    assert.equal(missingRollback.envelope.error.code, "BACKUP_NOT_FOUND");

    fs.writeFileSync(paths.latestBackupPath, "{not-json", "utf8");
    const invalidLatestRollback = await runCliJson(["rollback", "--codex-dir", paths.codexDir]);
    assert.equal(invalidLatestRollback.status, 1);
    assert.equal(invalidLatestRollback.envelope.error.code, "ROLLBACK_FAILED");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testMixedProviderLifecycleWorkflowViaCli() {
  const tempRoot = makeTempRoot();
  try {
    const paths = copyDevSandbox(tempRoot, "case-mixed-provider-workflow");
    setFakeCodexSpawn({ authToken: "workflow-login" });
    const exportFile = path.join(tempRoot, "workflow-export.json");
    fs.appendFileSync(
      paths.configPath,
      ['[model_providers.relay-pro]', 'base_url = "https://relay.example.com/v1"', ""].join("\n"),
      "utf8"
    );

    const initialList = await runCliJson(["list", "--codex-dir", paths.codexDir]);
    assert.equal(initialList.status, 0, initialList.stderrText);
    assert.equal(initialList.envelope.data.count, 2);

    const added = await runCliJson(
      [
        "add",
        "relay-pro",
        "--profile",
        "relay-pro",
        "--api-key",
        "sk-relay-pro",
        "--create-profile",
        "--model",
        "gpt-4.1",
        "--base-url",
        "https://relay.example.com/v1",
        "--note",
        "first pass",
        "--tag",
        "paid",
        "--tag",
        "team",
        "--codex-dir",
        paths.codexDir,
      ]
    );
    assert.equal(added.status, 0, added.stderrText);
    assert.deepEqual(added.envelope.data.createdProfileSections, ["relay-pro"]);

    const switched = await runCliJson(["switch", "relay-pro", "--codex-dir", paths.codexDir]);
    assert.equal(switched.status, 0, switched.stderrText);
    assert.equal(switched.envelope.data.provider, "relay-pro");
    assert.equal(readJsonFile(paths.authPath).token, "workflow-login");

    const edited = await runCliJson(
      [
        "edit",
        "relay-pro",
        "--note",
        "second pass",
        "--tag",
        "paid",
        "--tag",
        "ops",
        "--base-url",
        "https://relay-next.example.com/v1",
        "--model",
        "gpt-4.1-mini",
        "--codex-dir",
        paths.codexDir,
      ]
    );
    assert.equal(edited.status, 0, edited.stderrText);
    assert.deepEqual(edited.envelope.data.updatedFields, ["baseUrl", "note", "tags", "model"]);

    const shown = await runCliJson(["show", "relay-pro", "--codex-dir", paths.codexDir]);
    assert.equal(shown.status, 0, shown.stderrText);
    assert.equal(shown.envelope.data.provider.note, "second pass");
    assert.deepEqual(shown.envelope.data.provider.tags, ["paid", "ops"]);

    const configShown = await runCliJson(["config", "show", "relay-pro", "--codex-dir", paths.codexDir]);
    assert.equal(configShown.status, 0, configShown.stderrText);
    assert.equal(configShown.envelope.data.selectedProfile, "relay-pro");
    assert.equal(configShown.envelope.data.profiles[0].model, "gpt-4.1-mini");
    assert.equal(configShown.envelope.data.profiles[0].modelProvider, "relay-pro");
    assert.equal(configShown.envelope.data.profiles[0].baseUrl, "https://relay.example.com/v1");
    assert.equal(configShown.envelope.data.profiles[0].isActive, true);

    const exported = await runCliJson(["export", exportFile, "--codex-dir", paths.codexDir]);
    assert.equal(exported.status, 0, exported.stderrText);
    assert.equal(readJsonFile(exportFile).providers["relay-pro"].note, "second pass");

    const backups = await runCliJson(["backups", "list", "--codex-dir", paths.codexDir]);
    assert.equal(backups.status, 0, backups.stderrText);
    assert.equal(backups.envelope.data.count >= 3, true);

    const rolledBack = await runCliJson(["rollback", "--codex-dir", paths.codexDir]);
    assert.equal(rolledBack.status, 0, rolledBack.stderrText);
    assert.deepEqual(rolledBack.envelope.data.restoredFiles, ["providers.json", "config.toml"]);

    const providerAfterRollback = readJsonFile(paths.providersPath).providers["relay-pro"];
    assert.equal(providerAfterRollback.note, "first pass");
    assert.deepEqual(providerAfterRollback.tags, ["paid", "team"]);
    const configAfterRollback = await runCliJson(["config", "show", "relay-pro", "--codex-dir", paths.codexDir]);
    assert.equal(configAfterRollback.envelope.data.profiles[0].model, "gpt-4.1");
    assert.equal(configAfterRollback.envelope.data.profiles[0].baseUrl, "https://relay.example.com/v1");
    assert.equal((await runCliJson(["current", "--codex-dir", paths.codexDir])).envelope.data.profile, "relay-pro");
  } finally {
    resetCodexSpawnImplementation();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testMixedImportRemoveRollbackWorkflowViaCli() {
  const tempRoot = makeTempRoot();
  try {
    const paths = copyDevSandbox(tempRoot, "case-mixed-import-remove-rollback");
    setFakeCodexSpawn({ authToken: "workflow-shared" });
    const importFile = path.join(tempRoot, "workflow-import.json");
    fs.writeFileSync(
      importFile,
      JSON.stringify(
        {
          providers: {
            freemodel: {
              profile: "freemodel",
              apiKey: "sk-freemodel-merged",
              tags: ["free", "merged"],
            },
            imported: {
              profile: "packycode",
              apiKey: "sk-imported-workflow",
              note: "imported alias",
            },
          },
        },
        null,
        2
      ),
      "utf8"
    );

    const imported = await runCliJson(["import", importFile, "--merge", "--codex-dir", paths.codexDir]);
    assert.equal(imported.status, 0, imported.stderrText);
    assert.equal(imported.envelope.data.mode, "merge");
    assert.deepEqual(imported.envelope.data.replacedProviders, ["freemodel"]);

    const switched = await runCliJson(["switch", "freemodel", "--no-login", "--codex-dir", paths.codexDir]);
    assert.equal(switched.status, 0, switched.stderrText);
    assert.equal(switched.envelope.data.provider, "freemodel");
    assert.equal(switched.envelope.data.loginPerformed, false);

    const removed = await runCliJson(["remove", "packycode", "--force", "--codex-dir", paths.codexDir]);
    assert.equal(removed.status, 0, removed.stderrText);
    assert.equal(removed.envelope.data.provider, "packycode");
    assert.deepEqual(removed.envelope.data.deletedProfileSections, []);
    assert.deepEqual(removed.envelope.data.keptSharedProfiles, ["packycode"]);

    const listAfterRemove = await runCliJson(["list", "--codex-dir", paths.codexDir]);
    assert.equal(listAfterRemove.status, 0, listAfterRemove.stderrText);
    assert.equal(listAfterRemove.envelope.data.count, 2);
    assert.deepEqual(
      listAfterRemove.envelope.data.providers.map((provider) => provider.name).sort(),
      ["freemodel", "imported"]
    );

    const sharedProfile = await runCliJson(["config", "show", "packycode", "--codex-dir", paths.codexDir]);
    assert.equal(sharedProfile.status, 0, sharedProfile.stderrText);
    assert.equal(sharedProfile.envelope.data.selectedProfile, "packycode");
    assert.deepEqual(sharedProfile.envelope.data.profiles[0].linkedProviders, ["imported"]);
    assert.equal(sharedProfile.envelope.data.profiles[0].source, "managed");

    const doctor = await runCliJson(["doctor", "--codex-dir", paths.codexDir]);
    assert.equal(doctor.status, 0, doctor.stderrText);
    assert.equal(doctor.envelope.data.healthy, true);
    assert.deepEqual(doctor.envelope.data.issues, []);

    const backups = await runCliJson(["backups", "list", "--codex-dir", paths.codexDir]);
    assert.equal(backups.status, 0, backups.stderrText);
    const removeBackup = backups.envelope.data.backups.find((backup) => backup.reason === "remove");
    assert.ok(removeBackup, "expected remove backup to exist");

    const restored = await runCliJson(["rollback", removeBackup.backupId, "--codex-dir", paths.codexDir]);
    assert.equal(restored.status, 0, restored.stderrText);
    assert.deepEqual(restored.envelope.data.restoredFiles, ["providers.json", "config.toml"]);

    const providersAfterRollback = readJsonFile(paths.providersPath).providers;
    assert.ok(providersAfterRollback.packycode);
    assert.ok(providersAfterRollback.imported);
    const restoredConfig = await runCliJson(["config", "show", "packycode", "--codex-dir", paths.codexDir]);
    assert.equal(restoredConfig.status, 0, restoredConfig.stderrText);
    assert.equal(restoredConfig.envelope.data.profiles[0].source, "managed");
    assert.equal((await runCliJson(["current", "--codex-dir", paths.codexDir])).envelope.data.profile, "freemodel");
  } finally {
    resetCodexSpawnImplementation();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testSetupAgainstSandboxCopy() {
  const tempRoot = makeTempRoot();
  try {
    const paths = copyDevSandbox(tempRoot, "case-setup-sandbox-copy");
    fs.rmSync(paths.providersPath, { force: true });
    fs.writeFileSync(
      paths.configPath,
      [
        'profile = "packycode"',
        "",
        "[profiles.packycode]",
        'model = "gpt-5"',
        'model_provider = "packycode"',
        "",
        "[profiles.freemodel]",
        'model = "gpt-5-mini"',
        'model_provider = "freemodel"',
        "",
        "[profiles.adoptme]",
        'model = "gpt-4.1"',
        'model_provider = "adoptme"',
        "",
        "[model_providers.packycode]",
        'base_url = "https://relay.example.com/v1"',
        "",
        "[model_providers.freemodel]",
        'base_url = "https://free.example.com/v1"',
        "",
        "[model_providers.adoptme]",
        'base_url = "https://adopt.example.com/v1"',
        "",
      ].join("\n"),
      "utf8"
    );

    setCodexSpawnImplementation((_command, args) => {
      if (args.includes("--version") || args.some((value) => String(value).includes("codex --version"))) {
        return { status: 0, stderr: "", stdout: "codex 0.0.5", error: undefined };
      }
      return { status: 0, stderr: "", stdout: "", error: undefined };
    });

    const parsed = parseArgs(["setup", "--overwrite", "--codex-dir", paths.codexDir]);
    const prompts = [];
    const result = await executeCommand(
      { command: parsed.command, options: parsed.globalOptions },
      parsed,
      createMockRuntime({
        isInteractive: () => true,
        selectMany: async (message) => {
          prompts.push(message);
          return ["adoptme"];
        },
        inputText: async (message, options) => {
          prompts.push(message);
          return options?.defaultValue ?? "";
        },
        inputSecret: async () => "sk-adoptme",
      })
    );

    assert.deepEqual(result.data.adoptedProfiles, ["adoptme"]);
    assert.equal(result.data.providersInitialized, 1);
    assert.equal(result.data.providerNames.includes("adoptme"), true);
    assert.equal(result.data.doctor.healthy, false);
    assert.equal(prompts[0], "Choose unmanaged config profiles to adopt into providers.json.");
    assert.equal(readJsonFile(paths.providersPath).providers.adoptme.apiKey, "sk-adoptme");
  } finally {
    resetCodexSpawnImplementation();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

module.exports = { run };
