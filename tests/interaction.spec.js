"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

  const {
    canPrompt,
    chooseCodexDir,
    confirmCreateCodexDir,
    collectSetupProviderDetails,
    collectEditInput,
    confirmProviderRemoval,
    confirmRollback,
    promptForProviderSelection,
  } = require("../dist/interaction/interactive.js");
const { collectAddInput, collectCopilotAddInput, createNonInteractiveAddError } = require("../dist/interaction/add-interactive.js");

function createRuntime(overrides = {}) {
  return {
    isInteractive: () => true,
    inputText: async () => "",
    inputSecret: async () => "",
    selectOne: async () => "",
    selectMany: async () => [],
    confirmAction: async () => true,
    writeLine: () => {},
    ...overrides,
  };
}

module.exports = {
  name: "interaction",
  tests: [
    {
      name: "canPrompt disables interaction under json mode",
      run() {
        assert.equal(canPrompt(createRuntime(), true), false);
        assert.equal(canPrompt(createRuntime({ isInteractive: () => false }), false), false);
        assert.equal(canPrompt(createRuntime(), false), true);
      },
    },
    {
      name: "confirmProviderRemoval normalizes declined confirmation to prompt cancellation",
      async run() {
        await assert.rejects(
          () => confirmProviderRemoval(createRuntime({ confirmAction: async () => false }), "alpha"),
          (error) => error && error.code === "PROMPT_CANCELLED"
        );
      },
    },
    {
      name: "confirmCreateCodexDir returns the runtime confirmation result",
      async run() {
        assert.equal(await confirmCreateCodexDir(createRuntime({ confirmAction: async () => true }), "C:\\temp\\.codex"), true);
        assert.equal(await confirmCreateCodexDir(createRuntime({ confirmAction: async () => false }), "C:\\temp\\.codex"), false);
      },
    },
    {
      name: "chooseCodexDir handles multiple setup candidates through the interaction layer",
      async run() {
        const selected = await chooseCodexDir(
          createRuntime({
            selectOne: async () => "C:\\temp\\.codex-b",
          }),
          ["C:\\temp\\.codex-a", "C:\\temp\\.codex-b"]
        );
        assert.equal(selected, "C:\\temp\\.codex-b");
      },
    },
    {
      name: "collectAddInput progressively resolves missing required fields",
      async run() {
        const textAnswers = ["alpha", "gamma", "gamma", "gpt-4o-mini", "https://gamma.example"];
        const secretAnswers = ["sk-gamma", "sk-gamma"];
        const runtime = createRuntime({
          inputText: async () => textAnswers.shift() ?? "",
          inputSecret: async () => secretAnswers.shift() ?? "",
          selectMany: async () => ["paid"],
        });

        const result = await collectAddInput(
          runtime,
          { tags: [] },
          (providerName) => providerName === "alpha",
          () => false
        );
        assert.equal(result.providerName, "gamma");
        assert.equal(result.profile, "gamma");
        assert.equal(result.apiKey, "sk-gamma");
        assert.equal(result.createProfile, true);
        assert.equal(result.model, "gpt-4o-mini");
        assert.equal(result.baseUrl, "https://gamma.example");
        assert.deepEqual(result.tags, ["paid"]);
      },
    },
    {
      name: "collectCopilotAddInput collects Copilot fields without requiring a provider API key",
      async run() {
        const textAnswers = ["alpha", "copilot-main", "gpt-4o-mini", "", "127.0.0.1", "41415"];
        const secretAnswers = [""];
        const writes = [];
        const runtime = createRuntime({
          inputText: async () => textAnswers.shift() ?? "",
          inputSecret: async () => secretAnswers.shift() ?? "",
          selectMany: async () => ["paid"],
          writeLine: (message) => {
            writes.push(message);
          },
        });

        const result = await collectCopilotAddInput(
          runtime,
          { tags: [] },
          () => false,
          () => false
        );
        assert.equal(result.providerName, "alpha");
        assert.equal(result.profile, "copilot-main");
        assert.equal(result.createProfile, true);
        assert.equal(result.model, "gpt-4o-mini");
        assert.equal(result.bridgeHost, "127.0.0.1");
        assert.equal(result.bridgePort, 41415);
        assert.equal(result.bridgeApiKey, null);
        assert.deepEqual(result.tags, ["paid"]);
        assert.ok(!writes.includes("API key is required."));
      },
    },
    {
      name: "createNonInteractiveAddError describes the Copilot non-interactive contract separately",
      run() {
        const error = createNonInteractiveAddError({ copilot: true });
        assert.equal(error.code, "INVALID_ARGUMENT");
        assert.match(error.message, /add --copilot requires <provider> and --profile/);
      },
    },
    {
      name: "collectSetupProviderDetails requires an api key before returning provider drafts",
      async run() {
        const textAnswers = ["", "", ""];
        const secretAnswers = ["", "sk-freemodel"];
        const writes = [];
        const runtime = createRuntime({
          inputText: async () => textAnswers.shift() ?? "",
          inputSecret: async () => secretAnswers.shift() ?? "",
          selectMany: async () => [],
          writeLine: (message) => {
            writes.push(message);
          },
        });

        const result = await collectSetupProviderDetails(runtime, ["freemodel"], {
          freemodel: {
            providerName: "freemodel",
            baseUrl: "https://free.example/v1",
          },
        });
        assert.deepEqual(result, {
          freemodel: {
            providerName: "freemodel",
            apiKey: "sk-freemodel",
            baseUrl: "https://free.example/v1",
            note: undefined,
            tags: undefined,
          },
        });
        assert.ok(writes.includes('API key for profile "freemodel" is required.'));
      },
    },
    {
      name: "collectEditInput returns updated values from interactive prompts",
      async run() {
        const answers = ["beta", "sk-beta", "https://beta.example", "secondary"];
        const runtime = createRuntime({
          inputText: async () => answers.shift() ?? "",
          inputSecret: async () => answers.shift() ?? "",
          selectMany: async () => ["backup"],
        });

        const result = await collectEditInput(runtime, {
          profile: "alpha",
          apiKey: "sk-alpha",
          baseUrl: "https://alpha.example",
          note: "primary",
          tags: ["paid"],
        });
        assert.equal(result.profile, "beta");
        assert.equal(result.apiKey, "sk-beta");
        assert.equal(result.note, "secondary");
        assert.deepEqual(result.tags, ["backup"]);
      },
    },
    {
      name: "collectEditInput drops non-preset default tags during interactive editing",
      async run() {
        const answers = ["alpha", "", "", ""];
        let observedDefaults;
        const runtime = createRuntime({
          inputText: async () => answers.shift() ?? "",
          inputSecret: async () => answers.shift() ?? "",
          selectMany: async (_label, _options, config) => {
            observedDefaults = config?.defaultValues;
            return config?.defaultValues ?? [];
          },
        });

        const result = await collectEditInput(runtime, {
          profile: "alpha",
          apiKey: "sk-alpha",
          baseUrl: "https://alpha.example",
          note: "primary",
          tags: ["paid", "custom"],
        });
        assert.deepEqual(observedDefaults, ["paid"]);
        assert.deepEqual(result.tags, ["paid"]);
      },
    },
    {
      name: "promptForProviderSelection and rollback confirmation stay on the interaction boundary",
      async run() {
        const codexDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-interaction-"));
        const providersPath = path.join(codexDir, "providers.json");
        const configPath = path.join(codexDir, "config.toml");
        const backupsDir = path.join(codexDir, "backups");
        const latestBackupPath = path.join(backupsDir, "latest.json");
        let observedChoices = [];
        fs.mkdirSync(backupsDir, { recursive: true });
        fs.writeFileSync(
          providersPath,
          `${JSON.stringify(
            {
              providers: {
                alpha: { profile: "alpha", apiKey: "sk-alpha" },
                beta: { profile: "beta", apiKey: "sk-beta" },
              },
            },
            null,
            2
          )}\n`,
          "utf8"
        );
        fs.writeFileSync(configPath, 'profile = "beta"\n', "utf8");

        const selected = await promptForProviderSelection(
          createRuntime({
            selectOne: async (_message, choices) => {
              observedChoices = choices;
              return "beta";
            },
          }),
          providersPath,
          configPath,
          "Choose a provider"
        );
        assert.equal(selected, "beta");
        assert.equal(observedChoices.find((choice) => choice.value === "beta").hint, "profile=beta | type=direct | current");

        const manifest = {
          version: 1,
          createdAt: new Date().toISOString(),
          reason: "switch",
          backupDir: path.join(backupsDir, "20260513-000000-switch"),
          files: [
            {
              relativePath: "config.toml",
              restorePath: path.join(codexDir, "config.toml"),
              existed: true,
              backupFileName: "config.toml",
            },
          ],
        };
        fs.mkdirSync(manifest.backupDir, { recursive: true });
        fs.writeFileSync(path.join(manifest.backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
        fs.writeFileSync(latestBackupPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

        await assert.rejects(
          () => confirmRollback(createRuntime({ confirmAction: async () => false }), latestBackupPath),
          (error) => error && error.code === "PROMPT_CANCELLED"
        );
      },
    },
  ],
};
