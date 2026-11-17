---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Proposed diagrams for a code map, behind the `code-maps` flag (drawing also behind
`diagram-assistant`). When a ready map is first shown with an LLM provider set, the user's own
model reads an outline of the map (folders and their imports, the most linked classes, where
processes start: entry points, or functions nothing in the repository calls; never the code) and
proposes up to 8 views: package, component, class, sequence or activity diagrams. They are listed
in the Code tab's new "Proposed diagrams" view, which can ask again. Each one is drawn on request
as a new view in a new assistant conversation, accepted there with its links to the code, or set
aside. The "Undocumented processes" view now says when no entry point was recognised, and every
reader of a stored map detects its entry points again with the current rules.
