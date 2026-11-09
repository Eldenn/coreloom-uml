import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { failureReason } from '@coreloom-uml/llm'
import { llmFailure } from '#app/llm/services/language-models'
import {
  ProviderKind,
  SUBSCRIPTION_NOT_FOUND,
} from '#app/llm-connections/constants/llm-connections'
import { checkCodexAttempt, startCodexAttempt } from '#app/llm-connections/services/codex-attempts'
import { disconnectCodex } from '#app/llm-connections/services/codex-connections'
import { kindEnabled } from '#app/llm-connections/services/subscriptions'
import type {
  CodexAttemptOutput,
  CodexAttemptStatusOutput,
} from '#app/llm-connections/validators/llm-connections-output'

/**
 * Connects a ChatGPT subscription with OpenAI's device code: start an attempt, show the code,
 * poll until the user has entered it. The tokens stay on the server, encrypted; no route returns
 * them. Behind the `llm-subscription-chatgpt` flag (404 while it is off). Session only.
 */
export default class CodexConnectionController {
  async store({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await kindEnabled(ProviderKind.OpenAICodex, user))) {
      return response.notFound(SUBSCRIPTION_NOT_FOUND)
    }
    try {
      const output: CodexAttemptOutput = await startCodexAttempt(user)
      return response.created(output)
    } catch (error) {
      const reason = failureReason(error)
      logger.warn({ userId: user.id, reason }, 'codex device code failed')
      return response.badGateway(llmFailure(reason))
    }
  }

  async show({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await kindEnabled(ProviderKind.OpenAICodex, user))) {
      return response.notFound(SUBSCRIPTION_NOT_FOUND)
    }
    const status = await checkCodexAttempt(user, params.attemptId)
    if (!status) return response.notFound(SUBSCRIPTION_NOT_FOUND)
    const output: CodexAttemptStatusOutput = { status }
    return response.ok(output)
  }

  async destroy({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await kindEnabled(ProviderKind.OpenAICodex, user))) {
      return response.notFound(SUBSCRIPTION_NOT_FOUND)
    }
    await disconnectCodex(user)
    return response.noContent()
  }
}
