---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

The sandbox terminal behaves like one, and a conversation's sandbox stays awake between uses.

- A conversation's repository sandbox stays awake five minutes after its last use (a message or a
  command of the terminal), then pauses by itself: the next use within that time waits for no
  resume. A sandbox made before this change is cloned again the first time it is used past that
  delay.
- The terminal keeps the folder you `cd` into from one command to the next and shows it in its
  prompt (a variable is not kept), and Ctrl+C stops the command in the sandbox.
- « Sandbox terminal » is shown only once the assistant has opened a repository in the
  conversation.
- The terminal has its own limit, 60 commands a minute.
- Fixed: every route of an assistant conversation counted in the limit of calls to a model (10 a
  minute), and a message counted twice. Only the routes that call a model count now, once.
