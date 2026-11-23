import vine from '@vinejs/vine'
import { DECISION_LIMITS, DECISION_STATUSES } from '#app/decisions/constants/decision'

const titleInput = () => vine.string().trim().minLength(1).maxLength(DECISION_LIMITS.titleLength)
const textInput = () => vine.string().trim().maxLength(DECISION_LIMITS.textLength).nullable()
const optionTextInput = () =>
  vine.string().trim().maxLength(DECISION_LIMITS.optionTextLength).nullable()
const optionsInput = () =>
  vine
    .array(
      vine.object({
        name: vine.string().trim().minLength(1).maxLength(DECISION_LIMITS.optionNameLength),
        pros: optionTextInput().optional(),
        cons: optionTextInput().optional(),
      }),
    )
    .minLength(1)
    .maxLength(DECISION_LIMITS.options)
const chosenInput = () =>
  vine.string().trim().minLength(1).maxLength(DECISION_LIMITS.optionNameLength).nullable()
const idInput = () => vine.number().withoutDecimals().min(1)
const idsInput = () => vine.array(idInput()).maxLength(DECISION_LIMITS.links).distinct()

/** `POST /projects/:id/decisions` — `proposed` unless a status is given. */
export const createDecisionInput = vine.create(
  vine.object({
    title: titleInput(),
    context: textInput().optional(),
    options: optionsInput(),
    chosen: chosenInput().optional(),
    consequences: textInput().optional(),
    status: vine.enum(DECISION_STATUSES).optional(),
    supersededById: idInput().nullable().optional(),
    requirementIds: idsInput().optional(),
    diagramIds: idsInput().optional(),
  }),
)

/**
 * `PATCH /decisions/:id` — omitted fields are left as-is; `requirementIds` and `diagramIds`
 * replace the whole set when given.
 */
export const updateDecisionInput = vine.create(
  vine.object({
    title: titleInput().optional(),
    context: textInput().optional(),
    options: optionsInput().optional(),
    chosen: chosenInput().optional(),
    consequences: textInput().optional(),
    status: vine.enum(DECISION_STATUSES).optional(),
    supersededById: idInput().nullable().optional(),
    requirementIds: idsInput().optional(),
    diagramIds: idsInput().optional(),
  }),
)

/** `GET /projects/:id/decisions` query params. */
export const listDecisionsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
  }),
)
