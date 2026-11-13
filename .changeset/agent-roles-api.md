---
"@coreloom-uml/api": minor
---

Agent roles API, behind the `agent-roles` flag: an agent configuration can hold roles, created from
scratch or from a ready-made preset (`GET /role-presets`), changed and deleted under
`/agent-configs/:id/roles`, and every generation renders them for each target tool.
