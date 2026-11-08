import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { testConnection } from '@coreloom-uml/llm'
import LanguageModels, { providerProblem } from '#app/llm/services/language-models'
import { llmCallInput } from '#app/llm/validators/llm-input'
import type { LlmTestOutput } from '#app/llm/validators/llm-output'

/**
 * `POST /llm/test`: one tiny call with the user's provider and key, to check them before use.
 * Session only. The key is used for this call and dropped; only the outcome is logged.
 */
export default class LlmTestController {
  async handle({ request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { provider, apiKey } = await request.validateUsing(llmCallInput)
    const key = apiKey ?? ''
    const problem = providerProblem(provider, key)
    if (problem) return response.unprocessableEntity({ error: { message: problem } })

    const models = await app.container.make(LanguageModels)
    const result: LlmTestOutput = await testConnection(models.create(provider, key))
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
