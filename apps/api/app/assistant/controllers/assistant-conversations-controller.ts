import type { HttpContext } from '@adonisjs/core/http'
import {
  ARCHITECTURE_NOT_FOUND,
  findOwnedArchitecture,
} from '#app/architectures/services/owned-architecture'
import { ASSISTANT_CONVERSATIONS_LIMIT } from '#app/assistant/constants/assistant'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import {
  serializeConversation,
  serializeMessage,
} from '#app/assistant/serializers/assistant-serializer'
import { ASSISTANT_NOT_FOUND, assistantEnabled } from '#app/assistant/services/assistant-flag'
import {
  CONVERSATION_NOT_FOUND,
  findOwnedConversation,
} from '#app/assistant/services/owned-conversation'
import {
  createConversationInput,
  renameConversationInput,
} from '#app/assistant/validators/assistant-input'

/** The caller's assistant conversations about one of their architectures. */
export default class AssistantConversationsController {
  async index({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const architecture = await findOwnedArchitecture(params.id, user)
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    const conversations = await AssistantConversation.query()
      .where('architectureId', architecture.id)
      .where('userId', user.id)
      .orderBy('updatedAt', 'desc')
      .orderBy('id', 'desc')
      .limit(ASSISTANT_CONVERSATIONS_LIMIT)

    return response.ok({ conversations: conversations.map(serializeConversation) })
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

    const messages = await AssistantMessage.query()
      .where('conversationId', found.conversation.id)
      .orderBy('id', 'asc')

    return response.ok({
      conversation: serializeConversation(found.conversation),
      messages: messages.map(serializeMessage),
    })
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
