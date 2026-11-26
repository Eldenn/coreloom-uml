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
  existing ones again; the code no longer reads an `APP_KEY` token).
- Every stored LLM secret is bound to its owner's account as well as its kind: a ciphertext copied
  to another account's row never decrypts there. A migration seals the saved keys again that way.
- A Claude subscription is still signed in and called by the official `claude` binary alone, but its
  state now lives in the new `claude_code_states` table instead of a folder per account: each launch
  of the binary gets it in a short-lived private folder, writes back the tokens it refreshed, and
  the launches of one account run one at a time. `node ace claude:import`, run at every start in the
  Compose stacks, moves the existing account folders into the database and removes them.

Deploying this version takes a maintenance window, once:

1. Set `LLM_KEYS_ENCRYPTION_KEYS` (the API refuses to start in production without it; `migrate`
   and `queue-worker` get it too, the skill workers do not need it).
2. Stop `api` and `queue-worker` before the deploy starts, and start them only on the new image.
   The image before cannot read the tokens and keys the migrations seal again (it deletes a
   ChatGPT connection it cannot read), and it uses the Claude folders without the lock that
   `claude:import` takes: running while `migrate` runs, it signs accounts out.
3. Deploy: `migrate` runs the migrations, then `claude:import`, which moves the Claude account
   folders of the `/data/claude` volume into the database. Its log line counts the folders moved,
   left in place (credentials that cannot be read whole) and purged.
4. `api` now keeps its launch folders in memory (`tmpfs`); the volume is only `migrate`'s, and can
   be dropped once the import has run.

Rolling back is not free: `migration:rollback` seals the ChatGPT tokens with `APP_KEY` again and
the saved keys for their kind alone, but drops `claude_code_states`, whose folders the import
removed, so every Claude subscription has to be connected again. An image rolled back without the
migrations' rollback reads none of the tokens and keys, and deletes every ChatGPT connection.
