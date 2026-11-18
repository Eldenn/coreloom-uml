import vine from '@vinejs/vine'
import {
  CODE_REVIEW_LIMITS,
  CODE_REVIEW_LOCALES,
  CODE_REVIEW_RESOLUTIONS,
} from '#app/code-reviews/constants/code-review'
import { llmCallFields } from '#app/llm/validators/llm-input'

const idInput = () => vine.number().withoutDecimals().min(1)

/**
 * `POST /code-reviews`: the diagrams of the map's project to check, in the order the browser
 * will send them. No model is called yet.
 */
export const createCodeReviewInput = vine.create(
  vine.object({
    codeMapId: idInput(),
    diagramIds: vine
      .array(idInput())
      .minLength(1)
      .maxLength(CODE_REVIEW_LIMITS.diagramsPerReview)
      .distinct(),
    /**
     * The owner lets each call read the source of the diagram's files on GitHub
     * (`SOURCE_REVIEW_KINDS` only) and send excerpts to the model. Off: names and links only.
     */
    includeSnippets: vine.boolean().optional(),
    locale: vine.enum(CODE_REVIEW_LOCALES),
  }),
)

/** `GET /projects/:id/code-reviews` query params. */
export const listCodeReviewsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
  }),
)

/**
 * `POST /code-reviews/:id/diagrams/:diagramId`: one model call with the user's provider. The
 * browser sends no code: the server reads it when the review was started with `includeSnippets`.
 */
export const reviewDiagramInput = vine.create(vine.object({ ...llmCallFields() }))

/** `PATCH /code-review-findings/:id` */
export const updateCodeReviewFindingInput = vine.create(
  vine.object({ resolution: vine.enum(CODE_REVIEW_RESOLUTIONS) }),
)
