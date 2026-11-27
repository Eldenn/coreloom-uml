---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

The admin reviews computed skill affinities. Behind `computed-skill-affinities`, the Skills page
has an « Affinities to review » tab: the pairs of a skill and a ready-made rule the search
proposed, the ones already suggested by themselves first, then the skills no written affinity ties
to a rule, then by cosine. Each is accepted, rejected or marked as going against, and a skill's
sheet lists its own pairs, decided or not, so a decision can be undone
(`GET`/`PATCH /admin/skill-affinity-reviews`). A generation whose rules no skill fits says so and
sends the owner to the skills they can pick themselves.
