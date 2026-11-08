import type { HttpContext } from '@adonisjs/core/http'
import { MODEL_SUGGESTIONS, PROVIDER_KINDS } from '@coreloom-uml/catalog'
import { requiresApiKey, takesBaseUrl } from '@coreloom-uml/llm'
import type { LlmProvidersOutput } from '#app/llm/validators/llm-output'
import llmConfig from '#config/llm'

/**
 * `GET /llm/providers`: what the browser's provider settings can hold on this server: each kind,
 * whether it needs a key or a base URL, a few model names to suggest, and the origins a base URL
 * may point to (`LLM_ALLOWED_BASE_URLS`). Nothing about the user's own provider is stored here.
 */
export default class LlmProvidersController {
  async index({ response }: HttpContext) {
    const output: LlmProvidersOutput = {
      providers: PROVIDER_KINDS.map((kind) => ({
        kind,
        requiresApiKey: requiresApiKey(kind),
        takesBaseUrl: takesBaseUrl(kind),
        models: [...MODEL_SUGGESTIONS[kind]],
      })),
      allowedBaseUrls: [...llmConfig.allowedOrigins],
    }
    return response.ok(output)
  }
}
