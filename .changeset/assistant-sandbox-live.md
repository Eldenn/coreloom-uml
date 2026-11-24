---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

The assistant's chat now shows what it is doing while it writes a reply: each tool it calls, as it
starts and ends, and for the repository sandbox what it asks of it (the file read, the text
searched, the commit shown, the command run) and what a command prints, as it comes. The API sends
it as `data-activity` parts of the streamed reply; it is shown live only and never stored, so it
is gone once the reply is. A file's text and the result of a tool that reads the account are still
never sent.
