import type AssistantConversation from '#app/assistant/models/assistant-conversation'
import type AssistantMessage from '#app/assistant/models/assistant-message'
import type { ConversationOutput, MessageOutput } from '#app/assistant/validators/assistant-output'

export function serializeConversation(conversation: AssistantConversation): ConversationOutput {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt.toISO() ?? '',
    updatedAt: conversation.updatedAt.toISO() ?? '',
  }
}

export function serializeMessage(message: AssistantMessage): MessageOutput {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    changes:
      message.changes?.map(({ baseTitle: _title, baseFormat: _format, ...change }, index) => ({
        ...change,
        index,
      })) ?? null,
    createdAt: message.createdAt.toISO() ?? '',
  }
}
