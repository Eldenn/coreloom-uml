---
'@coreloom-uml/web': patch
---

Diagram editor fixes from coreloom-ui:

- Leaving a diagram's full screen (Escape or the button) puts back the view from before, instead of leaving the diagram off to the side and out of sight.
- Boxes dragged in a Mermaid or PlantUML diagram keep their place after switching views, reloading or sharing: their positions are now saved, in a comment line of the text (`%% coreloom-layout {…}`).
- Fit to view works every time, including after dragging a box out of sight.
