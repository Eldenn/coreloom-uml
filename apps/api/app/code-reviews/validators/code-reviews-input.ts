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
    /** The owner may send code excerpts with each call; nothing else ever sends code. */
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
 * excerpts, by code key, are only taken when the review was started with `includeSnippets`; they
 * reach the model and are never stored.
 */
export const reviewDiagramInput = vine.create(
  vine.object({
    ...llmCallFields(),
    snippets: vine
      .array(
        vine.object({
          key: vine.string().minLength(1).maxLength(CODE_REVIEW_LIMITS.codeKey),
          text: vine.string().minLength(1).maxLength(CODE_REVIEW_LIMITS.snippetLength),
        }),
      )
      .maxLength(CODE_REVIEW_LIMITS.snippets)
      .optional(),
  }),
)

/** `PATCH /code-review-findings/:id` */
export const updateCodeReviewFindingInput = vine.create(
  vine.object({ resolution: vine.enum(CODE_REVIEW_RESOLUTIONS) }),
)
