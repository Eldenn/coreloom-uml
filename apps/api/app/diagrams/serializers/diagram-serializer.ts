import type Diagram from '#app/diagrams/models/diagram'
import type { DiagramOutput } from '#app/diagrams/validators/diagrams-output'

export function serializeDiagram(diagram: Diagram): DiagramOutput {
  return {
    id: diagram.id,
    title: diagram.title,
    kind: diagram.kind,
    format: diagram.format,
    content: diagram.content,
    position: diagram.position,
    version: diagram.version,
    updatedAt: diagram.updatedAt.toISO() ?? '',
  }
}
