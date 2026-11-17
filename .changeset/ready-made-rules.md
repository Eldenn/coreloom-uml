---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Agent conventions: ready-made rules replace the questionnaires. The catalog's rules are browsed
in a library (by pack, searched, filtered) and accepted one by one, like ready-made roles; the
ones that also produce a settings file, a Git hook, the CI workflow or the container are marked.
There is nothing left to answer: the questionnaire screen, the stored answers and their "more
details" notes are removed (stored answers are deleted by the migration), `GET /questionnaires`
becomes `GET /rule-packs` and `PUT /agent-configs/:id/answers` becomes
`PUT /agent-configs/:id/ready-rules/:slot`. Importing an existing conventions file now proposes
ready-made rules to accept, and rule proposals read the diagrams or pasted feedback.
