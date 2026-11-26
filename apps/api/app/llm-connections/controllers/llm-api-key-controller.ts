import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import {
  MODEL_SUGGESTIONS,
  PROVIDER_KINDS,
  ProviderAuth,
  type ProviderKind,
  providerAuth,
} from '@coreloom-uml/catalog'
import { testConnection } from '@coreloom-uml/llm'
import LanguageModels, { llmFailure, providerProblem } from '#app/llm/services/language-models'
import { deleteApiKey, saveApiKey } from '#app/llm-connections/services/llm-api-keys'
import { saveApiKeyInput } from '#app/llm-connections/validators/llm-connections-input'
import type { LlmApiKeyOutput } from '#app/llm-connections/validators/llm-connections-output'

/**
 * The kind named by the URL, or `null` for one the catalog does not know. Checked here rather
 * than with a Vine validator on `request.params()`: the Tuyau registry reads every validator a
 * controller uses as its body, which left the typed client unable to send this one's.
 */
function kindParam(value: unknown): ProviderKind | null {
  return PROVIDER_KINDS.find((kind) => kind === value) ?? null
}

const UNKNOWN_KIND = { error: { message: 'Unknown provider kind' } } as const

/**
 * The provider keys an account saves, one per kind: `PUT /llm/api-keys/:kind` stores a key only
 * after a successful test call with it, `DELETE /llm/api-keys/:kind` drops it. The kind comes from
 * the URL and the account from the session, so no route takes a row id and no key of another
 * account can be reached. The key is stored encrypted (`llm_api_keys`) and never returned: the
 * answer is the hint, the origin and the date it was verified. Only the outcome is logged.
 */
export default class LlmApiKeyController {
  async save({ request, auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const kind = kindParam(params.kind)
    if (!kind) return response.unprocessableEntity(UNKNOWN_KIND)
    const { apiKey, baseUrl } = await request.validateUsing(saveApiKeyInput)
    if (providerAuth(kind) !== ProviderAuth.ApiKey) {
      return response.unprocessableEntity({
        error: { message: `${kind} authenticates with a subscription, not a saved key` },
      })
    }
    const key = apiKey ?? ''
    // A test model to check the key with: the same the settings screen suggests.
    const provider = {
      kind,
      model: MODEL_SUGGESTIONS[kind][0] ?? '',
      baseUrl: baseUrl ?? null,
    } as const
    const problem = providerProblem(provider, key)
    if (problem) return response.unprocessableEntity({ error: { message: problem } })

    const models = await app.container.make(LanguageModels)
    const result = await testConnection(models.create(provider, key))
    logger.info(
      {
        userId: user.id,
        kind,
        ok: result.ok,
        saved: result.ok,
        ...(result.ok ? { latencyMs: result.latencyMs } : { reason: result.reason }),
      },
      'llm api key checked',
    )
    if (!result.ok) return response.badGateway(llmFailure(result.reason))

    const saved = await saveApiKey(user, kind, { apiKey: key, baseUrl: baseUrl ?? null })
    const output: LlmApiKeyOutput = {
      kind,
      keyHint: saved.keyHint,
      baseUrl: saved.baseUrl,
      verifiedAt: saved.verifiedAt.toISO() ?? new Date().toISOString(),
    }
    return response.ok(output)
  }

  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const kind = kindParam(params.kind)
    if (!kind) return response.unprocessableEntity(UNKNOWN_KIND)
    await deleteApiKey(user, kind)
    logger.info({ userId: user.id, kind }, 'llm api key deleted')
    return response.noContent()
  }
}
