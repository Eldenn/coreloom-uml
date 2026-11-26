---
'@coreloom-uml/api': minor
'@coreloom-uml/web': minor
---

The skills catalog reads several sources: skills.sh by default and the GitHub repositories of
trusted publishers, which the administrator adds, switches off or removes from the Skills screen's
**Sources** (`/admin/skill-sources`). A skill a trusted repository lists needs no installs or audit
to be suggested (a bad skills.sh audit still counts), its copy is scanned and approved like any
other, a source that fails no longer stops the others, and with skills.sh switched off its skills
keep their last figures. A skill's sheet says which sources found it.
