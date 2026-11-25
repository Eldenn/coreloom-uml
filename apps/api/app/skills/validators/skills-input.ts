import { DIAGRAM_KINDS, TOPICS } from '@coreloom-uml/catalog'
import vine from '@vinejs/vine'
import {
  SKILL_BLOCK_REASON_MAX_LENGTH,
  SKILL_RISK_LEVELS,
  SKILL_SORTS,
  SKILL_STATES,
  SKILLS_SEARCH_MAX_LENGTH,
} from '#app/skills/constants/skill'
import { SKILL_TOPIC_LIMITS } from '#app/skills/constants/skill-topics'
import { SKILL_COPY_STATES } from '#app/skills/constants/skill-version'

/**
 * `GET /skills` query params. A filter given several times (`?topic=react&topic=testing`)
 * matches any of its values; different filters must all match.
 */
export const listSkillsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
    search: vine.string().trim().maxLength(SKILLS_SEARCH_MAX_LENGTH).optional(),
    topic: vine.array(vine.enum(TOPICS)).parse(toArray).optional(),
    diagramKind: vine.array(vine.enum(DIAGRAM_KINDS)).parse(toArray).optional(),
    state: vine.array(vine.enum(SKILL_STATES)).parse(toArray).optional(),
    risk: vine.array(vine.enum(SKILL_RISK_LEVELS)).parse(toArray).optional(),
    /** Read for the admin only (see `SkillsController.index`). */
    copy: vine.array(vine.enum(SKILL_COPY_STATES)).parse(toArray).optional(),
    sort: vine.enum(SKILL_SORTS).optional(),
  }),
)

/** A single query value arrives as a string, a repeated one as an array. */
function toArray(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  return Array.isArray(value) ? value : [value]
}

/** `PATCH /admin/skills/:slug`: stop suggesting this skill (with why), or suggest it again. */
export const blockSkillInput = vine.create(
  vine.object({
    blocked: vine.boolean(),
    reason: vine.string().trim().minLength(1).maxLength(SKILL_BLOCK_REASON_MAX_LENGTH).optional(),
  }),
)

/**
 * `PATCH /admin/skills/:slug/topics`: the skill's tags as the admin sets them, the main one first
 * (the tagger learns from it), or `null` to give them back to the tagger.
 */
export const reviewSkillTopicsInput = vine.create(
  vine.object({
    topics: vine
      .array(vine.enum(TOPICS))
      .minLength(1)
      .maxLength(SKILL_TOPIC_LIMITS.maxTopics)
      .distinct()
      .nullable(),
  }),
)
