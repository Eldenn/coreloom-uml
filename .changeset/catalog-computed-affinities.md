---
"@coreloom-uml/api": patch
---

The catalog can match skills from computed affinities: `matchSkills` takes the cosines of skills
with the rules held, the admin's decisions on pairs (accepted, rejected, against) and the near
duplicates, and then no longer makes a skill compatible by a shared tag alone. 162 ready-made rules
that say a project does not use or must not add something are marked `noAutomaticSuggestion`: they
get no computed affinity, only written or accepted ones. Nothing uses the computed mode yet;
`CATALOG_VERSION` is 0.20.0.
