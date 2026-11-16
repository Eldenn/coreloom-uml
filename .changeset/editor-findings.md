---
"@coreloom-uml/web": minor
---

Conformance findings in the architecture editor, behind the `code-maps` flag. When the newest
review of the project has looked at the open view, its elements carry the review's badges (worst
finding, open count) and a "Findings" button with the number still open appears in the toolbar.
The button, or a badge, opens a panel docked beside the workspace like the simulation: the
findings as cards, narrowed to the element whose badge was pressed, to mark done, dismiss or open
again, with a link to the review in the Code tab. "Show in diagram" outlines the element on the
drawing. The Code tab and the editor share the same finding list. Needs `DiagramWorkspace`
annotations from coreloom-ui.
