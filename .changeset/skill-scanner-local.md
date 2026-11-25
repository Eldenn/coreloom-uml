---
'@coreloom-uml/api': patch
---

The local skill scanner reaches Postgres (no TLS against the development database), and `queue:scan` listens on its own health port so it starts next to `queue:work`.
