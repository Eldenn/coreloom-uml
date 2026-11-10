import type { StoredChange } from '#app/assistant/constants/assistant'
import type AssistantConversation from '#app/assistant/models/assistant-conversation'
import type AssistantMessage from '#app/assistant/models/assistant-message'
import type {
  ChangeOutput,
  ConversationOutput,
  MessageOutput,
} from '#app/assistant/validators/assistant-output'

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
    changes: message.changes?.map(serializeChange) ?? null,
    createdAt: message.createdAt.toISO() ?? '',
  }
}

export function serializeChange(
  {
    baseTitle: _title,
    baseFormat: _format,
    baseKind: _kind,
    position: _position,
    ...change
  }: StoredChange,
  index: number,
): ChangeOutput {
  return { ...change, index }
}
