---
"@coreloom-uml/api": minor
---

Computed skill affinities. The skill tagger reads in fp32 (2.4 GB to download, 4.8 GB of memory at
most in a first run, batches of 2, `mem_limit: 6g`)
and, after the tags, gives each suggestable skill and each ready-made rule a search vector,
scores every pair by cosine, finds the near duplicates and proposes pairs for the admin to review.
Behind the `computed-skill-affinities` flag, a generation suggests the skills whose cosine with a
rule held reaches 0.656, or that the admin accepted, and no longer suggests a skill for a shared
tag alone. A new skill no longer needs a tag or an affinity to be suggestable, and the found
skills come in catalog order instead of by installs. `node ace skills:classify` queues a run
instead of loading a second model.
