import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { assistantBudget, LlmCallError, summarizeConversation } from '@coreloom-uml/llm'
import type Architecture from '#app/architectures/models/architecture'
import {
  ARCHITECTURE_NOT_FOUND,
  findOwnedArchitecture,
} from '#app/architectures/services/owned-architecture'
import { ASSISTANT_TITLE_MAX_LENGTH, AssistantRole } from '#app/assistant/constants/assistant'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import {
  serializeConversation,
  serializeMessage,
} from '#app/assistant/serializers/assistant-serializer'
import { assistantSource, conversationHistory } from '#app/assistant/services/assistant-context'
import { ASSISTANT_NOT_FOUND, assistantEnabled } from '#app/assistant/services/assistant-flag'
import {
  CONVERSATION_NOT_FOUND,
  findOwnedConversation,
} from '#app/assistant/services/owned-conversation'
import {
  continueConversationInput,
  createConversationInput,
  listConversationsInput,
  renameConversationInput,
} from '#app/assistant/validators/assistant-input'
import { LlmFailureReason, llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'
import { paginate } from '#app/shared/pagination/paginate'

/** The caller's assistant conversations about one of their architectures. */
export default class AssistantConversationsController {
  async index({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const architecture = await findOwnedArchitecture(params.id, user)
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    const { page, perPage } = await request.validateUsing(listConversationsInput)
    const query = AssistantConversation.query()
      .where('architectureId', architecture.id)
      .where('userId', user.id)
      .orderBy('updatedAt', 'desc')
      .orderBy('id', 'desc')

    return response.ok(await paginate(query, { page, perPage }, serializeConversation))
  }

  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const architecture = await findOwnedArchitecture(params.id, user)
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    const { title } = await request.validateUsing(createConversationInput)
    const conversation = await AssistantConversation.create({
      architectureId: architecture.id,
      userId: user.id,
      // Empty until the first message names it.
      title: title ?? '',
    })

    return response.created({ conversation: serializeConversation(conversation) })
  }

  async show({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const found = await findOwnedConversation(params.id, params.conversationId, user)
    if (!found) return response.notFound(CONVERSATION_NOT_FOUND)

    return response.ok(await conversationWithMessages(found.architecture, found.conversation))
  }

  /**
   * `POST …/conversations/:conversationId/continue` — the user's model summarizes the history (no
   * view sent) and a new conversation starts with that summary. The old one is left as it is;
   * nothing is stored when the call fails.
   */
  async continue({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const found = await findOwnedConversation(params.id, params.conversationId, user)
    if (!found) return response.notFound(CONVERSATION_NOT_FOUND)
    const { architecture, conversation } = found

    const { provider, apiKey, locale } = await request.validateUsing(continueConversationInput)
    const built = await userLanguageModel(provider, apiKey, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)

    const log = { conversationId: conversation.id, kind: provider.kind, model: provider.model }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'assistant summary failed')
      return response.badGateway(llmFailure(built.reason))
    }
    const history = await conversationHistory(conversation)
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
          architectureId: architecture.id,
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

    return response.created(await conversationWithMessages(architecture, next))
  }

  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const found = await findOwnedConversation(params.id, params.conversationId, user)
    if (!found) return response.notFound(CONVERSATION_NOT_FOUND)

    const { title } = await request.validateUsing(renameConversationInput)
    found.conversation.title = title
    await found.conversation.save()

    return response.ok({ conversation: serializeConversation(found.conversation) })
  }

  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const found = await findOwnedConversation(params.id, params.conversationId, user)
    if (!found) return response.notFound(CONVERSATION_NOT_FOUND)

    await found.conversation.delete()

    return response.noContent()
  }
}

/** A conversation with its messages and the budget of the next message, as `show` answers it. */
async function conversationWithMessages(
  architecture: Architecture,
  conversation: AssistantConversation,
) {
  const messages = await AssistantMessage.query()
    .where('conversationId', conversation.id)
    .orderBy('id', 'asc')
  // Every view, none current, no message yet: the web asks `…/context` for its own selection.
  const source = await assistantSource(architecture, conversation, {
    message: '',
    currentDiagramId: null,
    locale: 'en',
  })
  return {
    conversation: serializeConversation(conversation),
    messages: messages.map(serializeMessage),
    budget: assistantBudget(source),
  }
}
