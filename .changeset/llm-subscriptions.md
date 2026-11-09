---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

LLM subscriptions: besides an API key, each account can connect its own ChatGPT subscription
(OpenAI's device code; tokens stored encrypted with `APP_KEY` in the new `llm_connections` table)
or Claude subscription (signed in and held by the official `claude` binary, pinned in the API image,
in one folder per account under `CLAUDE_CODE_HOME`). Behind the `llm-subscription-chatgpt` and
`llm-subscription-claude` flags. New routes under `/llm/connections/openai-codex` and
`/llm/connections/claude-code`; `GET /llm/providers` now gives each kind's `auth` and `connected`;
a new failure reason, `subscription_expired`. Deploys need a persistent volume for
`CLAUDE_CODE_HOME` (`/data/claude` in the Compose stacks).
