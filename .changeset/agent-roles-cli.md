---
"@coreloom-uml/cli": minor
---

`pull` manages role files whole: it replaces a role file instead of adding a second copy of it, and
deletes it once the role is gone. A role file edited by hand is only replaced or deleted after a
confirmation. `status` and `check` compare role files whole and report `file edited`.
