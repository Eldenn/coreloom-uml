import type { HttpContext } from '@adonisjs/core/http'
import { ActionFailure } from '#app/assistant/constants/assistant'
import {
  ActionDecision,
  answerAction,
  assistantActionsEnabled,
} from '#app/assistant/services/assistant-actions'
import { ASSISTANT_NOT_FOUND, assistantEnabled } from '#app/assistant/services/assistant-flag'
import { findOwnedConversation } from '#app/assistant/services/owned-conversation'

const ACTION_NOT_FOUND = { error: { message: 'Action not found' } } as const

/**
 * Accepts or rejects an action an assistant message proposed on the account's work (behind
 * `diagram-assistant` and `assistant-actions`). Session only. An accepted action runs through the
 * service of its route; one that cannot be applied is stored `failed` and answered 409
 * (`not_found`, `conflict`), 422 (`invalid`) or 503 (`unavailable`: what it was to start after
 * the commit, a queued job, could not be started) with the action.
 */
export default class AssistantActionsController {
  /** `POST /assistant/conversations/:conversationId/messages/:messageId/actions/:index/accept` */
  accept(ctx: HttpContext) {
    return this.answer(ctx, ActionDecision.Accept)
  }

  /** `POST /assistant/conversations/:conversationId/messages/:messageId/actions/:index/reject` */
  reject(ctx: HttpContext) {
    return this.answer(ctx, ActionDecision.Reject)
  }

  private async answer({ params, auth, response }: HttpContext, decision: ActionDecision) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user)) || !(await assistantActionsEnabled(user)))
      return response.notFound(ASSISTANT_NOT_FOUND)
    const conversation = await findOwnedConversation(params.conversationId, user)
    if (!conversation) return response.notFound(ACTION_NOT_FOUND)

    const outcome = await answerAction(
      decision,
      {
        conversationId: conversation.id,
        messageId: Number(params.messageId),
        index: Number(params.index),
      },
      user,
    )
    if ('notFound' in outcome) return response.notFound(ACTION_NOT_FOUND)
    if ('conflict' in outcome)
      return response.conflict({ error: outcome.conflict, action: outcome.action })
    if ('failed' in outcome) {
      const body = { error: outcome.failed, action: outcome.action }
      if (outcome.failed.code === ActionFailure.Invalid) return response.unprocessableEntity(body)
      if (outcome.failed.code === ActionFailure.Unavailable)
        return response.serviceUnavailable(body)
      return response.conflict(body)
    }
    return response.ok({ action: outcome.action })
  }
}
