"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { repoRoot, runBuiltCli } = require("./helpers");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

module.exports = {
  name: "release contract",
  tests: [
    {
      name: "package metadata is 0.2.1",
      run() {
        const packageJson = require("../package.json");
        const packageLock = require("../package-lock.json");
        assert.equal(packageJson.version, "0.2.1");
        assert.equal(packageLock.version, "0.2.1");
        assert.equal(packageLock.packages[""].version, "0.2.1");
      },
    },
    {
      name: "current docs use 0.2.1 fact sources",
      run() {
        for (const relativePath of [
          "README.md",
          "README.CN.md",
          "README.AI.md",
          "docs/cli-usage.md",
          "docs/codex-switch-product-overview.md",
          "docs/codex-switch-technical-architecture.md",
          "docs/Tests/testing.md",
          "CHANGELOG.md",
        ]) {
          const content = read(relativePath);
          assert.match(content, /0\.2\.1/, relativePath);
        }
        assert.ok(fs.existsSync(path.join(repoRoot, "docs/PRD/codex-switch-prd-v0.2.1.md")));
        assert.ok(fs.existsSync(path.join(repoRoot, "docs/Design/codex-switch-v0.2.1-design.md")));
        assert.match(read("README.md"), /provider-management-only consolidation release|provider-management-only/);
        assert.match(read("README.AI.md"), /local-first provider\/model-provider management CLI/);
      },
    },
    {
      name: "help exposes provider-management-only command surface",
      async run() {
        const result = await runBuiltCli(["--help"]);
        assert.equal(result.status, 0);
        for (const command of [
          "init",
          "migrate",
          "list",
          "show",
          "current",
          "status",
          "config show",
          "config list-profiles",
          "add",
          "edit",
          "switch",
          "remove",
          "import",
          "export",
          "backups list",
          "rollback",
          "doctor",
          "setup",
        ]) {
          assert.match(result.stdout, new RegExp(command.replace(" ", "\\s+")));
        }
        assert.doesNotMatch(result.stdout, /login copilot|--copilot|bridge start|bridge status|bridge stop|Copilot SDK/i);
      },
    },
    {
      name: "version command reports 0.2.1",
      async run() {
        const result = await runBuiltCli(["--version"]);
        assert.equal(result.status, 0);
        assert.equal(result.stdout.trim(), "0.2.1");
      },
    },
  ],
};
