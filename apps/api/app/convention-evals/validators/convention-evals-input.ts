import vine from '@vinejs/vine'
import { CONVENTION_EVAL_CAP_USD } from '#app/convention-evals/constants/convention-evals'
import { LLM_MODEL_MAX_LENGTH, PROVIDER_KINDS } from '#app/llm/constants/llm'
import { llmCallFields } from '#app/llm/validators/llm-input'

/**
 * `POST /agent-configs/:id/evals`: the provider as the browser keeps it (its kind and model), like
 * every other model feature. Its credential is the one the account saved or connected, resolved
 * by the job; a saved key's base URL is read from its row, never from the request.
 */
export const startConventionEvalInput = vine.create(vine.object(llmCallFields()))

/** `GET /agent-configs/:id/evals/plan?kind=&model=`: what a test would run with this provider. */
export const planConventionEvalInput = vine.create(
  vine.object({
    kind: vine.enum(PROVIDER_KINDS),
    model: vine.string().trim().minLength(1).maxLength(LLM_MODEL_MAX_LENGTH),
  }),
)

/** `PUT /admin/convention-evals`: the cap of a run for the whole instance, in US dollars. */
export const saveConventionEvalSettingsInput = vine.create(
  vine.object({
    capUsd: vine
      .number()
      .decimal([0, 2])
      .min(CONVENTION_EVAL_CAP_USD.min)
      .max(CONVENTION_EVAL_CAP_USD.max),
  }),
)

/** `GET /agent-configs/:id/evals` query params. */
export const listConventionEvalsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
  }),
)
