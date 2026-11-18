import db from '@adonisjs/lucid/services/db'
import type { DrawingResult, ProposedChange } from '@coreloom-uml/llm'
import type { UmlSpec } from '@coreloom-uml/uml'
import type Architecture from '#app/architectures/models/architecture'
import {
  ASSISTANT_TITLE_MAX_LENGTH,
  AssistantRole,
  ChangeStatus,
  type StoredChange,
} from '#app/assistant/constants/assistant'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import { storedChange } from '#app/assistant/services/stored-change'
import { CODE_MAP_LIMITS } from '#app/code-maps/constants/code-map'
import type Diagram from '#app/diagrams/models/diagram'

/**
 * A view the user's model drew from the code map, as an assistant change: a new view, with the
 * code its elements stand for. Accepting it in the assistant writes those links as confirmed.
 */
export function proposedChange(
  result: DrawingResult,
  kind: UmlSpec['kind'],
  diagrams: readonly Diagram[],
): StoredChange {
  const proposed: ProposedChange =
    'failed' in result
      ? { op: 'create', kind, title: result.title, failed: result.failed }
      : { op: 'create', kind, title: result.title, after: result.diagram, relayout: false }
  const stored = storedChange(proposed, diagrams)
  if ('failed' in result || stored.status === ChangeStatus.Failed) return stored
  const codeLinks = result.links.flatMap((link) =>
    link.elementId.length > CODE_MAP_LIMITS.elementId
      ? []
      : link.codeKeys.map((codeKey) => ({ elementId: link.elementId, codeKey })),
  )
  return codeLinks.length ? { ...stored, codeLinks } : stored
}

/**
 * A new conversation of the account's assistant holding the request and the proposed view, both
 * about the architecture, where the owner accepts or rejects it like any other change.
 */
export function createProposalConversation(input: {
  architecture: Architecture
  userId: number
  title: string
  request: string
  summary: string
  change: StoredChange
}) {
  return db.transaction(async (trx) => {
    const conversation = await AssistantConversation.create(
      {
        userId: input.userId,
        title: input.title.slice(0, ASSISTANT_TITLE_MAX_LENGTH),
      },
      { client: trx },
    )
    const asked = await AssistantMessage.create(
      {
        conversationId: conversation.id,
        architectureId: input.architecture.id,
        role: AssistantRole.User,
        content: input.request,
      },
      { client: trx },
    )
    const answered = await AssistantMessage.create(
      {
        conversationId: conversation.id,
        architectureId: input.architecture.id,
        role: AssistantRole.Assistant,
        content: input.summary,
        changes: [input.change],
      },
      { client: trx },
    )
    return { conversation, messages: [asked, answered] }
  })
}
