---
"@coreloom-uml/api": patch
"@coreloom-uml/cli": patch
---

`coreloom-uml pull` installs the copy of each held skill that the generation recorded, the one its page shows, instead of the newest approved one; `GET /skills/:slug/copy` takes `version` for it.
