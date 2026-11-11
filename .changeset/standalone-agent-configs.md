---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
"@coreloom-uml/cli": minor
---

Agent conventions no longer have to live in a project, like architectures. Each configuration has a name and is addressed by its own id under `/agent-configs` (`GET`/`POST /agent-configs`, `GET`/`PATCH`/`DELETE /agent-configs/:id` and its answers, rules, generations, proposals and imports); `PATCH { projectId }` moves one into a project (still at most one per project, 409 otherwise) or out of it with `null`. Outside a project, a configuration reads from the account's architectures outside any project. The app gains an Agent conventions page listing them all; the project tab keeps working. The CLI pulls with `--config <id>`; `--project <id>` and manifests written by earlier versions keep working through `GET /projects/:id/agent-config/generations/latest`.
