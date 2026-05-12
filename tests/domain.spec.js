const assert = require("node:assert/strict");
const {
  applyPatchOperations,
  buildManagedProfileViews,
  collectConfigConsistencyIssues,
  parseStructuredConfig,
  parseTopLevelProfile,
  parseProfileNames,
  planConfigMutation,
  replaceTopLevelProfile,
} = require("../dist/domain/config");
const {
  validateProvidersShape,
  cleanProviderRecord,
  findProviderByProfile,
  maskSecret,
} = require("../dist/domain/providers");
const { inspectLiveStateDrift, getStorageRoles } = require("../dist/domain/runtime-state");
const { getBackupId, sortBackupList, toBackupListItem } = require("../dist/domain/backups");

function run() {
  testConfigPatchingEdgeCases();
}

function testConfigPatchingEdgeCases() {
  const content = [
    'profile = "packycode"',
    "",
    "[profiles.packycode]",
    'model = "gpt-5"',
    "",
    "[profiles.freemodel]",
    'model = "gpt-5-mini"',
  ].join("\n");

  assert.equal(parseTopLevelProfile(content), "packycode");
  assert.deepEqual([...parseProfileNames(content)].sort(), ["freemodel", "packycode"]);
  const structured = parseStructuredConfig(
    [
      "# keep me",
      'profile = "packycode"',
      "",
      "[profiles.packycode]",
      'model = "gpt-5"',
      'base_url = "https://relay.example.com/v1"',
      "",
      "[profiles.manual]",
      'model = "gpt-4.1-mini"',
      'base_url = "https://manual.example.com/v1"',
      "",
    ].join("\n")
  );
  assert.equal(structured.activeProfile, "packycode");
  assert.equal(structured.profiles[0].baseUrl, "https://relay.example.com/v1");

  const replaced = replaceTopLevelProfile(content, "freemodel");
  assert.match(replaced, /profile = "freemodel"/);
  const mutation = planConfigMutation(structured, {
    setActiveProfile: "manual",
    upsertProfiles: {
      packycode: {
        model: "gpt-5.1",
        baseUrl: "https://relay-next.example.com/v1",
      },
      created: {
        model: "gpt-4.1",
        baseUrl: "https://created.example.com/v1",
      },
    },
    deleteProfiles: ["manual"],
  });
  const mutated = applyPatchOperations(structured.rawText, mutation.operations);
  assert.match(mutated, /# keep me/);
  assert.match(mutated, /profile = "manual"/);
  assert.match(mutated, /base_url = "https:\/\/relay-next\.example\.com\/v1"/);
  assert.match(mutated, /\[profiles\.created\]/);
  assert.equal(mutated.includes("[profiles.manual]"), false);

  const views = buildManagedProfileViews(structured, {
    providers: {
      packycode: {
        profile: "packycode",
        apiKey: "sk-packycode",
      },
      sharedA: {
        profile: "shared",
        apiKey: "sk-shared-a",
      },
      sharedB: {
        profile: "shared",
        apiKey: "sk-shared-b",
      },
    },
  });
  const packyView = views.find((view) => view.name === "packycode");
  const orphanedRef = views.find((view) => view.name === "shared");
  const unmanaged = views.find((view) => view.name === "manual");
  assert.equal(packyView.managed, true);
  assert.equal(orphanedRef.source, "orphaned-reference");
  assert.equal(unmanaged.source, "unmanaged");

  const issueCodes = collectConfigConsistencyIssues(structured, {
    providers: {
      packycode: {
        profile: "packycode",
        apiKey: "sk-packycode",
      },
      sharedA: {
        profile: "shared",
        apiKey: "sk-shared-a",
      },
      sharedB: {
        profile: "shared",
        apiKey: "sk-shared-b",
      },
    },
  }).map((issue) => issue.code);
  assert.equal(issueCodes.includes("ORPHANED_PROFILE_REFERENCE"), true);
  assert.equal(issueCodes.includes("SHARED_PROFILE_REFERENCE"), true);
  assert.equal(issueCodes.includes("ORPHANED_PROFILE_SECTION"), true);

  const parsed = validateProvidersShape({
    providers: {
      packycode: {
        profile: "packycode",
        apiKey: "sk-123",
        baseUrl: "https://example.com/v1",
        note: " primary ",
        tags: [" free ", "daily"],
      },
    },
  });
  assert.equal(parsed.providers.packycode.profile, "packycode");
  assert.deepEqual(parsed.providers.packycode.tags, ["free", "daily"]);

  const record = cleanProviderRecord({
    profile: " freemodel ",
    apiKey: " sk-abcde ",
    tags: [" daily "],
  });
  assert.equal(record.profile, "freemodel");
  assert.equal(record.apiKey, "sk-abcde");
  assert.equal(maskSecret(record.apiKey), "sk-***de");

  const name = findProviderByProfile(
    {
      providers: {
        freemodel: record,
      },
    },
    "freemodel"
  );
  assert.equal(name, "freemodel");

  assert.deepEqual(getStorageRoles(), {
    managementSSOT: "providers.json",
    runtimeMirrors: ["config.toml", "auth.json"],
    rollbackState: "backups/latest.json",
  });

  const drift = inspectLiveStateDrift("freemodel", {
    providers: {
      packycode: {
        profile: "packycode",
        apiKey: "sk-123",
      },
    },
  });
  assert.equal(drift.canBackfillActiveProvider, true);
  assert.equal(drift.reason, "provider-unmapped");

  const backupItem = toBackupListItem({
    version: 1,
    createdAt: "2026-05-12T01:02:03.000Z",
    reason: "switch",
    rootDir: "/tmp/.codex",
    backupDir: "/tmp/.codex/backups/20260512-010203-switch",
    files: [{ relativePath: "config.toml", existed: true, backupFileName: "config.toml" }],
  });
  assert.equal(getBackupId(backupItem.backupPath), "20260512-010203-switch");
  assert.equal(backupItem.files[0], "config.toml");

  const sorted = sortBackupList([
    { backupId: "old", createdAt: "2026-05-11T00:00:00.000Z", reason: "add", files: [], backupPath: "old" },
    { backupId: "new", createdAt: "2026-05-12T00:00:00.000Z", reason: "switch", files: [], backupPath: "new" },
  ]);
  assert.deepEqual(sorted.map((item) => item.backupId), ["new", "old"]);

  const commentedStructured = parseStructuredConfig(
    [
      "[profiles.commenty]",
      'model = "gpt-5" # keep model comment',
      'base_url = "https://old.example.com/v1" # keep url comment',
      "",
    ].join("\n")
  );
  const commentedMutation = planConfigMutation(commentedStructured, {
    upsertProfiles: {
      commenty: {
        model: "gpt-5.1",
        baseUrl: "https://new.example.com/v1",
      },
    },
  });
  const commentedPatched = applyPatchOperations(commentedStructured.rawText, commentedMutation.operations);
  assert.match(commentedPatched, /model = "gpt-5\.1" # keep model comment/);
  assert.match(commentedPatched, /base_url = "https:\/\/new\.example\.com\/v1" # keep url comment/);

  const missingFieldsStructured = parseStructuredConfig(
    [
      "[profiles.partial]",
      'temperature = "0.2"',
      "",
      "# trailing comment",
      "",
    ].join("\n")
  );
  const missingFieldsMutation = planConfigMutation(missingFieldsStructured, {
    upsertProfiles: {
      partial: {
        model: "gpt-5-mini",
        baseUrl: "https://partial.example.com/v1",
      },
    },
  });
  const insertOps = missingFieldsMutation.operations.filter((operation) => operation.kind === "insert-at");
  assert.equal(insertOps.length, 1);
  const missingFieldsPatched = applyPatchOperations(missingFieldsStructured.rawText, missingFieldsMutation.operations);
  assert.match(
    missingFieldsPatched,
    /\[profiles\.partial\]\ntemperature = "0\.2"\nmodel = "gpt-5-mini"\nbase_url = "https:\/\/partial\.example\.com\/v1"\n\n# trailing comment/
  );

  const partialUpdateStructured = parseStructuredConfig(
    [
      "[profiles.existing]",
      'temperature = "0.2"',
      'base_url = "https://existing.example.com/v1"',
      "",
    ].join("\n")
  );
  const partialUpdateMutation = planConfigMutation(partialUpdateStructured, {
    upsertProfiles: {
      existing: {
        model: "gpt-4.1-mini",
      },
    },
  });
  const partialUpdatePatched = applyPatchOperations(partialUpdateStructured.rawText, partialUpdateMutation.operations);
  assert.match(partialUpdatePatched, /temperature = "0\.2"/);
  assert.match(partialUpdatePatched, /model = "gpt-4\.1-mini"/);
  assert.match(partialUpdatePatched, /base_url = "https:\/\/existing\.example\.com\/v1"/);
}

module.exports = { run };
