"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Skip, cliEntry, cleanupSandboxes } = require("./sandbox");

/**
 * Runs the real-machine end-to-end suite.
 *
 * Deliberately outside `tests/*.spec.js`: `tests/run-tests.js` discovers by pattern with no
 * tagging or opt-in, so a spec placed there would also run on all four CI legs of `npm test`.
 * This suite spawns a process per case and belongs in its own step.
 *
 * Unlike the unit runner, this one prints a summary line and every skip reason. The unit
 * runner's "silence means green" is right for a fast in-process suite; here it would hide the
 * environment-dependent cases, which are exactly the ones worth seeing.
 */
async function main() {
  if (!fs.existsSync(cliEntry)) {
    console.error(`Missing ${cliEntry}. Run \`npm run build\` first (or \`npm run test:e2e\`).`);
    process.exit(1);
  }

  const specFiles = fs
    .readdirSync(__dirname)
    .filter((entry) => entry.endsWith(".spec.js"))
    .sort((left, right) => left.localeCompare(right));

  let passed = 0;
  const failures = [];
  const skips = [];

  console.log(`Running ${specFiles.length} E2E spec file(s) against ${path.relative(process.cwd(), cliEntry)}\n`);

  for (const specFile of specFiles) {
    let suite;
    try {
      suite = require(path.join(__dirname, specFile));
    } catch (error) {
      failures.push({ suite: specFile, test: "(load)", error });
      console.log(`FAIL  ${specFile} — failed to load`);
      continue;
    }

    const suiteName = suite.name || specFile;
    console.log(`${suiteName}  (${specFile})`);

    for (const test of suite.tests) {
      try {
        await test.run();
        passed += 1;
        console.log(`  ok    ${test.name}`);
      } catch (error) {
        if (error instanceof Skip) {
          skips.push({ suite: suiteName, test: test.name, reason: error.message });
          console.log(`  SKIP  ${test.name} — ${error.message}`);
          continue;
        }
        failures.push({ suite: suiteName, test: test.name, error });
        console.log(`  FAIL  ${test.name}`);
      } finally {
        // Released per suite rather than only at the end, so the temp root stays bounded when a
        // spec fails partway through.
        cleanupSandboxes();
      }
    }

    console.log("");
  }

  console.log("─".repeat(72));
  console.log(`passed: ${passed}   failed: ${failures.length}   skipped: ${skips.length}`);

  if (skips.length > 0) {
    console.log("\nSkipped:");
    for (const entry of skips) {
      console.log(`  - ${entry.suite} / ${entry.test}: ${entry.reason}`);
    }
  }

  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const { suite, test, error } of failures) {
      console.log(`\n${suite} / ${test}`);
      console.log(error instanceof Error ? error.stack : String(error));
    }
    process.exit(1);
  }
}

void main();
