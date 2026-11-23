---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

A project now holds its requirements and its architecture decisions, in a new « Design » tab. A requirement is one sentence someone can check (a quality to reach or a constraint to keep), with the measure that says it is met when there is one. A decision keeps the question, the options weighed with what speaks for and against each, the one chosen, what it costs, and the requirements and diagrams it is about; a decision replaced by another one stays, marked as superseded. The assistant reads both before it draws a view of the project: it keeps to the accepted decisions and says so when a request goes against a requirement. Behind the `design-records` flag.
