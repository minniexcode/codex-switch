#!/usr/bin/env node

const args = process.argv.slice(2);

const helpText = `codex-switch

Bootstrap release for the future Codex provider/profile switching CLI.

Usage:
  codexs
  codexs --help
  codexs --version

Status:
  This package currently reserves the npm name and exposes the planned CLI entrypoint.
  The full switching workflow is not implemented yet.

Docs:
  https://github.com/minniexcode/codex-switch
`;

if (args.includes("--version") || args.includes("-v")) {
  console.log("0.0.1");
  process.exit(0);
}

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(helpText);
  process.exit(0);
}

console.error(
  `Command not implemented yet: ${args.join(" ")}\nRun "codexs --help" for the current bootstrap status.`
);
process.exit(1);
