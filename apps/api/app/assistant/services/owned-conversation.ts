import type Architecture from '#app/architectures/models/architecture'
import { findOwnedArchitecture } from '#app/architectures/services/owned-architecture'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import type User from '#app/users/models/user'

export const CONVERSATION_NOT_FOUND = { error: { message: 'Conversation not found' } } as const

/** The conversation if `user` owns it, else null — callers answer 404. */
export async function findOwnedConversation(
  conversationId: number,
  user: User,
): Promise<AssistantConversation | null> {
  const conversation = await AssistantConversation.find(conversationId)
  if (!conversation || !assertOwner(conversation, user)) return null
  return conversation
}

/**
 * The architecture (diagrams preloaded) and the conversation a message about it goes to, if
 * `user` owns both, else null — callers answer 404 either way. A conversation is the account's:
 * it may hold messages about other architectures too.
 */
export async function findArchitectureConversation(
  architectureId: number,
  conversationId: number,
  user: User,
): Promise<{ architecture: Architecture; conversation: AssistantConversation } | null> {
  const architecture = await findOwnedArchitecture(architectureId, user, { withDiagrams: true })
  if (!architecture) return null
  const conversation = await findOwnedConversation(conversationId, user)
  if (!conversation) return null
  return { architecture, conversation }
}
