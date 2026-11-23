import vine from '@vinejs/vine'
import {
  REQUIREMENT_CATEGORIES,
  REQUIREMENT_LIMITS,
  REQUIREMENT_PRIORITIES,
} from '#app/requirements/constants/requirement'

const statementInput = () =>
  vine.string().trim().minLength(1).maxLength(REQUIREMENT_LIMITS.statementLength)
const measureInput = () =>
  vine.string().trim().maxLength(REQUIREMENT_LIMITS.measureLength).nullable()

/** `POST /projects/:id/requirements` */
export const createRequirementInput = vine.create(
  vine.object({
    category: vine.enum(REQUIREMENT_CATEGORIES),
    priority: vine.enum(REQUIREMENT_PRIORITIES),
    statement: statementInput(),
    measure: measureInput().optional(),
  }),
)

/** `PATCH /requirements/:id` — omitted fields are left as-is. */
export const updateRequirementInput = vine.create(
  vine.object({
    category: vine.enum(REQUIREMENT_CATEGORIES).optional(),
    priority: vine.enum(REQUIREMENT_PRIORITIES).optional(),
    statement: statementInput().optional(),
    measure: measureInput().optional(),
  }),
)

/** `GET /projects/:id/requirements` query params. */
export const listRequirementsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
  }),
)
