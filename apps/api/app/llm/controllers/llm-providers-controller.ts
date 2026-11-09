import type { HttpContext } from '@adonisjs/core/http'
import { MODEL_SUGGESTIONS, providerAuth } from '@coreloom-uml/catalog'
import { requiresApiKey, takesBaseUrl } from '@coreloom-uml/llm'
import type { LlmProvidersOutput } from '#app/llm/validators/llm-output'
import { enabledKinds, kindConnected } from '#app/llm-connections/services/subscriptions'
import llmConfig from '#config/llm'

/**
 * `GET /llm/providers`: what the browser's provider settings can hold on this server: each kind
 * this user may use (a subscription kind only while its flag is on), how it authenticates and
 * whether the user connected it, whether it needs a key or a base URL, a few model names to
 * suggest, and the origins a base URL may point to (`LLM_ALLOWED_BASE_URLS`). No key is stored
 * here, and no subscription token is returned.
 */
export default class LlmProvidersController {
  async index({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const kinds = await enabledKinds(user)
    const connected = await Promise.all(kinds.map((kind) => kindConnected(kind, user)))
    const output: LlmProvidersOutput = {
      providers: kinds.map((kind, index) => ({
        kind,
        auth: providerAuth(kind),
        connected: connected[index] ?? false,
        requiresApiKey: requiresApiKey(kind),
        takesBaseUrl: takesBaseUrl(kind),
        models: [...MODEL_SUGGESTIONS[kind]],
      })),
      allowedBaseUrls: [...llmConfig.allowedOrigins],
    }
    return response.ok(output)
  }
}
