---
'@coreloom-uml/api': minor
---

The API checks and converts diagrams with `@coreloom-uml/uml`. Every save of a diagram's content
is checked against the UML schema, and a 422 lists each problem (`error.problems`: line, severity,
code, text) instead of storing something the editor can't read. A diagram can be read and written
as Mermaid, PlantUML or JSON text with `GET` / `PUT /architectures/:id/diagrams/:diagramId/source`
(`?format=`; the `PUT` names the `version` it was based on, like a content save), created from a
text with `source` (and an optional `format`) on `POST /architectures/:id/diagrams`, and checked
without being stored with `POST /uml/validate`. A new diagram's response now carries its format
and version.
