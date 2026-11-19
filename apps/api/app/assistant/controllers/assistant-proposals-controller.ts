import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { AssistantRole, ProposalsStatus } from '#app/assistant/constants/assistant'
import AssistantMessage from '#app/assistant/models/assistant-message'
import { serializeMessage } from '#app/assistant/serializers/assistant-serializer'
import { ASSISTANT_NOT_FOUND, assistantEnabled } from '#app/assistant/services/assistant-flag'
import { findOwnedConversation } from '#app/assistant/services/owned-conversation'
import { settleProposalsInput } from '#app/assistant/validators/assistant-input'

const PROPOSALS_NOT_FOUND = { error: { message: 'Proposals not found' } } as const
const ALREADY_SETTLED = {
  error: { message: 'These proposals were already settled.', code: 'already_settled' },
} as const

/**
 * `POST /assistant/conversations/:conversationId/messages/:messageId/proposals/settle`: the owner
 * added the rules they kept from a research's proposals (with the agent conventions' own routes)
 * and says how many. Writes no rule. Session only.
 */
export default class AssistantProposalsController {
  async settle({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const conversation = await findOwnedConversation(params.conversationId, user)
    if (!conversation) return response.notFound(PROPOSALS_NOT_FOUND)
    const { added } = await request.validateUsing(settleProposalsInput)

    const outcome = await db.transaction(async (trx) => {
      const message = await AssistantMessage.query({ client: trx })
        .where('id', params.messageId)
        .where('conversationId', conversation.id)
        .where('role', AssistantRole.Assistant)
        .forUpdate()
        .first()
      if (!message?.proposals) return null
      if (message.proposals.status === ProposalsStatus.Settled) return 'settled' as const
      message.proposals = { ...message.proposals, status: ProposalsStatus.Settled, added }
      await message.save()
      return message
    })
    if (outcome === null) return response.notFound(PROPOSALS_NOT_FOUND)
    if (outcome === 'settled') return response.conflict(ALREADY_SETTLED)
    return response.ok({ message: serializeMessage(outcome) })
  }
}
