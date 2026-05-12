const assert = require("node:assert/strict");
const {
  parseTopLevelProfile,
  parseProfileNames,
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

  const replaced = replaceTopLevelProfile(content, "freemodel");
  assert.match(replaced, /profile = "freemodel"/);

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
}

module.exports = { run };
