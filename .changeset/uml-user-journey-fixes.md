---
'@coreloom-uml/web': patch
---

UML fixes from coreloom-ui:

- Lines no longer blink or vanish while a box is dragged.
- A name with brackets, such as "Order (v2)", no longer turns a PlantUML diagram into a use case diagram and wipes it out.
- "#42" in a PlantUML name, note or transition stays in the text instead of being read as a colour.
- The ER template reads in PlantUML: an entity without attributes, and an entity's quoted name.
- Mermaid flowchart text with brackets, braces or a pipe reads; quotes in Mermaid class and ER names show as quotes, not `#quot;`.
- After Add > Note, focus goes to the note's text.
- A Mermaid activity diagram no longer offers Note, which Mermaid can't keep.
