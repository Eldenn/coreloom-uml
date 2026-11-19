import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import {
  ASSISTANT_TITLE_FROM_MESSAGE,
  AssistantRole,
  type StoredAction,
  type StoredChange,
  type StoredProposals,
} from '#app/assistant/constants/assistant'
import type AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'

/**
 * Stores a message and its answer in one transaction, both about `architectureId` (null for
 * none), titles a conversation that has no title yet from the message, and bumps `updatedAt`.
 */
export function storeExchange(
  conversation: AssistantConversation,
  message: string,
  answer: {
    architectureId: number | null
    content: string
    changes?: StoredChange[]
    proposals?: StoredProposals
    actions?: StoredAction[]
  },
) {
  const { architectureId } = answer
  return db.transaction(async (trx) => {
    const asked = await AssistantMessage.create(
      {
        conversationId: conversation.id,
        architectureId,
        role: AssistantRole.User,
        content: message,
      },
      { client: trx },
    )
    const answered = await AssistantMessage.create(
      {
        conversationId: conversation.id,
        architectureId,
        role: AssistantRole.Assistant,
        content: answer.content,
        changes: answer.changes?.length ? answer.changes : null,
        proposals: answer.proposals ?? null,
        actions: answer.actions?.length ? answer.actions : null,
      },
      { client: trx },
    )
    conversation.useTransaction(trx)
    if (!conversation.title) {
      conversation.title = message.slice(0, ASSISTANT_TITLE_FROM_MESSAGE).trim()
    }
    conversation.updatedAt = DateTime.now()
    await conversation.save()
    return [asked, answered]
  })
}
