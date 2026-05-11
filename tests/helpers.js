const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createCodexPaths } = require("../dist/infra/codex-paths");

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-test-"));
}

function createFixturePaths(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(
    path.join(dirPath, "config.toml"),
    [
      'profile = "packycode"',
      "",
      "[profiles.packycode]",
      'model = "gpt-5"',
      "",
      "[profiles.freemodel]",
      'model = "gpt-5-mini"',
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

module.exports = {
  makeTempRoot,
  createFixturePaths,
};
