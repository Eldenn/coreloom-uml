---
'@coreloom-uml/api': minor
'@coreloom-uml/web': minor
---

The conformance review can read the source code. When a review is started with "Read the source
code of class and sequence diagrams" (checked by default), the files of those diagrams are read on
GitHub at the map's commit and sent to your model with the map, so it also checks the order of
calls, conditions, loops and error paths. Nothing of the code is kept; each diagram of the review
says how many files were read, or why none was. The browser no longer sends code excerpts itself.
