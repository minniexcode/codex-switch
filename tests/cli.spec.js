const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { parseArgs } = require("../dist/cli/args");
const { buildHelpText } = require("../dist/cli/help");
const { executeCommand } = require("../dist/cli");
const { renderSuccess, renderFailure } = require("../dist/cli/output");
const { normalizeError } = require("../dist/domain/errors");
const { makeTempRoot, createFixturePaths } = require("./helpers");

async function run() {
  testArgParsing();
  testHelpText();
  await testJsonSuccessEnvelope();
  await testJsonFailureEnvelope();
  await testConfigMissingFailureEnvelope();
  await testInteractiveAddFallback();
  await testInteractiveAddFlow();
  await testInteractiveSwitchSelection();
  await testSwitchWithoutProviderStillFailsNonInteractive();
  await testShowAndEditCommands();
  await testInteractiveRemoveSelectionAndConfirm();
  await testRemoveRequiresForceNonInteractive();
  await testRemoveCancellationPreventsWrite();
  await testInteractiveImportConfirmation();
  await testImportMerge();
  await testImportCancellationPreventsWrite();
  await testInteractiveExportOverwrite();
  await testExportCancellationPreservesFile();
  await testRollbackConfirmationAndPreview();
  await testBackupsListAndRollbackById();
  await testRollbackCancellationPreventsWrite();
}

