import vine from '@vinejs/vine'
import {
  ARCHITECTURE_DESCRIPTION_MAX_LENGTH,
  ARCHITECTURE_TITLE_MAX_LENGTH,
} from '#app/architectures/constants/limits'
import { ARCHITECTURE_VISIBILITIES } from '#app/architectures/constants/visibility'
import { DIAGRAM_KINDS, DIAGRAM_TITLE_MAX_LENGTH } from '#app/diagrams/constants/diagram'

const titleInput = () => vine.string().trim().minLength(1).maxLength(ARCHITECTURE_TITLE_MAX_LENGTH)
const descriptionInput = () =>
  vine.string().trim().maxLength(ARCHITECTURE_DESCRIPTION_MAX_LENGTH).nullable()

/** `POST /architectures` — created with one empty diagram (RM-11). */
export const createArchitectureInput = vine.create(
  vine.object({
    title: titleInput(),
    description: descriptionInput().optional(),
    diagram: vine
      .object({
        title: vine.string().trim().minLength(1).maxLength(DIAGRAM_TITLE_MAX_LENGTH).optional(),
        kind: vine.enum(DIAGRAM_KINDS),
      })
      .optional(),
  }),
)

/** `PATCH /architectures/:id` — omitted fields are left as-is. */
export const updateArchitectureInput = vine.create(
  vine.object({
    title: titleInput().optional(),
    description: descriptionInput().optional(),
  }),
)

/** `GET /architectures` query params. */
export const listArchitecturesInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
    search: vine.string().trim().maxLength(ARCHITECTURE_TITLE_MAX_LENGTH).optional(),
    visibility: vine.enum(ARCHITECTURE_VISIBILITIES).optional(),
  }),
)
