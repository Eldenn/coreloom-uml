import vine from '@vinejs/vine'
import {
  SKILL_VERSION_DECISIONS,
  SKILL_VERSION_STATUSES,
} from '#app/skills/constants/skill-version'

/** `GET /admin/skill-versions`: one status (pending by default), paginated. */
export const listSkillVersionsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
    status: vine.enum(SKILL_VERSION_STATUSES).optional(),
  }),
)

/** `PATCH /admin/skill-versions/:id`: the admin's decision. */
export const reviewSkillVersionInput = vine.create(
  vine.object({ status: vine.enum(SKILL_VERSION_DECISIONS) }),
)
