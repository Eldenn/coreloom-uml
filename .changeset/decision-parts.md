---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

A decision can name parts of the diagrams it shapes, not only whole diagrams: an element, a relation, a member or a step, each by its diagram and the one line that names it there (`parts` on `POST /projects/:id/decisions` and `PATCH /decisions/:id`, listed in a decision's output, in `list_decisions` and in the diagram assistant's prompt). The decision form lists the parts of the diagrams picked; the Design tab shows them next to their view and marks a part its view no longer has, which the design review reports too. The assistant's `add_decision` and `supersede_decision` can name parts, shown on their card.
