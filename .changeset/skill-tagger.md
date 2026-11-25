---
'@coreloom-uml/api': minor
'@coreloom-uml/web': minor
---

Skills are tagged by a classifier that learns from tags set by hand: an embedding model
(Qwen3-Embedding-0.6B, pinned) reads each skill once, and a regression fitted on every label tags
the catalog, in a new `skill-tagger` worker. It starts from 224 skills tagged by hand, and the
admin sets a skill's tags from its sheet: they replace the tagger's at once, and the tagger learns
from them within a minute. Its tags replace those of the search queries, which stay while a skill
is not tagged; a name or description naming React, TypeScript or a mobile stack keeps that narrow
tag. A skill not read on GitHub takes the description of its skills.sh page, so it can be tagged.
