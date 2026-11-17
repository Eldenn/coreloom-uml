---
---

`@coreloom-uml/catalog` now renders agent roles with the conventions: `renderAgentContext` takes
`roles` and writes one file per role and target tool that can run one (`.agents/roles/`,
`.claude/agents/`, `.codex/agents/`), with what each tool enforces of a role's rights. Nothing
passes a role yet, so there is no user-facing change. A tag inside a fenced code block opened at
column 0 in the owner's notes or a role's mission is now kept as written instead of escaped, and
`repositoryChecks` exposes the checks the rendered files run.
