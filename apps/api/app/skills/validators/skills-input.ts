import { DIAGRAM_KINDS, SKILL_TOPICS } from '@coreloom-uml/catalog'
import vine from '@vinejs/vine'
import {
  SKILL_RISK_LEVELS,
  SKILL_SORTS,
  SKILL_STATES,
  SKILLS_SEARCH_MAX_LENGTH,
} from '#app/skills/constants/skill'

/**
 * `GET /skills` query params. A filter given several times (`?topic=react&topic=testing`)
 * matches any of its values; different filters must all match.
 */
export const listSkillsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
    search: vine.string().trim().maxLength(SKILLS_SEARCH_MAX_LENGTH).optional(),
    topic: vine.array(vine.enum(SKILL_TOPICS)).parse(toArray).optional(),
    diagramKind: vine.array(vine.enum(DIAGRAM_KINDS)).parse(toArray).optional(),
    state: vine.array(vine.enum(SKILL_STATES)).parse(toArray).optional(),
    risk: vine.array(vine.enum(SKILL_RISK_LEVELS)).parse(toArray).optional(),
    sort: vine.enum(SKILL_SORTS).optional(),
  }),
)

/** A single query value arrives as a string, a repeated one as an array. */
function toArray(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  return Array.isArray(value) ? value : [value]
}
