import vine from '@vinejs/vine'
import {
  DIAGRAM_FORMATS,
  DIAGRAM_KINDS,
  DIAGRAM_SOURCE_MAX_LENGTH,
  DIAGRAM_TITLE_MAX_LENGTH,
} from '#app/diagrams/constants/diagram'

const titleInput = () => vine.string().trim().minLength(1).maxLength(DIAGRAM_TITLE_MAX_LENGTH)
/** A diagram as text: kept as typed (no trim), so problem line numbers match the input. */
const sourceInput = () => vine.string().maxLength(DIAGRAM_SOURCE_MAX_LENGTH)

/**
 * `POST /architectures/:id/diagrams` — appended after the last diagram. Empty
 * unless `source` gives its text (Mermaid, PlantUML or JSON, in `format` or
 * the one the text announces); the kind is then read from the text, and a
 * `kind` sent with it must match.
 */
export const createDiagramInput = vine.create(
  vine.object({
    title: titleInput(),
    kind: vine.enum(DIAGRAM_KINDS).optional().requiredIfMissing('source'),
    source: sourceInput().optional(),
    format: vine.enum(DIAGRAM_FORMATS).optional(),
  }),
)

/**
 * `PATCH /architectures/:id/diagrams/:diagramId`. Saving `content` must name
 * the `version` it was based on; a stale version is a 409 unless `force`.
 * The content must match the UML schema of `@coreloom-uml/uml` (a 422 lists
 * the problems otherwise), and its own `kind` becomes the diagram's kind.
 */
export const updateDiagramInput = vine.create(
  vine.object({
    title: titleInput().optional(),
    format: vine.enum(DIAGRAM_FORMATS).optional(),
    // The shape is checked by `validateDiagram` (the shared UML schema), which
    // lists every problem: Vine only takes the value through.
    content: vine.any().optional(),
    version: vine.number().withoutDecimals().min(1).optional().requiredIfExists('content'),
    force: vine.boolean().optional(),
  }),
)

/** `PUT /architectures/:id/diagrams/order` — every diagram id, in the new order. */
export const reorderDiagramsInput = vine.create(
  vine.object({
    ids: vine.array(vine.number().withoutDecimals().min(1)).minLength(1).distinct(),
  }),
)

/** `GET /architectures/:id/diagrams/:diagramId/source` — the diagram's own format by default. */
export const showDiagramSourceInput = vine.create(
  vine.object({
    format: vine.enum(DIAGRAM_FORMATS).optional(),
  }),
)

/**
 * `PUT /architectures/:id/diagrams/:diagramId/source` — replaces the content
 * with the diagram read from `source`. Like a content save, it names the
 * `version` it was based on; a stale version is a 409 unless `force`.
 */
export const updateDiagramSourceInput = vine.create(
  vine.object({
    source: sourceInput(),
    format: vine.enum(DIAGRAM_FORMATS).optional(),
    version: vine.number().withoutDecimals().min(1),
    force: vine.boolean().optional(),
  }),
)

/**
 * `POST /uml/validate` — a diagram as text (`source`, with an optional
 * `format`) or as JSON (`content`), checked without being stored.
 */
export const validateDiagramInput = vine.create(
  vine.object({
    source: sourceInput().optional().requiredIfMissing('content'),
    format: vine.enum(DIAGRAM_FORMATS).optional(),
    content: vine.any().optional(),
  }),
)
