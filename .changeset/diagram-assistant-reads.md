---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

The diagram assistant now reads before it draws: when a request about an architecture's views needs it, it first reads the project's repository and its history, its code maps and their conformance, and the conversation's files, then draws or changes the views from what it read rather than from a README. What it read, and the files it opened, show in the conversation. A request about the views alone reads nothing. Behind the `assistant-actions` flag; the repository needs `assistant-repository` and `code-maps` too.
