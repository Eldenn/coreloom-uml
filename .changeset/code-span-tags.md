---
"@coreloom-uml/api": patch
---

A tag written inside inline code (between backticks, opened and closed on one line) in the owner's
notes or a role's mission is now kept as written in the generated files, instead of showing a
stray backslash such as `\<file>`. Tags outside code, or where the code span is ambiguous, are
still escaped.
