---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Several agent conventions can be merged into new ones, and the ones merged stay as they are. `POST /agent-configs/merge` takes the configurations to merge and a name: ready-made rules, your own rules, notes, roles and tools add up, duplicates dropped, and the result is created outside any project, without a generation. What cannot be held together (the rules of a group, two different roles with one slug) is answered as `conflicts` and nothing is created until `choices` names, for each, the configuration whose version is kept. The Agent conventions page gains a Merge button that asks for those choices.
