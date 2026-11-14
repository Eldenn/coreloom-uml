import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import {
  AssistantContextFull,
  askAssistant,
  assistantBudget,
  LlmCallError,
} from '@coreloom-uml/llm'
import { DateTime } from 'luxon'
import {
  ASSISTANT_TITLE_FROM_MESSAGE,
  AssistantRole,
  ChangeStatus,
} from '#app/assistant/constants/assistant'
import AssistantMessage from '#app/assistant/models/assistant-message'
import { serializeMessage } from '#app/assistant/serializers/assistant-serializer'
import { assistantSource, selectsOwnViews } from '#app/assistant/services/assistant-context'
import { ASSISTANT_NOT_FOUND, assistantEnabled } from '#app/assistant/services/assistant-flag'
import {
  CONVERSATION_NOT_FOUND,
  findOwnedConversation,
} from '#app/assistant/services/owned-conversation'
import { storedChange } from '#app/assistant/services/stored-change'
import { askAssistantInput, assistantContextInput } from '#app/assistant/validators/assistant-input'
import type { AskAssistantOutput } from '#app/assistant/validators/assistant-output'
import { DIAGRAM_NOT_FOUND } from '#app/diagrams/services/owned-diagram'
import { llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'

const MESSAGE_NOT_FOUND = { error: { message: 'Message not found' } } as const
const NOT_A_SUMMARY = { error: { message: 'Only a summary can be deleted.' } } as const

const CONTEXT_FULL = {
  error: { message: 'The conversation is too long for the model.', code: 'context_full' },
} as const

/**
 * The workspace assistant: the user's own model answers a message about the architecture's views
 * and proposes view changes, stored as `pending` for the owner to accept. Nothing here writes a
 * diagram. The exchange is stored only when the call succeeds. Session only.
 */
export default class AssistantMessagesController {
  /** `POST …/conversations/:conversationId/messages` */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const found = await findOwnedConversation(params.id, params.conversationId, user)
    if (!found) return response.notFound(CONVERSATION_NOT_FOUND)
    const { architecture, conversation } = found

    const { provider, apiKey, ...selection } = await request.validateUsing(askAssistantInput)
    if (!selectsOwnViews(architecture, selection)) return response.notFound(DIAGRAM_NOT_FOUND)

    const built = await userLanguageModel(provider, apiKey, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)

    const log = { conversationId: conversation.id, kind: provider.kind, model: provider.model }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'assistant message failed')
      return response.badGateway(llmFailure(built.reason))
    }
    const source = await assistantSource(architecture, conversation, selection)
    const started = performance.now()
    let reply: Awaited<ReturnType<typeof askAssistant>>
    try {
      reply = await askAssistant(built.model, source)
    } catch (error) {
      const durationMs = Math.round(performance.now() - started)
      if (error instanceof AssistantContextFull) {
        logger.info({ ...log, durationMs }, 'assistant message refused: context full')
        return response.unprocessableEntity(CONTEXT_FULL)
      }
      if (!(error instanceof LlmCallError)) throw error
      logger.warn({ ...log, durationMs, reason: error.reason }, 'assistant message failed')
      return response.badGateway(llmFailure(error.reason))
    }
    const changes = reply.changes.map((change) => storedChange(change, architecture.diagrams))
    logger.info(
      {
        ...log,
        durationMs: Math.round(performance.now() - started),
        changes: changes.length,
        failed: changes.filter((change) => change.status === ChangeStatus.Failed).length,
        skipped: reply.skipped.length,
      },
      'assistant message',
    )

    const messages = await db.transaction(async (trx) => {
      const asked = await AssistantMessage.create(
        { conversationId: conversation.id, role: AssistantRole.User, content: selection.message },
        { client: trx },
      )
      const answered = await AssistantMessage.create(
        {
          conversationId: conversation.id,
          role: AssistantRole.Assistant,
          content: reply.reply,
          changes: changes.length ? changes : null,
        },
        { client: trx },
      )
      conversation.useTransaction(trx)
      if (!conversation.title) {
        conversation.title = selection.message.slice(0, ASSISTANT_TITLE_FROM_MESSAGE).trim()
      }
      conversation.updatedAt = DateTime.now()
      await conversation.save()
      return [asked, answered]
    })

    const next = await assistantSource(architecture, conversation, { ...selection, message: '' })
    return response.ok({
      messages: messages.map(serializeMessage),
      budget: assistantBudget(next),
      skipped: reply.skipped,
    } satisfies AskAssistantOutput)
  }

  /** `POST …/conversations/:conversationId/context` — the budget of a selection, no model call. */
  async context({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const found = await findOwnedConversation(params.id, params.conversationId, user)
    if (!found) return response.notFound(CONVERSATION_NOT_FOUND)

    const { message, ...selection } = await request.validateUsing(assistantContextInput)
    const view = { ...selection, message: message ?? '' }
    if (!selectsOwnViews(found.architecture, view)) return response.notFound(DIAGRAM_NOT_FOUND)

    const source = await assistantSource(found.architecture, found.conversation, view)
    return response.ok({ budget: assistantBudget(source) })
  }

  /** `DELETE …/conversations/:conversationId/messages/:messageId` — a summary only. */
  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const found = await findOwnedConversation(params.id, params.conversationId, user)
    if (!found) return response.notFound(MESSAGE_NOT_FOUND)

    const message = await AssistantMessage.query()
      .where('id', params.messageId)
      .where('conversationId', found.conversation.id)
      .first()
    if (!message) return response.notFound(MESSAGE_NOT_FOUND)
    if (message.role !== AssistantRole.Summary) return response.conflict(NOT_A_SUMMARY)

    await message.delete()
    return response.noContent()
  }
}
