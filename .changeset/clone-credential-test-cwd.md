---
"@coreloom-uml/api": patch
---

The clone credential tests run their git probe outside any repository, so a CI checkout's own
header no longer reads as a credential the clone was given. Nothing in the product changes.
