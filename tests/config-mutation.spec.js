"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { parseStructuredConfig, applyPatchOperations } = require(path.join(__dirname, "..", "dist", "domain", "config.js"));
const { createConfigMutationPlan } = require(path.join(__dirname, "..", "dist", "storage", "config-repo.js"));
const {
  buildCopilotModelProviderProjection,
  buildDirectModelProviderProjection,
} = require(path.join(__dirname, "..", "dist", "domain", "providers.js"));

function run() {
  testCreatesCompleteDirectProviderRuntimeSection();
  testUpdatesExistingDirectProviderBaseUrlWithoutDroppingManagedFields();
  testPreservesCopilotProjection();
}

function testCreatesCompleteDirectProviderRuntimeSection() {
  const config = [
    'profile = "default"',
    "",
    "[profiles.default]",
    'model = "gpt-5.4"',
    'model_provider = "default"',
    "",
    "[model_providers.default]",
    'base_url = "https://api.openai.com/v1"',
    "",
  ].join("\n");

  const document = parseStructuredConfig(config);
  const plan = createConfigMutationPlan(document, {
    upsertProfiles: {
      packycode: {
        model: "gpt-5.4",
        modelProvider: "packycode",
      },
    },
    upsertModelProviders: {
      packycode: buildDirectModelProviderProjection("packycode", "https://www.packyapi.com/v1"),
    },
  });

  const nextConfig = applyPatchOperations(config, plan.operations);
  assert.match(nextConfig, /\[model_providers\.packycode\]/);
  assert.match(nextConfig, /base_url = "https:\/\/www\.packyapi\.com\/v1"/);
  assert.match(nextConfig, /name = "packycode"/);
  assert.match(nextConfig, /requires_openai_auth = true/);
  assert.match(nextConfig, /wire_api = "responses"/);
  assert.doesNotMatch(nextConfig, /stream_idle_timeout_ms/);
}

function testUpdatesExistingDirectProviderBaseUrlWithoutDroppingManagedFields() {
  const config = [
    'profile = "packycode"',
    "",
    "[profiles.packycode]",
    'model = "gpt-5.4"',
    'model_provider = "packycode"',
    "",
    "[model_providers.packycode]",
    'base_url = "https://old.example.com/v1"',
    'name = "packycode"',
    "requires_openai_auth = true",
    'wire_api = "responses"',
    "",
  ].join("\n");

  const document = parseStructuredConfig(config);
  const plan = createConfigMutationPlan(document, {
    upsertModelProviders: {
      packycode: buildDirectModelProviderProjection("packycode", "https://new.example.com/v1"),
    },
  });

  const nextConfig = applyPatchOperations(config, plan.operations);
  assert.match(nextConfig, /base_url = "https:\/\/new\.example\.com\/v1"/);
  assert.match(nextConfig, /name = "packycode"/);
  assert.match(nextConfig, /requires_openai_auth = true/);
  assert.match(nextConfig, /wire_api = "responses"/);
}

function testPreservesCopilotProjection() {
  const projection = buildCopilotModelProviderProjection({
    kind: "copilot-sdk-bridge",
    upstream: "github-copilot",
    bridgeHost: "127.0.0.1",
    bridgePort: 41415,
    bridgePath: "/v1",
    premiumRequests: true,
    authSource: "official-sdk",
    sdkInstallMode: "lazy",
  });

  assert.deepEqual(projection, {
    baseUrl: "http://127.0.0.1:41415/v1",
    name: "copilot",
    requiresOpenAiAuth: true,
    wireApi: "responses",
    streamIdleTimeoutMs: 300000,
  });
}

module.exports = { run };
