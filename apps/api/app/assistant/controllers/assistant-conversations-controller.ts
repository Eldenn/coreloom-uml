import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { LlmCallError, summarizeConversation } from '@coreloom-uml/llm'
import { ASSISTANT_TITLE_MAX_LENGTH, AssistantRole } from '#app/assistant/constants/assistant'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import AssistantSandbox from '#app/assistant/models/assistant-sandbox'
import {
  serializeConversation,
  serializeMessage,
} from '#app/assistant/serializers/assistant-serializer'
import { conversationHistory } from '#app/assistant/services/assistant-context'
import { ASSISTANT_NOT_FOUND, assistantEnabled } from '#app/assistant/services/assistant-flag'
import {
  conversationFiles,
  deleteConversationFileTexts,
} from '#app/assistant/services/conversation-files'
import {
  CONVERSATION_NOT_FOUND,
  findOwnedConversation,
} from '#app/assistant/services/owned-conversation'
import { killSandboxes } from '#app/assistant/services/repository-session'
import {
  continueConversationInput,
  createConversationInput,
  listConversationsInput,
  renameConversationInput,
} from '#app/assistant/validators/assistant-input'
import { LlmFailureReason, llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'
import { paginate } from '#app/shared/pagination/paginate'

const NOTHING_TO_SUMMARIZE = {
  error: {
    message: 'This conversation has no messages to summarize.',
    code: 'nothing_to_summarize',
  },
} as const

/**
 * The caller's assistant conversations, all of the account's: each message says which
 * architecture it is about. Session only.
 */
export default class AssistantConversationsController {
  async index({ request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)

    const { page, perPage } = await request.validateUsing(listConversationsInput)
    const query = AssistantConversation.query()
      .where('userId', user.id)
      .orderBy('updatedAt', 'desc')
      .orderBy('id', 'desc')

    return response.ok(await paginate(query, { page, perPage }, serializeConversation))
  }

  async store({ request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)

    const { title } = await request.validateUsing(createConversationInput)
    const conversation = await AssistantConversation.create({
      userId: user.id,
      // Empty until the first message names it.
      title: title ?? '',
    })

    return response.created({ conversation: serializeConversation(conversation) })
  }

  async show({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const conversation = await findOwnedConversation(params.conversationId, user)
    if (!conversation) return response.notFound(CONVERSATION_NOT_FOUND)

    return response.ok(await conversationWithMessages(conversation))
  }

  /**
   * `POST …/conversations/:conversationId/continue` — the user's model summarizes the history (no
   * view sent) and a new conversation starts with that summary. The old one is left as it is;
   * nothing is stored when the call fails.
   */
  async continue({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const conversation = await findOwnedConversation(params.conversationId, user)
    if (!conversation) return response.notFound(CONVERSATION_NOT_FOUND)

    const { provider, apiKey, locale } = await request.validateUsing(continueConversationInput)
    const history = await conversationHistory(conversation)
    // Nothing to summarize: a new conversation would be just as full.
    if (history.length === 0) return response.conflict(NOTHING_TO_SUMMARIZE)
    const built = await userLanguageModel(provider, apiKey, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)

    const log = { conversationId: conversation.id, kind: provider.kind, model: provider.model }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'assistant summary failed')
      return response.badGateway(llmFailure(built.reason))
    }
    const started = performance.now()
    let summary: string
    try {
      summary = await summarizeConversation(built.model, history, locale)
    } catch (error) {
      if (!(error instanceof LlmCallError)) throw error
      const durationMs = Math.round(performance.now() - started)
      logger.warn({ ...log, durationMs, reason: error.reason }, 'assistant summary failed')
      return response.badGateway(llmFailure(error.reason))
    }
    const durationMs = Math.round(performance.now() - started)
    if (!summary) {
      // A blank summary would start an empty conversation: answered like any failed call.
      logger.warn(
        { ...log, durationMs, reason: LlmFailureReason.Unknown },
        'assistant summary failed',
      )
      return response.badGateway(llmFailure(LlmFailureReason.Unknown))
    }
    logger.info({ ...log, durationMs, turns: history.length }, 'assistant summary')

    const next = await db.transaction(async (trx) => {
      const created = await AssistantConversation.create(
        {
          userId: user.id,
          // An untitled conversation stays untitled: its first message names it.
          title: conversation.title
            ? `${conversation.title} (2)`.slice(0, ASSISTANT_TITLE_MAX_LENGTH)
            : '',
        },
        { client: trx },
      )
      await AssistantMessage.create(
        { conversationId: created.id, role: AssistantRole.Summary, content: summary },
        { client: trx },
      )
      return created
    })

    return response.created(await conversationWithMessages(next))
  }

  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const conversation = await findOwnedConversation(params.conversationId, user)
    if (!conversation) return response.notFound(CONVERSATION_NOT_FOUND)

    const { title } = await request.validateUsing(renameConversationInput)
    conversation.title = title
    await conversation.save()

    return response.ok({ conversation: serializeConversation(conversation) })
  }

  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const conversation = await findOwnedConversation(params.conversationId, user)
    if (!conversation) return response.notFound(CONVERSATION_NOT_FOUND)

    const files = await conversationFiles(conversation.id)
    const sandboxes = await AssistantSandbox.query().where('conversationId', conversation.id)
    await conversation.delete()
    // Its files' texts are objects in Drive and its repository is in a sandbox: the cascade
    // reaches neither.
    await deleteConversationFileTexts(files.map((file) => file.storageKey))
    await killSandboxes(sandboxes)

    return response.noContent()
  }
}

/** A conversation with its messages, as `show` answers it. */
async function conversationWithMessages(conversation: AssistantConversation) {
  const messages = await AssistantMessage.query()
    .where('conversationId', conversation.id)
    .orderBy('id', 'asc')
  return {
    conversation: serializeConversation(conversation),
    messages: messages.map(serializeMessage),
    /** Whether the assistant opened a repository in it: the owner's terminal has a sandbox. */
    sandbox: (await AssistantSandbox.findBy('conversationId', conversation.id)) !== null,
  }
}
