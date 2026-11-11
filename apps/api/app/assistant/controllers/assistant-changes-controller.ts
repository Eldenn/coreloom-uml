import type { HttpContext } from '@adonisjs/core/http'
import { serializeChange } from '#app/assistant/serializers/assistant-serializer'
import {
  ApplyChangeAction,
  applyChange,
  CHANGE_NOT_FOUND,
} from '#app/assistant/services/apply-change'
import { ASSISTANT_NOT_FOUND, assistantEnabled } from '#app/assistant/services/assistant-flag'
import { findOwnedConversation } from '#app/assistant/services/owned-conversation'
import { serializeDiagram } from '#app/diagrams/serializers/diagram-serializer'
import { invalidDiagram } from '#app/diagrams/services/diagram-content'

/**
 * `POST …/messages/:messageId/changes/:index/{accept,reject,undo}`: the owner's answer to a view
 * change the assistant proposed. Each answers the change and the view it left (null when none).
 */
export default class AssistantChangesController {
  accept(ctx: HttpContext) {
    return this.answer(ctx, ApplyChangeAction.Accept)
  }

  reject(ctx: HttpContext) {
    return this.answer(ctx, ApplyChangeAction.Reject)
  }

  undo(ctx: HttpContext) {
    return this.answer(ctx, ApplyChangeAction.Undo)
  }

  private async answer({ params, auth, response }: HttpContext, action: ApplyChangeAction) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const found = await findOwnedConversation(params.id, params.conversationId, user)
    if (!found) return response.notFound(CHANGE_NOT_FOUND)

    const index = Number(params.index)
    const outcome = await applyChange(action, {
      architectureId: found.architecture.id,
      conversationId: found.conversation.id,
      messageId: Number(params.messageId),
      index,
    })
    if ('notFound' in outcome) return response.notFound(CHANGE_NOT_FOUND)
    if ('invalid' in outcome) return response.unprocessableEntity(invalidDiagram(outcome.invalid))
    if ('conflict' in outcome) {
      return response.conflict({
        error: outcome.conflict,
        change: serializeChange(outcome.change, index),
      })
    }
    return response.ok({
      change: serializeChange(outcome.change, index),
      diagram: outcome.diagram ? serializeDiagram(outcome.diagram) : null,
    })
  }
}
