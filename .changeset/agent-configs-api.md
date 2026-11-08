---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Agent conventions API: a project can hold one agent configuration (questionnaires, answers,
accepted rules, notes, target tools) under `/projects/:id/agent-config`, render it into
immutable generations (AGENTS.md and pointer files, with recommendations) and tell what a change
would alter (`impact`). The catalog questionnaires are served by `GET /questionnaires`, and
projects now report `agentConfigCount`. API keys reach these routes; the screens come next.
