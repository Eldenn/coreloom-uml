---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Any diagram on request, drawn from a code map, behind the `code-maps` and `diagram-assistant`
flags. "Ask the assistant" on a project's Code tab opens the assistant of one of its architectures
with "Draw from the code" switched on; the switch is also there whenever the architecture's project
has a ready map. With it on, a message is a request for one diagram in the user's own words: their
model first names the code the request is about, from the outline of the map (now with the
folders, classes, functions and methods whose name holds a word of the request), then draws that
part of the map. The view arrives in the conversation as a change to accept, with its links to the
code; when nothing matches, the assistant says so and draws nothing. Names, paths and links only,
never source code.
