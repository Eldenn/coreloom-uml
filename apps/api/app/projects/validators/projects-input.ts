import vine from '@vinejs/vine'
import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
} from '#app/projects/constants/limits'

const nameInput = () => vine.string().trim().minLength(1).maxLength(PROJECT_NAME_MAX_LENGTH)
const descriptionInput = () =>
  vine.string().trim().maxLength(PROJECT_DESCRIPTION_MAX_LENGTH).nullable()

/** `POST /projects` */
export const createProjectInput = vine.create(
  vine.object({
    name: nameInput(),
    description: descriptionInput().optional(),
  }),
)

/** `PATCH /projects/:id` — omitted fields are left as-is. */
export const updateProjectInput = vine.create(
  vine.object({
    name: nameInput().optional(),
    description: descriptionInput().optional(),
  }),
)

/** `GET /projects` query params. */
export const listProjectsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
    search: vine.string().trim().maxLength(PROJECT_NAME_MAX_LENGTH).optional(),
  }),
)
