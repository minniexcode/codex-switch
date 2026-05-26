"use strict";

const path = require("node:path");

const specs = [
  require(path.join(__dirname, "config-mutation.spec.js")),
  require(path.join(__dirname, "release-contract.spec.js")),
];

let failures = 0;

for (const spec of specs) {
  try {
    spec.run();
  } catch (error) {
    failures += 1;
    console.error(error instanceof Error ? error.stack : error);
  }
}

if (failures > 0) {
  process.exit(1);
}
