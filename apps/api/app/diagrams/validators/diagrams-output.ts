import type { DiagramFormat, DiagramKind } from '#app/diagrams/constants/diagram'
import type { DiagramContent } from '#app/diagrams/models/diagram'

/** JSON shape of a diagram, as sent to its owner and to share-link visitors. */
export type DiagramOutput = {
  id: number
  title: string
  kind: DiagramKind
  format: DiagramFormat
  /** The coreloom-ui UML JSON (layout included), or null while the diagram is empty. */
  content: DiagramContent | null
  position: number
  version: number
  updatedAt: string
}
