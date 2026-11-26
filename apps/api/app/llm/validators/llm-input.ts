import vine from '@vinejs/vine'
import { LLM_MODEL_MAX_LENGTH, PROVIDER_KINDS } from '#app/llm/constants/llm'

/**
 * A call made with the user's provider: the provider as the browser keeps it. Its key is the one
 * the account saved (`llm_api_keys`, read by `resolveCredential`), never sent with a request, and
 * a kind that calls a server the user names reads that server's address from the saved row too.
 */
export const llmCallFields = () => ({
  provider: vine.object({
    kind: vine.enum(PROVIDER_KINDS),
    model: vine.string().trim().minLength(1).maxLength(LLM_MODEL_MAX_LENGTH),
  }),
})

export const llmCallInput = vine.create(vine.object(llmCallFields()))
