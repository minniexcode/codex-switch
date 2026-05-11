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
} = require("../dist/domain/providers");

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
    apiKey: " sk-abc ",
    tags: [" daily "],
  });
  assert.equal(record.profile, "freemodel");
  assert.equal(record.apiKey, "sk-abc");

  const name = findProviderByProfile(
    {
      providers: {
        freemodel: record,
      },
    },
    "freemodel"
  );
  assert.equal(name, "freemodel");
}

module.exports = { run };
