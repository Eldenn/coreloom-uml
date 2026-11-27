import vine from '@vinejs/vine'
import { LLM_API_KEY_MAX_LENGTH } from '#app/llm/constants/llm'
import { WebSearchKind } from '#app/web-search/constants/web-search'

/**
 * The instance's web search service and its key, under the same rule as a provider key
 * (`saveApiKeyInput`): printable ASCII on one line, bounded. Stored only after the service
 * accepted it.
 */
export const saveWebSearchInput = vine.create(
  vine.object({
    kind: vine.enum(Object.values(WebSearchKind)),
    apiKey: vine
      .string()
      .trim()
      .minLength(16)
      .maxLength(LLM_API_KEY_MAX_LENGTH)
      .regex(/^[\x21-\x7E]+$/),
  }),
)
