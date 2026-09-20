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
      name: "package metadata is 0.4.1",
      run() {
        const packageJson = require("../package.json");
        const packageLock = require("../package-lock.json");
        assert.equal(packageJson.version, "0.4.1");
        assert.equal(packageLock.version, "0.4.1");
        assert.equal(packageLock.packages[""].version, "0.4.1");
      },
    },
    {
      name: "current docs use 0.4.1 fact sources",
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
          // The overview and architecture docs deliberately lag a release or two, so the regex
          // spans the whole 0.x line rather than pinning the current version.
          assert.match(content, /0\.2\.1|0\.3\.0|0\.3\.1|0\.4\.0|0\.4\.1/, relativePath);
        }
        for (const version of ["0.4.1", "0.4.0", "0.3.1", "0.3.0", "0.2.1"]) {
          assert.ok(
            fs.existsSync(path.join(repoRoot, `docs/PRD/codex-switch-prd-v${version}.md`)),
            `missing docs/PRD/codex-switch-prd-v${version}.md`
          );
          assert.ok(
            fs.existsSync(path.join(repoRoot, `docs/Design/codex-switch-v${version}-design.md`)),
            `missing docs/Design/codex-switch-v${version}-design.md`
          );
        }
        assert.match(read("README.md"), /Claude Code provider switching|managing and switching Codex and Claude Code/);
        assert.match(read("README.AI.md"), /local-first CLI for managing and switching Codex and Claude Code/);
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
          // Both were missing before 0.4.1, so a regression that dropped either from `--help`
          // would have passed this test — the list asserted 18 of the 20 commands.
          "backups prune",
          "unlock",
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
      name: "version command reports 0.4.1",
      async run() {
        const result = await runBuiltCli(["--version"]);
        assert.equal(result.status, 0);
        assert.equal(result.stdout.trim(), "0.4.1");
      },
    },
  ],
};
