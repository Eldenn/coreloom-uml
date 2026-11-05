---
"@coreloom-uml/api": patch
---

The local Docker stack creates the dev and test databases on every `docker compose up` when they
are missing, including on a Postgres volume that already exists.
