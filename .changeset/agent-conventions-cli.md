---
"@coreloom-uml/cli": minor
---

First release of `@coreloom-uml/cli`: `npx @coreloom-uml/cli pull --api-url <url> --project <id>`
writes a project's latest agent conventions generation (AGENTS.md and pointer files) into the
current repository, inside a managed block, leaving the rest of each file alone. `status` compares
the local blocks with the last pull and checks for a newer generation; `config set-key` stores an
API key read on standard input.
