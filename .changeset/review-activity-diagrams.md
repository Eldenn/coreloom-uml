---
'@coreloom-uml/api': minor
'@coreloom-uml/web': minor
'@coreloom-uml/cli': patch
---

Activity diagrams can be compared with the code. Their actions are linked to functions (proposed
by name, or linked by hand in the Code tab; a diagram drawn from a code map already has its links)
and their partitions to classes, files or folders. The conformance review then reads the source of
those functions and checks the order of the actions, the decisions and their guards. An action
described in prose that matches nothing is not reported.
