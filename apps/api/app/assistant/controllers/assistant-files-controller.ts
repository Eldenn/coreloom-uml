import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { digestFile, LlmCallError } from '@coreloom-uml/llm'
import { ASSISTANT_NOT_FOUND, assistantEnabled } from '#app/assistant/services/assistant-flag'
import { digestFileInput } from '#app/assistant/validators/assistant-input'
import type { FileDigestOutput } from '#app/assistant/validators/assistant-output'
import { llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'

/**
 * `POST /assistant/files/digest`: a file too long to go with a message is read first by the
 * user's own model, part by part, into notes short enough to be that message's file. Its own
 * request, so the reading and the message each fit in what the proxy allows one. Nothing is
 * stored, and the file and the notes are never logged, only counts. Session only.
 */
export default class AssistantFilesController {
  async digest({ request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)

    const { provider, apiKey, file } = await request.validateUsing(digestFileInput)
    const built = await userLanguageModel(provider, apiKey, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)

    const log = { kind: provider.kind, model: provider.model, chars: file.content.length }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'assistant file digest failed')
      return response.badGateway(llmFailure(built.reason))
    }

    const started = performance.now()
    try {
      const digest = await digestFile(built.model, file)
      logger.info(
        {
          ...log,
          durationMs: Math.round(performance.now() - started),
          parts: digest.parts,
          failed: digest.failed,
        },
        'assistant file digest',
      )
      return response.ok(digest satisfies FileDigestOutput)
    } catch (error) {
      if (!(error instanceof LlmCallError)) throw error
      const durationMs = Math.round(performance.now() - started)
      logger.warn({ ...log, durationMs, reason: error.reason }, 'assistant file digest failed')
      return response.badGateway(llmFailure(error.reason))
    }
  }
}
