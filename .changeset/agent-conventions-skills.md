---
"@coreloom-uml/api": minor
"@coreloom-uml/cli": patch
---

Agent conventions now suggest skills. Each generation lists up to 5 third-party skills that fit
the answers and up to 3 that go against them, with the reasons, from a catalog of 8 hand-checked
Agent Skills pinned to a tag or a commit. The generation screen shows them as links, marked as
third-party resources not checked by Coreloom, and `coreloom-uml pull` prints the compatible ones.
