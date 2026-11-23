---
"@coreloom-uml/api": minor
---

Coding agents now read a project's requirements and decisions. The MCP server lists them (`list_requirements`, and `list_decisions` with the options weighed, the one chosen and its consequences), and a generated AGENTS.md carries the requirements and the accepted decisions in its Project section, telling the agent to keep to them and to ask before a change that goes against one. Agent conventions show as out of date when a decision is accepted or replaced since the last generation. Behind the `design-records` flag.
