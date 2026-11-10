---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Rule proposals from diagrams: `POST /projects/:id/agent-config/proposals` takes
`from: 'diagrams'` (and optionally `diagramIds`) to have your model turn the project's diagrams,
sent as PlantUML without their layout, into architecture rules. Diagrams that do not fit what the
model can read are left out whole and listed in `skipped`. The configuration lists the project's
diagrams with content (`diagrams`), and the proposals panel gets a "My notes / My diagrams"
switch with a diagram picker. The rendered file gains an `Architecture` section, right after
`Project` (catalog 0.5.0).
