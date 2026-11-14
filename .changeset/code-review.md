---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

Conformance review of a project's diagrams against its code map, behind the `code-maps` flag. A
new "Conformance review" view in the Code tab starts a review of the chosen package, component,
class, sequence and C4 diagrams; the browser then asks the user's own model about each diagram in
turn (`POST /code-reviews/:id/diagrams/:diagramId`, one call each, counted against the LLM limit,
the key used for that call only). The model reads the diagram, its links to the code, the
deterministic checks and the slice of the map around the linked places: names, paths and links,
never the code. Every finding must cite places it was given, or it is set aside. Findings are
stored with the review, shown as badges on the drawing and as cards with their evidence (linked
to the repository at the map's commit), and marked done, dismissed or open again. A project keeps
its ten newest reviews; a review outlives its map.
