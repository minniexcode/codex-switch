# codex-switch v0.1.1 Design

## Scope

- Support Codex `0.134.0+` only.
- Treat top-level `model` and `model_provider` as the runtime routing source of truth.
- Treat legacy top-level `profile` and legacy `[profiles.*]` sections as adopt-only and diagnostic inputs.
- Project provider auth through `auth.json` with `OPENAI_API_KEY`.
- Do not write `env_key` or `env_key_instructions` into managed `[model_providers.<id>]` sections.

## Command Contract

- `--profile <name>` remains a CLI alias for the stored `model_provider` id.
- `--model <name>` stores the provider default switch model in `providers.json`.
- `switch` writes top-level `model` and `model_provider`, repairs `[model_providers.<id>]`, rewrites `auth.json`, and removes the targeted legacy route selector/profile section.
- `add` and `edit` repair `[model_providers.<id>]` and scrub `env_key` / `env_key_instructions`.
- `remove --switch-to <provider-name>` switches by managed provider name, not by profile id.

## Persistence

- `providers.json` keeps `profile` as the persisted `model_provider` id alias.
- `providers.json` adds `model` for default route projection.
- Managed `[model_providers.<id>]` sections write:
  - `base_url`
  - `name`
  - `requires_openai_auth = true`
  - `wire_api = "responses"`

## Legacy Handling

- `config show` and `config list-profiles` expose legacy profile inspection views.
- `migrate` remains a legacy adoption helper and does not modify the active top-level route.
- `doctor` flags missing top-level route fields, legacy selectors/sections, and legacy `env_key` wiring in the active model provider section.
