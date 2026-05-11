const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

fs.rmSync("dist", { recursive: true, force: true });

const command = process.platform === "win32" ? "tsc.cmd" : "tsc";
const result = spawnSync(command, {
  stdio: "inherit",
  shell: true,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
