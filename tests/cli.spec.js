const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { parseArgs } = require("../dist/cli/args");
const { executeCommand } = require("../dist/cli");
const { renderSuccess, renderFailure } = require("../dist/cli/output");
const { normalizeError } = require("../dist/domain/errors");
const { makeTempRoot, createFixturePaths } = require("./helpers");

async function run() {
  testArgParsing();
  await testJsonSuccessEnvelope();
  await testJsonFailureEnvelope();
  await testConfigMissingFailureEnvelope();
}

function testArgParsing() {
  const parsed = parseArgs(["list", "--json", "--codex-dir", "./tmp"]);
  assert.equal(parsed.command, "list");
  assert.equal(parsed.globalOptions.json, true);
  assert.equal(parsed.positionals.length, 0);
  assert.equal(typeof parsed.globalOptions.codexDir, "string");
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

module.exports = { run };
