const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createCodexPaths } = require("../dist/infra/codex-paths");
const { parseArgs } = require("../dist/cli/args");
const { executeCommand } = require("../dist/cli");
const { renderSuccess, renderFailure } = require("../dist/cli/output");
const { normalizeError } = require("../dist/domain/errors");

const repoRoot = path.resolve(__dirname, "..");
const devSandboxDir = path.join(repoRoot, "dev-codex", "local-sandbox");

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-test-"));
}

function createFixturePaths(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(
    path.join(dirPath, "config.toml"),
    [
      "# managed config fixture",
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
      "[profiles.manual-only]",
      'model = "gpt-4.1-mini"',
      'model_provider = "manual-only"',
      "",
      "[model_providers.packycode]",
      'base_url = "https://relay.example.com/v1"',
      "",
      "[model_providers.freemodel]",
      'base_url = "https://free.example.com/v1"',
      "",
      "[model_providers.manual-only]",
      'base_url = "https://manual.example.com/v1"',
      "",
    ].join("\n"),
    "utf8"
  );

  fs.writeFileSync(
    path.join(dirPath, "providers.json"),
    `${JSON.stringify(
      {
        providers: {
          packycode: {
            profile: "packycode",
            apiKey: "sk-packycode",
            note: "primary",
            tags: ["daily"],
          },
          freemodel: {
            profile: "freemodel",
            apiKey: "sk-freemodel",
          },
        },
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  fs.writeFileSync(path.join(dirPath, "auth.json"), "{\n  \"token\": \"cached\"\n}\n", "utf8");
  return createCodexPaths(dirPath);
}

function copyDevSandbox(tempRoot, name = "sandbox") {
  const targetDir = path.join(tempRoot, name);
  fs.cpSync(devSandboxDir, targetDir, { recursive: true });
  return createCodexPaths(targetDir);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function runCliJson(args, options = {}) {
  const actualArgs = args.includes("--json") ? args : [...args, "--json"];
  const env = { ...process.env, ...(options.env ?? {}) };
  for (const key of options.deleteEnv ?? []) {
    delete env[key];
  }
  const previousEnv = { ...process.env };
  let rendered;
  try {
    Object.assign(process.env, env);
    for (const key of Object.keys(process.env)) {
      if (!Object.prototype.hasOwnProperty.call(env, key)) {
        delete process.env[key];
      }
    }
    const parsed = parseArgs(actualArgs);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };
    const runtime = createNonInteractiveRuntime();
    const result = await executeCommand(ctx, parsed, runtime);
    rendered = renderSuccess(ctx, result);
  } catch (error) {
    const parsed = parseArgs(actualArgs);
    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };
    rendered = renderFailure(ctx, normalizeError(error));
  } finally {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, previousEnv);
  }

  const stdoutText = rendered.stdout.join("\n").trim();
  const stderrText = rendered.stderr.join("\n").trim();
  const payloadText = rendered.exitCode === 0 ? stdoutText : stderrText;
  return {
    status: rendered.exitCode,
    stdoutText,
    stderrText,
    envelope: payloadText ? JSON.parse(payloadText) : null,
  };
}

function createNonInteractiveRuntime() {
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
  };
}

function createFakeCodexBin(tempRoot, options = {}) {
  const version = options.version ?? "0.0.5";
  const authToken = options.authToken ?? "fake-login";
  const binDir = path.join(tempRoot, "fake-codex-bin");
  fs.mkdirSync(binDir, { recursive: true });

  if (process.platform === "win32") {
    const scriptPath = path.join(binDir, "codex.cmd");
    fs.writeFileSync(
      scriptPath,
      [
        "@echo off",
        'if "%1"=="--version" (',
        `  echo codex ${version}`,
        "  exit /b 0",
        ")",
        'if "%1"=="login" (',
        '  if "%2"=="--with-api-key" (',
        "    set /p APIKEY=",
        '    > "%CD%\\auth.json" (',
        "      echo {",
        `      echo   \"token\": \"${authToken}\"`,
        "      echo }",
        "    )",
        "    exit /b 0",
        "  )",
        ")",
        "echo unsupported codex args 1>&2",
        "exit /b 1",
        "",
      ].join("\r\n"),
      "utf8"
    );
  } else {
    const scriptPath = path.join(binDir, "codex");
    fs.writeFileSync(
      scriptPath,
      [
        "#!/bin/sh",
        'if [ "$1" = "--version" ]; then',
        `  echo "codex ${version}"`,
        "  exit 0",
        "fi",
        'if [ "$1" = "login" ] && [ "$2" = "--with-api-key" ]; then',
        "  read APIKEY || true",
        "  cat > \"$PWD/auth.json\" <<'EOF'",
        "{",
        `  \"token\": \"${authToken}\"`,
        "}",
        "EOF",
        "  exit 0",
        "fi",
        'echo "unsupported codex args" >&2',
        "exit 1",
        "",
      ].join("\n"),
      "utf8"
    );
    fs.chmodSync(scriptPath, 0o755);
  }

  return {
    binDir,
    env: {
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  };
}

module.exports = {
  makeTempRoot,
  createFixturePaths,
  copyDevSandbox,
  readJsonFile,
  runCliJson,
  createFakeCodexBin,
  repoRoot,
  devSandboxDir,
};
