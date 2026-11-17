---
"@coreloom-uml/api": patch
---

The `backend-architect` role preset is no longer read-only: a role created from it can write,
use the shell and commit, as its mission implements the schemas, APIs and pipelines it designs.
`GET /role-presets` now returns `readOnly: false` for it.
