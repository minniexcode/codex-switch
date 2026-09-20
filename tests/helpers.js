"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const fixtureCodexDir = path.join(repoRoot, "dev-codex", "local-sandbox");

/**
 * Every temporary directory this harness created and has not yet removed.
 */
const tempDirs = new Set();

/**
 * Creates a temporary directory and registers it for removal by `cleanupTempDirs()`.
 */
function makeTempDir(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.add(directory);
  return directory;
}

/**
 * Removes one temporary directory, best effort.
 */
function removeTempDir(directory) {
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    // Best effort: a directory another process still holds open (Windows EBUSY) is left
    // behind rather than turning a test that already passed into a failure.
  }
}

/**
 * Removes every directory `makeTempDir` created. Idempotent, so it is safe to call per suite,
 * repeatedly, and again from the process exit backstop.
 */
function cleanupTempDirs() {
  for (const directory of [...tempDirs]) {
    // Removed from the registry before the attempt, so a directory that cannot be deleted is
    // not retried on every later call.
    tempDirs.delete(directory);
    removeTempDir(directory);
  }
}

// `process.exit` runs exit listeners, so this also covers the failure path and any early exit.
process.on("exit", cleanupTempDirs);

function makeToolHomeWithManagedState() {
  const toolHomeDir = makeTempDir("codex-switch-tool-home-");
  const packageJson = require("../package.json");
  fs.writeFileSync(path.join(toolHomeDir, "providers.json"), `${JSON.stringify({ providers: {} }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(toolHomeDir, "codex-switch.json"), `${JSON.stringify({ version: packageJson.version }, null, 2)}\n`, "utf8");
  return toolHomeDir;
}

/**
 * Runs `callback` with the given environment variables applied, restoring them afterwards.
 */
async function withEnv(overrides, run) {
  const previous = new Map();
  for (const [name, value] of Object.entries(overrides)) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }

  try {
    // `await` so the restore runs after the callback settles. Without it the `finally` fires
    // as soon as `run()` hands back its promise, and an async callback then resolves paths
    // against the real machine state instead of the temporary one.
    return await run();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

/**
 * Creates a temporary copy of the repository Codex sandbox fixture.
 */
function makeSandboxCopy() {
  const tempRoot = makeTempDir("codex-switch-cli-e2e-");
  fs.cpSync(fixtureCodexDir, tempRoot, { recursive: true });
  return tempRoot;
}

/**
 * Creates an empty Codex directory for init-oriented tests.
 */
function makeEmptyCodexDir() {
  const codexDir = makeTempDir("codex-switch-empty-");
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
      : makeTempDir("codex-switch-tool-home-");

  const stdout = [];
  const stderr = [];

  const status = await withEnv({ CODEXS_HOME: toolHomeDir }, () =>
    runCli(args, {
      stdout: (line) => {
        stdout.push(line);
      },
      stderr: (line) => {
        stderr.push(line);
      },
    })
  );

  // Temporary directories are owned by the registry, not removed here: an inline cleanup is
  // what previously deleted a caller's Codex directory, because the Codex directory had been
  // borrowed as the tool home.
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
  makeTempDir,
  removeTempDir,
  cleanupTempDirs,
  withEnv,
  makeToolHomeWithManagedState,
  makeSandboxCopy,
  makeEmptyCodexDir,
  runBuiltCli,
  runJsonCli,
};
