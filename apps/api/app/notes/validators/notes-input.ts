import vine from '@vinejs/vine'

const titleInput = () => vine.string().trim().minLength(1).maxLength(255)
const bodyInput = () => vine.string().trim().maxLength(10_000)

/** `POST /notes` — both fields required. */
export const createNoteInput = vine.create(
  vine.object({
    title: titleInput(),
    body: bodyInput(),
  }),
)

/** `PATCH /notes/:id` — every field optional; omitted fields are left as-is. */
export const updateNoteInput = vine.create(
  vine.object({
    title: titleInput().optional(),
    body: bodyInput().optional(),
  }),
)

/**
 * `GET /notes` query params. Non-positive values are a clean 422 here; the
 * upper bound (`PAGINATION_MAX_PER_PAGE`) is clamped by the pagination helper
 * so over-large requests succeed with a capped page instead of failing.
 */
export const listNotesInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
  }),
)
