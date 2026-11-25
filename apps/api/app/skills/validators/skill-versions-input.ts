import vine from '@vinejs/vine'
import { CODE_REVIEW_LOCALES } from '#app/code-reviews/constants/code-review'
import { llmCallFields } from '#app/llm/validators/llm-input'
import { SKILL_OVERRIDE_REASON } from '#app/skills/constants/skill-scan'
import {
  SKILL_VERSION_DECISIONS,
  SKILL_VERSION_STATUSES,
} from '#app/skills/constants/skill-version'

const slug = () => vine.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

/**
 * `GET /admin/skill-versions`: one status (pending by default), or every copy of one `skill`,
 * paginated.
 */
export const listSkillVersionsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
    status: vine.enum(SKILL_VERSION_STATUSES).optional(),
    skill: slug().optional(),
  }),
)

/** `POST /admin/skill-versions`: copy this skill's files now. */
export const captureSkillVersionInput = vine.create(vine.object({ slug: slug() }))

/**
 * `PATCH /admin/skill-versions/:id`: the admin's decision and, only to approve a copy despite
 * its `approvalProblem`, why.
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

/**
 * `POST /admin/skill-versions/:id/model-review`: the admin's provider and its key, used for this
 * call only, and the language of the answer. The browser sends nothing of the copy: the server
 * reads it.
 */
export const modelReviewSkillVersionInput = vine.create(
  vine.object({ ...llmCallFields(), locale: vine.enum(CODE_REVIEW_LOCALES) }),
)
