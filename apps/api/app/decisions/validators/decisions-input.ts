import vine from '@vinejs/vine'
import { POINTED_LABEL_MAX_LENGTH, POINTED_TYPES } from '#app/assistant/constants/assistant'
import {
  CODE_REVIEW_LOCALES,
  CODE_REVIEW_RESOLUTIONS,
} from '#app/code-reviews/constants/code-review'
import {
  DECISION_LIMITS,
  DECISION_STATUSES,
  DecisionOrigin,
} from '#app/decisions/constants/decision'
import { llmCallFields } from '#app/llm/validators/llm-input'

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
/** Parts of views, named as the assistant's `pointed` parts are: a view, a type and one line. */
const partsInput = () =>
  vine
    .array(
      vine.object({
        diagramId: idInput(),
        type: vine.enum(POINTED_TYPES),
        label: vine.string().trim().minLength(1).maxLength(POINTED_LABEL_MAX_LENGTH),
      }),
    )
    .maxLength(DECISION_LIMITS.parts)

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
    parts: partsInput().optional(),
  }),
)

/**
 * `PATCH /decisions/:id` — omitted fields are left as-is; `requirementIds`, `diagramIds` and
 * `parts` replace the whole set when given. `origin: owner` keeps a coding agent's proposal: it
 * becomes the owner's and counts from then on. Nothing sets `agent` back.
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
    parts: partsInput().optional(),
    origin: vine.enum([DecisionOrigin.Owner]).optional(),
  }),
)

/** `GET /projects/:id/decisions` query params. */
export const listDecisionsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
  }),
)

/**
 * `POST /architectures/:id/design-review`: the owner's model and the language of the comments.
 * The browser sends nothing of the design: the server reads it.
 */
export const reviewDesignInput = vine.create(
  vine.object({ ...llmCallFields(), locale: vine.enum(CODE_REVIEW_LOCALES) }),
)

/** `PATCH /design-findings/:id` */
export const updateDesignFindingInput = vine.create(
  vine.object({ resolution: vine.enum(CODE_REVIEW_RESOLUTIONS) }),
)
