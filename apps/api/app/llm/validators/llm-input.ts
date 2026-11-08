import vine from '@vinejs/vine'
import {
  LLM_API_KEY_MAX_LENGTH,
  LLM_BASE_URL_MAX_LENGTH,
  LLM_MODEL_MAX_LENGTH,
  PROVIDER_KINDS,
} from '#app/llm/constants/llm'

/**
 * A call made with the user's own provider: the provider as the browser keeps it, and its key,
 * used for this request only (never stored, never logged). The base URL is checked against the
 * allowlist by `checkProvider`, after validation.
 */
export const llmCallInput = vine.create(
  vine.object({
    provider: vine.object({
      kind: vine.enum(PROVIDER_KINDS),
      model: vine.string().trim().minLength(1).maxLength(LLM_MODEL_MAX_LENGTH),
      baseUrl: vine.string().trim().maxLength(LLM_BASE_URL_MAX_LENGTH).nullable().optional(),
    }),
    /** Required by the hosted providers; a local or private server may take none. */
    apiKey: vine.string().trim().maxLength(LLM_API_KEY_MAX_LENGTH).nullable().optional(),
  }),
)
