import type { UmlProblem } from '@coreloom-uml/uml'
import type { DiagramFormat, DiagramKind } from '#app/diagrams/constants/diagram'
import type { DiagramContent } from '#app/diagrams/models/diagram'

/** JSON shape of a diagram, as sent to its owner and to share-link visitors. */
export type DiagramOutput = {
  id: number
  title: string
  kind: DiagramKind
  format: DiagramFormat
  /** The UML JSON (layout included), or null while the diagram is empty. */
  content: DiagramContent | null
  position: number
  version: number
  updatedAt: string
}

/** A diagram as text, from `GET /architectures/:id/diagrams/:diagramId/source`. */
export type DiagramSourceOutput = {
  id: number
  kind: DiagramKind
  format: DiagramFormat
  /** The diagram written in `format`; an empty string while the diagram is empty. */
  source: string
  version: number
}

/** What `POST /uml/validate` found: the diagram it read, or null, and why. */
export type DiagramValidationOutput = {
  valid: boolean
  /** The format the text was read as (`json` for `content`); null when it couldn't be told. */
  format: DiagramFormat | null
  kind: DiagramKind | null
  /** The diagram as stored JSON, when it is valid. */
  diagram: DiagramContent | null
  problems: UmlProblem[]
}
