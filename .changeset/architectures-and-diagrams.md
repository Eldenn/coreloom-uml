---
"@coreloom-uml/api": minor
---

Architectures and their UML diagrams: create (with a first, empty diagram), list with search and a visibility filter (each row with its diagram count and first diagram as cover), rename, describe, duplicate as a private copy and delete. Diagrams are added, renamed, reordered and deleted (an architecture keeps at least one); saving a diagram's coreloom-ui UML JSON (up to 1 MB) names the version it was based on and gets a 409 when another tab saved in between.
