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
const projectIdInput = () => vine.number().withoutDecimals().min(1)

/**
 * `POST /architectures` — created with one empty diagram (RM-11), in
 * `projectId` (one of the caller's projects), or in their default project
 * when it is omitted.
 */
export const createArchitectureInput = vine.create(
  vine.object({
    projectId: projectIdInput().optional(),
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

/** `PATCH /architectures/:id` — omitted fields are left as-is; `projectId` moves it. */
export const updateArchitectureInput = vine.create(
  vine.object({
    projectId: projectIdInput().optional(),
    title: titleInput().optional(),
    description: descriptionInput().optional(),
  }),
)

/** `GET /architectures` query params. */
export const listArchitecturesInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
    projectId: projectIdInput().optional(),
    search: vine.string().trim().maxLength(ARCHITECTURE_TITLE_MAX_LENGTH).optional(),
    visibility: vine.enum(ARCHITECTURE_VISIBILITIES).optional(),
  }),
)
