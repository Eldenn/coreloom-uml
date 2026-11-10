import type Architecture from '#app/architectures/models/architecture'
import { findOwnedArchitecture } from '#app/architectures/services/owned-architecture'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import type User from '#app/users/models/user'

export const CONVERSATION_NOT_FOUND = { error: { message: 'Conversation not found' } } as const

/**
 * The architecture (diagrams preloaded) and its conversation if `user` owns both, else null —
 * callers answer 404 either way.
 */
export async function findOwnedConversation(
  architectureId: number,
  conversationId: number,
  user: User,
): Promise<{ architecture: Architecture; conversation: AssistantConversation } | null> {
  const architecture = await findOwnedArchitecture(architectureId, user, { withDiagrams: true })
  if (!architecture) return null
  const conversation = await AssistantConversation.query()
    .where('id', conversationId)
    .where('architectureId', architecture.id)
    .first()
  if (!conversation || !assertOwner(conversation, user)) return null
  return { architecture, conversation }
}
