---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Every LLM credential is now kept in the database, sealed by a dedicated encrypter
(`LLM_KEYS_ENCRYPTION_KEYS`, separate from `APP_KEY`), whatever the provider:

- Provider API keys are saved to the account (`PUT` / `DELETE /llm/api-keys/:kind`, one per kind,
  saved only after a successful test call) and read by every model call; a request body no longer
  carries a key or a base URL, and the settings screen saves, replaces and deletes the key. A key
  an older browser entry still holds is offered for saving once, then dropped.
- ChatGPT subscription tokens move from `APP_KEY` to the dedicated encrypter (a migration seals the
  existing ones again; an `APP_KEY` row is still read until then).
- A Claude subscription is still signed in and called by the official `claude` binary alone, but its
  state now lives in the new `claude_code_states` table instead of a folder per account: each launch
  of the binary gets it in a short-lived private folder, writes back the tokens it refreshed, and
  the launches of one account run one at a time. `node ace claude:import`, run at every start in the
  Compose stacks, moves the existing account folders into the database and removes them.

Deploys: set `LLM_KEYS_ENCRYPTION_KEYS` (the API refuses to start in production without it; the
`migrate` and `queue-worker` services get it too, the skill workers do not need it). Keep the
`/data/claude` volume until `claude:import` has run once.
