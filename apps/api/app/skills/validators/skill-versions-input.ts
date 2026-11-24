import vine from '@vinejs/vine'
import { SKILL_OVERRIDE_REASON } from '#app/skills/constants/skill-scan'
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

/**
 * `PATCH /admin/skill-versions/:id`: the admin's decision and, only to approve a copy SkillSpector
 * recommends not installing, why.
 */
export const reviewSkillVersionInput = vine.create(
  vine.object({
    status: vine.enum(SKILL_VERSION_DECISIONS),
    overrideReason: vine
      .string()
      .trim()
      .minLength(SKILL_OVERRIDE_REASON.minLength)
      .maxLength(SKILL_OVERRIDE_REASON.maxLength)
      .optional(),
  }),
)
