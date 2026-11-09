---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Feature flags: the default account gets a Feature flags screen to turn each flag on or off, roll
it out to a share of accounts or target accounts by email or id, with the history of changes.
The API enforces flags and the web app hides what is off. First flags, both off:
`llm-subscription-chatgpt` and `llm-subscription-claude`. New API routes: `GET /features`,
`GET /admin/feature-flags` and `PUT /admin/feature-flags/:key`; `GET /auth/me` now tells
whether the user is the admin (`isAdmin`). `node ace skills:refresh` reports its progress, and a
skills.sh or GitHub request that takes over 30 seconds now fails instead of blocking the run.
