---
"@coreloom-uml/cli": minor
"@coreloom-uml/api": patch
---

`coreloom-uml check` lets CI verify that a repository's agent conventions are applied and up to
date: it exits with 0 only when every managed block matches the latest generation, 2 when a block
was edited by hand, 3 when a newer generation exists and 4 when a block or its file is missing
(`--json` for a machine-readable answer). Each generation now also recommends the GitHub Actions
steps that run it with `CORELOOM_UML_API_KEY` from the secrets, followed by the project's own
checks (catalog 0.6.0).
