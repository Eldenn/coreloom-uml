import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { LlmCallError, LlmFailureReason } from '@coreloom-uml/llm'
import { llmFailure } from '#app/llm/services/language-models'
import {
  ProviderKind,
  SUBSCRIPTION_NOT_FOUND,
} from '#app/llm-connections/constants/llm-connections'
import {
  disconnectClaude,
  startClaudeLogin,
  submitClaudeCode,
} from '#app/llm-connections/services/claude-code-connections'
import { kindEnabled } from '#app/llm-connections/services/subscriptions'
import { claudeCodeInput } from '#app/llm-connections/validators/llm-connections-input'
import type {
  ClaudeCodeOutput,
  ClaudeLoginOutput,
} from '#app/llm-connections/validators/llm-connections-output'

/**
 * Connects a Claude subscription through the unmodified `claude` binary: it prints a sign-in page,
 * the user pastes back the code, and the binary keeps the credentials in the account's own folder.
 * Behind the `llm-subscription-claude` flag (404 while it is off). Session only. The code is never
 * logged or returned.
 */
export default class ClaudeCodeConnectionController {
  async store({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await kindEnabled(ProviderKind.ClaudeCode, user))) {
      return response.notFound(SUBSCRIPTION_NOT_FOUND)
    }
    try {
      const output: ClaudeLoginOutput = { url: await startClaudeLogin(user) }
      return response.ok(output)
    } catch (error) {
      const reason = error instanceof LlmCallError ? error.reason : LlmFailureReason.Unreachable
      logger.warn({ userId: user.id, reason }, 'claude sign-in did not start')
      return response.badGateway(llmFailure(reason))
    }
  }

  async code({ request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await kindEnabled(ProviderKind.ClaudeCode, user))) {
      return response.notFound(SUBSCRIPTION_NOT_FOUND)
    }
    const { code } = await request.validateUsing(claudeCodeInput)
    const connected = await submitClaudeCode(user, code)
    if (connected === null) return response.notFound(SUBSCRIPTION_NOT_FOUND)
    logger.info({ userId: user.id, connected }, 'claude sign-in finished')
    const output: ClaudeCodeOutput = { connected }
    return response.ok(output)
  }

  async destroy({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await kindEnabled(ProviderKind.ClaudeCode, user))) {
      return response.notFound(SUBSCRIPTION_NOT_FOUND)
    }
    await disconnectClaude(user)
    return response.noContent()
  }
}
