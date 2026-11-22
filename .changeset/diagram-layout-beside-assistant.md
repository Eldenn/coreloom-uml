---
"@coreloom-uml/web": patch
---

Architecture page: with the assistant open, the diagram editor lays out on the width it is given
instead of the screen's, so it no longer spills to the right and the bottom. The list of views
moves into its « Views » sheet, the text goes above the drawing and the drawing is fitted again
when its box shrinks (coreloom-ui#81, ported by hand: the installed copies carry `highlighted`,
which coreloom-ui doesn't have yet).
