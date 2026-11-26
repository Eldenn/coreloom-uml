# Server-side storage of user LLM API keys — plan (2026-11-26)

## Goal

The user's provider API keys (anthropic, openai, mistral, ollama, openai-compatible) move from the
browser (`localStorage`) to server-side encrypted storage, so that every model call — request
handlers, BullMQ workers, anything that cannot reach the browser — uses the account's stored key.
One active key per provider per account. E2B sandboxes never receive the key: model calls stay in
the API/worker process, sandboxes stay tool runners.

## Decisions (architect + security consulted, owner's call)

- Dedicated `llm_api_keys` table: `user_id` (FK cascade), `kind`, encrypted `api_key`, `key_hint`
  (last 4 chars, plain), `base_url` (stored with the key; a call's base URL comes from the row,
  never from the request), `verified_at`, `created_at`, `updated_at`, `unique(user_id, kind)`.
- Dedicated encrypter `llmKeys` (`LLM_KEYS_ENCRYPTION_KEYS`, first key encrypts, all decrypt —
  rotation by prepending), `purpose: 'llm-api-key'`. Undecryptable row = "no key" (treated like
  the Codex tokens).
- `resolveCredential` is the only reader: stored key wins, request-body key stays as a fallback
  for one transition release ("expand"), then is removed ("contract").
- Routes: `PUT /llm/api-keys/:kind` (test call first, store only on success), `DELETE` → 204.
  Ownership by `where user_id = auth.user` — no id in the URL. `GET /llm/providers` answers
  `keyHint`, `baseUrl`, `verifiedAt` per kind; never the key.
- Jobs (later, separate): `job.data` carries ids only; the worker resolves the key in `process()`.
- AGENTS.md texts rewritten at contract time; sandbox rule ("the LLM key never enters it") kept.

## Steps (backend scope; the web changes belong to the frontend profile)

a. Migration + `LlmApiKey` model + `llmKeys` encrypter + `storedApiKey`/`saveApiKey`/`deleteApiKey`.
b. PUT/DELETE `/llm/api-keys/:kind` + `GET /llm/providers` enrichment.
c. `resolveCredential` prefers the stored key (body key kept as fallback — expand phase).
d. Web: settings screen saves via PUT, migration banner, `localStorage` without key (frontend).
e. Contract: drop `apiKey` from inputs, regenerate Tuyau registry, AGENTS.md.
f. First queued model call, `{ userId, provider }` only.

## Security requirements carried over (full report in the consultation)

- Never: logged, traced, returned, in an error, in `job.data`, in Redis, in a prompt or a sandbox.
- Key format validated (printable ASCII, one line, bounded length) before storage.
- Rate-limited behind `llmThrottle`; session guard only.
- `last_used_at` not implemented yet; audit events (`llm_key_events`) and notification emails are
  the next increment if the owner wants them.

## Transition and deployment notes (from the code review)

- `connected` stays `true` for key kinds until step e removes the request key: the current web
  disables "Test" when `connected === false`, and accounts still call with the browser key.
  What tells a saved key apart is `keyHint`.
- A saved key wins silently over a key changed in the browser: intended (the account's key is the
  source of truth once saved); the settings screen shows the hint so the state is visible.
- Staging runs with `NODE_ENV=production`: without `LLM_KEYS_ENCRYPTION_KEYS` set (even empty),
  `requiredInProduction` refuses to boot. Set it in the Coolify env before deploying.
- The BullMQ worker's environment does not carry `LLM_KEYS_ENCRYPTION_KEYS` yet: no job calls a
  model today. Add it to the `queue-worker` services when the first queued model call lands.
