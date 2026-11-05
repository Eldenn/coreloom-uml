import vine from '@vinejs/vine'
import {
  DIAGRAM_FORMATS,
  DIAGRAM_KINDS,
  DIAGRAM_TITLE_MAX_LENGTH,
} from '#app/diagrams/constants/diagram'

const titleInput = () => vine.string().trim().minLength(1).maxLength(DIAGRAM_TITLE_MAX_LENGTH)

/** `POST /architectures/:id/diagrams` — appended after the last diagram, empty. */
export const createDiagramInput = vine.create(
  vine.object({
    title: titleInput(),
    kind: vine.enum(DIAGRAM_KINDS),
  }),
)

/**
 * `PATCH /architectures/:id/diagrams/:diagramId`. Saving `content` must name
 * the `version` it was based on; a stale version is a 409 unless `force`.
 * The content's own `kind` must be one of DIAGRAM_KINDS and becomes the
 * diagram's kind.
 */
export const updateDiagramInput = vine.create(
  vine.object({
    title: titleInput().optional(),
    format: vine.enum(DIAGRAM_FORMATS).optional(),
    content: vine
      .object({ kind: vine.enum(DIAGRAM_KINDS) })
      .allowUnknownProperties()
      .optional(),
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
