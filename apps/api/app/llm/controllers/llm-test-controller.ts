import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { testConnection } from '@coreloom-uml/llm'
import { userLanguageModel } from '#app/llm/services/language-models'
import { llmCallInput } from '#app/llm/validators/llm-input'
import type { LlmTestOutput } from '#app/llm/validators/llm-output'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'

/**
 * `POST /llm/test`: one tiny call with the user's provider — the key the account saved for it, or
 * a connected subscription — to check it before use. Session only. Only the outcome is logged.
 */
export default class LlmTestController {
  async handle({ request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { provider } = await request.validateUsing(llmCallInput)
    const built = await userLanguageModel(provider, user)
    if ('problem' in built) {
      return response.unprocessableEntity({ error: { message: built.problem } })
    }
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)
    const result: LlmTestOutput =
      'reason' in built ? { ok: false, reason: built.reason } : await testConnection(built.model)
    logger.info(
      {
        userId: user.id,
        kind: provider.kind,
        model: provider.model,
        ok: result.ok,
        ...(result.ok ? { latencyMs: result.latencyMs } : { reason: result.reason }),
      },
      'llm connection test',
    )
    return response.ok(result)
  }
}