function createMockRuntime(overrides = {}) {
  return {
    isInteractive: () => false,
    inputText: async () => "",
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

function withEnv(overrides, run) {
  const original = {};
  for (const [key, value] of Object.entries(overrides)) {
    original[key] = Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined;
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function testArgParsing() {
  const parsed = parseArgs(["list", "--json", "--codex-dir", "./tmp"]);
  assert.equal(parsed.command, "list");
  assert.equal(parsed.globalOptions.json, true);
  assert.equal(parsed.positionals.length, 0);
  assert.equal(typeof parsed.globalOptions.codexDir, "string");
  assert.equal(parsed.helpRequested, false);
  assert.equal(parsed.versionRequested, false);

  const commandHelp = parseArgs(["add", "--help"]);
  assert.equal(commandHelp.command, "add");
  assert.equal(commandHelp.helpRequested, true);
  assert.equal(commandHelp.helpTarget, "add");

  const helpCommand = parseArgs(["help", "switch"]);
  assert.equal(helpCommand.command, null);
  assert.equal(helpCommand.helpRequested, true);
  assert.equal(helpCommand.helpTarget, "switch");

  const backupsList = parseArgs(["backups", "list", "--json"]);
  assert.equal(backupsList.command, "backups-list");

  withEnv({ CODEXS_CODEX_DIR: path.join("env", "codex"), NODE_ENV: undefined }, () => {
    const envParsed = parseArgs(["list"]);
    assert.equal(envParsed.globalOptions.codexDir, path.resolve(path.join("env", "codex")));
  });

  withEnv({ NODE_ENV: "development", CODEXS_CODEX_DIR: undefined }, () => {
    const devParsed = parseArgs(["list"]);
    assert.equal(devParsed.globalOptions.codexDir, path.resolve(process.cwd(), "test-fixtures", "sample-codex"));
  });

  withEnv({ NODE_ENV: "development", CODEXS_CODEX_DIR: path.join("env", "codex") }, () => {
    const explicitParsed = parseArgs(["list", "--codex-dir", "./tmp-explicit"]);
    assert.equal(explicitParsed.globalOptions.codexDir, path.resolve("./tmp-explicit"));
  });
}

function testHelpText() {
  const topLevelHelp = buildHelpText();
  assert.match(topLevelHelp, /Read Commands:/);
  assert.match(topLevelHelp, /Change Commands:/);
  assert.match(topLevelHelp, /CODEXS_CODEX_DIR/);
  assert.match(topLevelHelp, /test-fixtures\/sample-codex/);
  assert.match(topLevelHelp, /Interactive rules:/);
  assert.match(topLevelHelp, /Dangerous commands:/);

  const addHelp = buildHelpText("add");
  assert.match(addHelp, /progressive TTY prompts/i);
  assert.match(addHelp, /Confirm API key/);
  assert.match(addHelp, /preset multi-select plus optional custom/i);
  assert.match(addHelp, /plain text inputs/i);

  const removeHelp = buildHelpText("remove");
  assert.match(removeHelp, /always asks for deletion confirmation/i);

  const showHelp = buildHelpText("show");
  assert.match(showHelp, /select a missing provider interactively/i);

  const rollbackHelp = buildHelpText("rollback");
  assert.match(rollbackHelp, /previews the target backup path/i);

  const backupsHelp = buildHelpText("backups");
  assert.match(backupsHelp, /historical backup entries/i);
}

async function testJsonSuccessEnvelope() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-success"));
    const parsed = parseArgs(["list", "--json", "--codex-dir", paths.codexDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    const result = await executeCommand(ctx, parsed);
    const rendered = renderSuccess(ctx, result);
    assert.equal(rendered.exitCode, 0);
    assert.equal(rendered.stderr.length, 0);

    const payload = JSON.parse(rendered.stdout[0]);
    assert.equal(payload.ok, true);
    assert.equal(payload.command, "list");
    assert.equal(payload.data.count, 2);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testJsonFailureEnvelope() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-failure"));
    const brokenPath = path.join(paths.codexDir, "providers.json");
    fs.writeFileSync(brokenPath, "{not-json", "utf8");

    const parsed = parseArgs(["list", "--json", "--codex-dir", paths.codexDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    let rendered;
    try {
      await executeCommand(ctx, parsed);
      throw new Error("Expected command to fail");
    } catch (error) {
      rendered = renderFailure(ctx, normalizeError(error));
    }

    assert.equal(rendered.exitCode, 1);
    assert.equal(rendered.stdout.length, 0);

    const payload = JSON.parse(rendered.stderr[0]);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, "list");
    assert.equal(payload.error.code, "PROVIDERS_PARSE_ERROR");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testConfigMissingFailureEnvelope() {
  const tempRoot = makeTempRoot();
  try {
    const missingDir = path.join(tempRoot, "case-cli-config-missing");
    fs.mkdirSync(missingDir, { recursive: true });

    const parsed = parseArgs(["current", "--json", "--codex-dir", missingDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    let rendered;
    try {
      await executeCommand(ctx, parsed);
      throw new Error("Expected command to fail");
    } catch (error) {
      rendered = renderFailure(ctx, normalizeError(error));
    }

    const payload = JSON.parse(rendered.stderr[0]);
    assert.equal(payload.error.code, "CONFIG_NOT_FOUND");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testInteractiveAddFallback() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-add-fallback"));
    const parsed = parseArgs(["add", "--codex-dir", paths.codexDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    let rendered;
    try {
      await executeCommand(ctx, parsed, createMockRuntime());
      throw new Error("Expected command to fail");
    } catch (error) {
      rendered = renderFailure(ctx, normalizeError(error));
    }

    assert.equal(rendered.exitCode, 1);
    assert.match(rendered.stderr[0], /INVALID_ARGUMENT/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testInteractiveAddFlow() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-add-interactive"));
    const parsed = parseArgs(["add", "--codex-dir", paths.codexDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    const textAnswers = ["newprovider", "freemodel", "", "", "custom, free"];
    const secretAnswers = ["sk-added", "sk-added"];
    const result = await executeCommand(
      ctx,
      parsed,
      createMockRuntime({
        isInteractive: () => true,
        inputText: async () => textAnswers.shift() ?? "",
        inputSecret: async () => secretAnswers.shift() ?? "",
        selectMany: async () => ["daily", "backup"],
      })
    );

    assert.equal(result.data.provider, "newprovider");
    assert.equal(result.data.profile, "freemodel");

    const providers = JSON.parse(fs.readFileSync(paths.providersPath, "utf8"));
    assert.equal(providers.providers.newprovider.apiKey, "sk-added");
    assert.deepEqual(providers.providers.newprovider.tags, ["daily", "backup", "custom", "free"]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testInteractiveSwitchSelection() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-switch-select"));
    const parsed = parseArgs(["switch", "--no-login", "--codex-dir", paths.codexDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    const result = await executeCommand(
      ctx,
      parsed,
      createMockRuntime({
        isInteractive: () => true,
        selectOne: async () => "freemodel",
      })
    );

    assert.equal(result.data.provider, "freemodel");
    const config = fs.readFileSync(paths.configPath, "utf8");
    assert.match(config, /profile = "freemodel"/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testSwitchWithoutProviderStillFailsNonInteractive() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-switch-fallback"));
    const parsed = parseArgs(["switch", "--codex-dir", paths.codexDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    await assert.rejects(
      () => executeCommand(ctx, parsed, createMockRuntime()),
      /Missing provider name/
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testShowAndEditCommands() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-show-edit"));

    const showParsed = parseArgs(["show", "packycode", "--codex-dir", paths.codexDir]);
    const showResult = await executeCommand(
      { command: showParsed.command, options: showParsed.globalOptions },
      showParsed,
      createMockRuntime()
    );
    assert.equal(showResult.data.provider.apiKey, "sk-***de");

    const interactiveShowParsed = parseArgs(["show", "--codex-dir", paths.codexDir]);
    const interactiveShowResult = await executeCommand(
      { command: interactiveShowParsed.command, options: interactiveShowParsed.globalOptions },
      interactiveShowParsed,
      createMockRuntime({
        isInteractive: () => true,
        selectOne: async () => "freemodel",
      })
    );
    assert.equal(interactiveShowResult.data.provider.profile, "freemodel");

    const editParsed = parseArgs(["edit", "packycode", "--note", "updated", "--tag", "daily", "--tag", "paid", "--codex-dir", paths.codexDir]);
    const editResult = await executeCommand(
      { command: editParsed.command, options: editParsed.globalOptions },
      editParsed,
      createMockRuntime()
    );
    assert.deepEqual(editResult.data.updatedFields, ["note", "tags"]);
    const providers = JSON.parse(fs.readFileSync(paths.providersPath, "utf8"));
    assert.deepEqual(providers.providers.packycode.tags, ["daily", "paid"]);

    const interactiveEditParsed = parseArgs(["edit", "packycode", "--codex-dir", paths.codexDir]);
    await executeCommand(
      { command: interactiveEditParsed.command, options: interactiveEditParsed.globalOptions },
      interactiveEditParsed,
      createMockRuntime({
        isInteractive: () => true,
        inputText: async (message) => {
          if (message === "Profile") {
            return "packycode";
          }
          if (message === "Base URL (optional)") {
            return "";
          }
          if (message === "Note (optional)") {
            return "interactive";
          }
          if (message === "Custom tags (optional, comma-separated)") {
            return "custom, free";
          }
          return "";
        },
        inputSecret: async () => "",
        selectMany: async () => ["daily", "backup"],
      })
    );

    const providersAfterInteractiveEdit = JSON.parse(fs.readFileSync(paths.providersPath, "utf8"));
    assert.deepEqual(providersAfterInteractiveEdit.providers.packycode.tags, ["daily", "backup", "custom", "free"]);

    const interactiveEditSelectParsed = parseArgs(["edit", "--codex-dir", paths.codexDir]);
    await executeCommand(
      { command: interactiveEditSelectParsed.command, options: interactiveEditSelectParsed.globalOptions },
      interactiveEditSelectParsed,
      createMockRuntime({
        isInteractive: () => true,
        selectOne: async () => "freemodel",
        inputText: async (message) => {
          if (message === "Profile") {
            return "freemodel";
          }
          if (message === "Base URL (optional)") {
            return "";
          }
          if (message === "Note (optional)") {
            return "selected interactively";
          }
          if (message === "Custom tags (optional, comma-separated)") {
            return "free";
          }
          return "";
        },
        inputSecret: async () => "",
        selectMany: async () => ["backup"],
      })
    );

    const providersAfterSelectionEdit = JSON.parse(fs.readFileSync(paths.providersPath, "utf8"));
    assert.equal(providersAfterSelectionEdit.providers.freemodel.note, "selected interactively");
    assert.deepEqual(providersAfterSelectionEdit.providers.freemodel.tags, ["backup", "free"]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testInteractiveRemoveSelectionAndConfirm() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-remove-select"));
    const parsed = parseArgs(["remove", "--codex-dir", paths.codexDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    const result = await executeCommand(
      ctx,
      parsed,
      createMockRuntime({
        isInteractive: () => true,
        selectOne: async () => "freemodel",
        confirmAction: async () => true,
      })
    );

    assert.equal(result.data.provider, "freemodel");
    const providers = JSON.parse(fs.readFileSync(paths.providersPath, "utf8"));
    assert.equal(providers.providers.freemodel, undefined);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testRemoveRequiresForceNonInteractive() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-remove-force"));
    const parsed = parseArgs(["remove", "freemodel", "--codex-dir", paths.codexDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    await assert.rejects(
      () => executeCommand(ctx, parsed, createMockRuntime()),
      /remove requires --force/
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testRemoveCancellationPreventsWrite() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-remove-cancel"));
    const original = fs.readFileSync(paths.providersPath, "utf8");
    const parsed = parseArgs(["remove", "freemodel", "--codex-dir", paths.codexDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    await assert.rejects(
      () =>
        executeCommand(
          ctx,
          parsed,
          createMockRuntime({
            isInteractive: () => true,
            confirmAction: async () => false,
          })
        ),
      /Removal cancelled/
    );

    assert.equal(fs.readFileSync(paths.providersPath, "utf8"), original);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testInteractiveImportConfirmation() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-import-confirm"));
    const importFile = path.join(tempRoot, "providers-import.json");
    fs.writeFileSync(
      importFile,
      JSON.stringify(
        {
          providers: {
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

    const parsed = parseArgs(["import", importFile, "--codex-dir", paths.codexDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    const result = await executeCommand(
      ctx,
      parsed,
      createMockRuntime({
        isInteractive: () => true,
        confirmAction: async () => true,
      })
    );

    assert.deepEqual(result.data.importedProviders, ["imported"]);
    const providers = JSON.parse(fs.readFileSync(paths.providersPath, "utf8"));
    assert.equal(Object.keys(providers.providers).length, 1);
    assert.equal(providers.providers.imported.profile, "packycode");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testImportMerge() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-import-merge"));
    const importFile = path.join(tempRoot, "providers-import-merge.json");
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
            },
          },
        },
        null,
        2
      ),
      "utf8"
    );

    const parsed = parseArgs(["import", importFile, "--merge", "--codex-dir", paths.codexDir]);
    const result = await executeCommand(
      { command: parsed.command, options: parsed.globalOptions },
      parsed,
      createMockRuntime()
    );

    assert.equal(result.data.mode, "merge");
    assert.deepEqual(result.data.replacedProviders, ["freemodel"]);
    const providers = JSON.parse(fs.readFileSync(paths.providersPath, "utf8")).providers;
    assert.equal(providers.imported.apiKey, "sk-imported");
    assert.equal(providers.freemodel.apiKey, "sk-freemodel-updated");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testImportCancellationPreventsWrite() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-import-cancel"));
    const importFile = path.join(tempRoot, "providers-import-cancel.json");
    fs.writeFileSync(
      importFile,
      JSON.stringify({ providers: {} }, null, 2),
      "utf8"
    );
    const original = fs.readFileSync(paths.providersPath, "utf8");

    const parsed = parseArgs(["import", importFile, "--codex-dir", paths.codexDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    await assert.rejects(
      () =>
        executeCommand(
          ctx,
          parsed,
          createMockRuntime({
            isInteractive: () => true,
            confirmAction: async () => false,
          })
        ),
      /Import cancelled/
    );

    assert.equal(fs.readFileSync(paths.providersPath, "utf8"), original);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testInteractiveExportOverwrite() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-export-confirm"));
    const exportFile = path.join(tempRoot, "providers-export.json");
    fs.writeFileSync(exportFile, "old", "utf8");

    const parsed = parseArgs(["export", exportFile, "--codex-dir", paths.codexDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    const result = await executeCommand(
      ctx,
      parsed,
      createMockRuntime({
        isInteractive: () => true,
        confirmAction: async () => true,
      })
    );

    assert.equal(result.data.exportedTo, path.resolve(exportFile));
    const exported = JSON.parse(fs.readFileSync(exportFile, "utf8"));
    assert.equal(exported.providers.packycode.profile, "packycode");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testExportCancellationPreservesFile() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-export-cancel"));
    const exportFile = path.join(tempRoot, "providers-export-cancel.json");
    fs.writeFileSync(exportFile, "old", "utf8");

    const parsed = parseArgs(["export", exportFile, "--codex-dir", paths.codexDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    await assert.rejects(
      () =>
        executeCommand(
          ctx,
          parsed,
          createMockRuntime({
            isInteractive: () => true,
            confirmAction: async () => false,
          })
        ),
      /Export cancelled/
    );

    assert.equal(fs.readFileSync(exportFile, "utf8"), "old");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testRollbackConfirmationAndPreview() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-rollback-confirm"));
    const switchParsed = parseArgs(["switch", "freemodel", "--no-login", "--codex-dir", paths.codexDir]);
    await executeCommand(
      { command: switchParsed.command, options: switchParsed.globalOptions },
      switchParsed,
      createMockRuntime()
    );

    fs.writeFileSync(paths.configPath, 'profile = "broken"\n', "utf8");
    const lines = [];
    const parsed = parseArgs(["rollback", "--codex-dir", paths.codexDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    const result = await executeCommand(
      ctx,
      parsed,
      createMockRuntime({
        isInteractive: () => true,
        confirmAction: async () => true,
        writeLine: (line) => lines.push(line),
      })
    );

    assert.ok(lines.some((line) => line.includes("Rollback preview")));
    assert.ok(lines.some((line) => line.includes("config.toml")));
    assert.ok(lines.some((line) => line.includes("auth.json")));
    assert.match(fs.readFileSync(paths.configPath, "utf8"), /profile = "packycode"/);
    assert.ok(Array.isArray(result.data.restoredFiles));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testBackupsListAndRollbackById() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-backups-rollback-id"));
    const switchParsed = parseArgs(["switch", "freemodel", "--no-login", "--codex-dir", paths.codexDir]);
    await executeCommand(
      { command: switchParsed.command, options: switchParsed.globalOptions },
      switchParsed,
      createMockRuntime()
    );

    fs.writeFileSync(paths.configPath, 'profile = "broken"\n', "utf8");
    const listParsed = parseArgs(["backups", "list", "--codex-dir", paths.codexDir]);
    const listResult = await executeCommand(
      { command: listParsed.command, options: listParsed.globalOptions },
      listParsed,
      createMockRuntime()
    );
    assert.equal(listResult.data.count >= 1, true);

    const rollbackParsed = parseArgs(["rollback", listResult.data.backups[0].backupId, "--codex-dir", paths.codexDir]);
    const rollbackResult = await executeCommand(
      { command: rollbackParsed.command, options: rollbackParsed.globalOptions },
      rollbackParsed,
      createMockRuntime()
    );
    assert.equal(rollbackResult.data.backupId, listResult.data.backups[0].backupId);
    assert.match(fs.readFileSync(paths.configPath, "utf8"), /profile = "packycode"/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testRollbackCancellationPreventsWrite() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-rollback-cancel"));
    const switchParsed = parseArgs(["switch", "freemodel", "--no-login", "--codex-dir", paths.codexDir]);
    await executeCommand(
      { command: switchParsed.command, options: switchParsed.globalOptions },
      switchParsed,
      createMockRuntime()
    );

    fs.writeFileSync(paths.configPath, 'profile = "broken"\n', "utf8");
    const broken = fs.readFileSync(paths.configPath, "utf8");

    const parsed = parseArgs(["rollback", "--codex-dir", paths.codexDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    await assert.rejects(
      () =>
        executeCommand(
          ctx,
          parsed,
          createMockRuntime({
            isInteractive: () => true,
            confirmAction: async () => false,
          })
        ),
      /Rollback cancelled/
    );

    assert.equal(fs.readFileSync(paths.configPath, "utf8"), broken);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

module.exports = { run };
