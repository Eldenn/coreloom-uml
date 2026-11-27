import vine from '@vinejs/vine'
import { apiKeyRule } from '#app/llm-connections/validators/llm-connections-input'
import { WebSearchKind } from '#app/web-search/constants/web-search'

/**
 * The instance's web search service and its key, under the same rule as a provider key
 * (`apiKeyRule`). Stored only after the service accepted it.
 */
export const saveWebSearchInput = vine.create(
  vine.object({
    kind: vine.enum(Object.values(WebSearchKind)),
    apiKey: apiKeyRule(),
  }),
)
