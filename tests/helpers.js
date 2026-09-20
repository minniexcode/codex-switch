"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const fixtureCodexDir = path.join(repoRoot, "dev-codex", "local-sandbox");

function makeToolHomeRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeToolHomeWithManagedState() {
  const toolHomeDir = makeToolHomeRoot("codex-switch-tool-home-");
  const packageJson = require("../package.json");
  fs.mkdirSync(toolHomeDir, { recursive: true });
  fs.writeFileSync(path.join(toolHomeDir, "providers.json"), `${JSON.stringify({ providers: {} }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(toolHomeDir, "codex-switch.json"), `${JSON.stringify({ version: packageJson.version }, null, 2)}\n`, "utf8");
  return toolHomeDir;
}

/**
 * Runs `callback` with `CODEXS_HOME` pointed at the given tool home, restoring it afterwards.
 */
async function withToolHome(toolHomeDir, run) {
  const previous = process.env.CODEXS_HOME;
  process.env.CODEXS_HOME = toolHomeDir;
  try {
    // `await` so the restore runs after the callback settles. Without it the `finally` fires as
    // soon as `run()` hands back its promise, and the async dispatch then resolves paths against
    // the real machine state instead of the temporary tool home.
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.CODEXS_HOME;
    } else {
      process.env.CODEXS_HOME = previous;
    }
  }
}

/**
 * Creates a temporary copy of the repository Codex sandbox fixture.
 */
function makeSandboxCopy() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-cli-e2e-"));
  fs.cpSync(fixtureCodexDir, tempRoot, { recursive: true });
  return tempRoot;
}

/**
 * Creates an empty Codex directory for init-oriented tests.
 */
function makeEmptyCodexDir() {
  const codexDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-empty-"));
  fs.mkdirSync(path.join(codexDir, "backups"), { recursive: true });
  return codexDir;
}

/**
 * Executes the built CLI entrypoint in-process and returns its rendered output.
 *
 * Calls `runCli` directly rather than mirroring the production dispatch ladder, so a change to
 * the entrypoint is reflected here instead of silently diverging (P1-3).
 */
async function runBuiltCli(input) {
  const { runCli } = require("../dist/cli.js");
  const args = Array.isArray(input) ? input : input.args;

  const codexDirIndex = args.indexOf("--codex-dir");
  const toolHomeDir = !Array.isArray(input) && input.toolHomeDir
    ? path.resolve(input.toolHomeDir)
    : codexDirIndex >= 0 && args[codexDirIndex + 1]
      ? path.resolve(args[codexDirIndex + 1])
      : makeToolHomeRoot("codex-switch-tool-home-");

  const stdout = [];
  const stderr = [];

  const status = await withToolHome(toolHomeDir, () =>
    runCli(args, {
      stdout: (line) => {
        stdout.push(line);
      },
      stderr: (line) => {
        stderr.push(line);
      },
    })
  );

  return {
    status,
    stdout: stdout.join("\n"),
    stderr: stderr.join("\n"),
  };
}

/**
 * Parses a JSON envelope from either stdout or stderr based on exit status.
 */
async function runJsonCli(input) {
  const result = await runBuiltCli(input);
  const raw = result.status === 0 ? result.stdout : result.stderr;
  return {
    ...result,
    payload: JSON.parse(raw),
  };
}

module.exports = {
  repoRoot,
  fixtureCodexDir,
  withToolHome,
  makeToolHomeWithManagedState,
  makeSandboxCopy,
  makeEmptyCodexDir,
  runBuiltCli,
  runJsonCli,
};
