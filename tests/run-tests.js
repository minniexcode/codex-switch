"use strict";

const path = require("node:path");

const specs = [
  require(path.join(__dirname, "config-mutation.spec.js")),
  require(path.join(__dirname, "copilot-bridge-contract.spec.js")),
  require(path.join(__dirname, "v012-design.spec.js")),
  require(path.join(__dirname, "v013-hotfix.spec.js")),
];

let failures = 0;

async function main() {
  for (const spec of specs) {
    try {
      await spec.run();
    } catch (error) {
      failures += 1;
      console.error(error instanceof Error ? error.stack : error);
    }
  }

  if (failures > 0) {
    process.exit(1);
  }
}

void main();
