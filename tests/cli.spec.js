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
  await testInteractiveRemoveSelectionAndConfirm();
  await testRemoveRequiresForceNonInteractive();
  await testRemoveCancellationPreventsWrite();
  await testInteractiveImportConfirmation();
  await testImportCancellationPreventsWrite();
  await testInteractiveExportOverwrite();
  await testExportCancellationPreservesFile();
  await testRollbackConfirmationAndPreview();
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
    confirmAction: async () => false,
    writeLine: () => {},
    ...overrides,
  };
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
}

function testHelpText() {
  const topLevelHelp = buildHelpText();
  assert.match(topLevelHelp, /Read Commands:/);
  assert.match(topLevelHelp, /Change Commands:/);
  assert.match(topLevelHelp, /Interactive rules:/);
  assert.match(topLevelHelp, /Dangerous commands:/);

  const addHelp = buildHelpText("add");
  assert.match(addHelp, /progressive TTY prompts/i);
  assert.match(addHelp, /Confirm API key/);

  const removeHelp = buildHelpText("remove");
  assert.match(removeHelp, /always asks for deletion confirmation/i);

  const rollbackHelp = buildHelpText("rollback");
  assert.match(rollbackHelp, /previews the latest backup path/i);
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
    assert.match(rendered.stderr[0], /INVALID_IMPORT_FILE/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function testInteractiveAddFlow() {
  const tempRoot = makeTempRoot();
  try {
    const paths = createFixturePaths(path.join(tempRoot, "case-cli-add-interactive"));
    const parsed = parseArgs(["add", "--profile", "freemodel", "--codex-dir", paths.codexDir]);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    const textAnswers = ["newprovider", "", "", "daily, free"];
    const secretAnswers = ["sk-added", "sk-added"];
    const result = await executeCommand(
      ctx,
      parsed,
      createMockRuntime({
        isInteractive: () => true,
        inputText: async () => textAnswers.shift() ?? "",
        inputSecret: async () => secretAnswers.shift() ?? "",
      })
    );

    assert.equal(result.data.provider, "newprovider");
    assert.equal(result.data.profile, "freemodel");

    const providers = JSON.parse(fs.readFileSync(paths.providersPath, "utf8"));
    assert.equal(providers.providers.newprovider.apiKey, "sk-added");
    assert.deepEqual(providers.providers.newprovider.tags, ["daily", "free"]);
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
