---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

The web research for agent conventions now works with a connected Claude subscription. The
`claude` binary still gets no tool: at each step it names which page to read or command to run,
and the server runs it in the sandbox. A research is slower this way than with an API key.
