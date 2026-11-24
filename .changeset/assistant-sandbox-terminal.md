---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

The owner gets a terminal of their own in the sandbox where the assistant reads a conversation's
repository: « Sandbox terminal » in the chat opens it, and each command is run there the way a
command of the assistant is (from the clone, 30 seconds at most, its output capped, no network).
It uses the sandbox as the assistant left it and never clones: before the assistant has opened a
repository in the conversation, the terminal says so. Nothing typed or printed is stored.
