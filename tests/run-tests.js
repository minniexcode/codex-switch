const { run: runDomainTests } = require("./domain.spec");
const { run: runAppTests } = require("./app.spec");
const { run: runCliTests } = require("./cli.spec");

const suites = [
  ["domain", runDomainTests],
  ["app", runAppTests],
  ["cli", runCliTests],
];

let failures = 0;

async function main() {
  for (const [name, runner] of suites) {
    try {
      await runner();
      process.stdout.write(`PASS ${name}\n`);
    } catch (error) {
      failures += 1;
      process.stderr.write(`FAIL ${name}\n`);
      process.stderr.write(`${error.stack || error}\n`);
    }
  }

  if (failures > 0) {
    process.exit(1);
  }
}

void main();
