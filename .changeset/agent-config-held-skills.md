---
'@coreloom-uml/api': minor
'@coreloom-uml/web': minor
'@coreloom-uml/cli': minor
---

Agent conventions hold skills chosen freely among those with an approved copy, suggested or not:
an "Installed skills" card adds and removes them (`PUT /agent-configs/:id/skills`, the
`installable` filter of `GET /skills`), each generation records them, and `coreloom-uml pull`
installs their approved copies into the skills folders of the conventions' coding tools.
