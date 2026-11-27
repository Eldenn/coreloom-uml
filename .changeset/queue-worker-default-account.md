---
"@coreloom-uml/api": patch
---

The staging and production compose files no longer give `DEFAULT_ACCOUNT_*` to `queue-worker`, since no job reads them: only `migrate` and `api` get them.
