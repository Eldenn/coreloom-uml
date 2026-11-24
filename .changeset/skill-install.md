---
'@coreloom-uml/api': minor
'@coreloom-uml/web': minor
'@coreloom-uml/cli': minor
---

Skills the admin approved can be installed. `GET /skills/:slug/copy` serves the newest approved
copy of an active, eligible skill (never a pending one, never from GitHub), and the new
`coreloom-uml skills add <id>... --target <tools>` writes it into each tool's skills folder
(`.agents/skills`, `.claude/skills` or `.github/skills`), asking before it replaces or deletes a
file there. `pull` and the generation page show each skill's id.
