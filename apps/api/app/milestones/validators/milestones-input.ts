import vine from '@vinejs/vine'
import { MILESTONE_NAME_MAX_LENGTH } from '#app/milestones/constants/milestone'

/** `POST /architectures/:id/milestones` */
export const createMilestoneInput = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(MILESTONE_NAME_MAX_LENGTH),
  }),
)

/** `GET /architectures/:id/milestones` query params. */
export const listMilestonesInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
  }),
)
