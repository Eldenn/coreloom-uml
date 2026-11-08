---
'@coreloom-uml/web': minor
---

The UML model and its Mermaid, PlantUML and JSON conversion move to a shared `@coreloom-uml/uml`
package, which the API can use as well: it adds `validateDiagram`, `parseDiagramText`,
`formatDiagramText` and `detectDiagramTextFormat`. The web app reads it from there; diagrams behave
as before.
