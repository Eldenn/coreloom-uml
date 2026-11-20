import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { LlmCallError, summarizeFile } from '@coreloom-uml/llm'
import { countOf } from '#app/assistant/actions/action'
import { CONVERSATION_FILES_MAX } from '#app/assistant/constants/assistant'
import AssistantFile from '#app/assistant/models/assistant-file'
import { ASSISTANT_NOT_FOUND, assistantEnabled } from '#app/assistant/services/assistant-flag'
import { storeConversationFile } from '#app/assistant/services/conversation-files'
import {
  CONVERSATION_NOT_FOUND,
  findOwnedConversation,
} from '#app/assistant/services/owned-conversation'
import { attachFileInput } from '#app/assistant/validators/assistant-input'
import type { AttachFileOutput } from '#app/assistant/validators/assistant-output'
import { llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'

const FILES_FULL = {
  error: {
    message: `A conversation holds at most ${String(CONVERSATION_FILES_MAX)} files.`,
    code: 'files_full',
  },
} as const

/**
 * `POST /assistant/conversations/:conversationId/files`: attaches a file to a conversation. The
 * user's own model summarizes it part by part, then its text is stored gzipped in Drive and its
 * summaries in a row; the next messages carry the summaries and read the text on demand. Its own
 * request, so the reading and the message each fit in what the proxy allows one. The file and the
 * summaries are never logged or answered, only counts. Session only.
 */
export default class AssistantFilesController {
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const conversation = await findOwnedConversation(params.conversationId, user)
    if (!conversation) return response.notFound(CONVERSATION_NOT_FOUND)

    const { provider, apiKey, file } = await request.validateUsing(attachFileInput)
    const held = await countOf(AssistantFile.query().where('conversationId', conversation.id))
    if (held >= CONVERSATION_FILES_MAX) return response.conflict(FILES_FULL)

    const built = await userLanguageModel(provider, apiKey, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)

    const log = {
      conversationId: conversation.id,
      kind: provider.kind,
      model: provider.model,
      chars: file.content.length,
    }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'assistant file failed')
      return response.badGateway(llmFailure(built.reason))
    }

    const started = performance.now()
    let summary: Awaited<ReturnType<typeof summarizeFile>>
    try {
      summary = await summarizeFile(built.model, file)
    } catch (error) {
      if (!(error instanceof LlmCallError)) throw error
      const durationMs = Math.round(performance.now() - started)
      logger.warn({ ...log, durationMs, reason: error.reason }, 'assistant file failed')
      return response.badGateway(llmFailure(error.reason))
    }
    const stored = await storeConversationFile({
      conversationId: conversation.id,
      userId: user.id,
      name: file.name,
      content: file.content,
      parts: summary.parts,
    })
    logger.info(
      {
        ...log,
        fileId: stored.id,
        durationMs: Math.round(performance.now() - started),
        parts: summary.parts.length,
        failed: summary.failed,
      },
      'assistant file',
    )
    return response.created({
      file: {
        id: stored.id,
        name: stored.name,
        chars: stored.chars,
        parts: summary.parts.length,
        failed: summary.failed,
      },
    } satisfies AttachFileOutput)
  }
}
