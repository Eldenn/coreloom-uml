---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Undocumented processes proposed as new diagrams, behind the `code-maps` and `diagram-assistant`
flags. In the Code tab's "Undocumented processes" view, "Propose a diagram" asks the user's own
model to draw the calls followed from an entry point as a sequence (default) or activity diagram
(`POST /code-maps/:id/processes/propose`, one call, counted against the LLM limit, the key used
for that call only). The model reads names, paths and calls, never the code; the diagram is
checked against the schema with one repair call. The proposal lands in a new conversation of the
chosen architecture's assistant, which opens on it, to accept, reject or undo like any other
change. Accepting it stores the code places each element was drawn from as confirmed links, so
the process no longer shows as undocumented.
