import { type AssistantSource, type AssistantTurn, changeLine } from '@coreloom-uml/llm'
import type Architecture from '#app/architectures/models/architecture'
import { AssistantRole } from '#app/assistant/constants/assistant'
import type AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'

export type ViewSelection = {
  message: string
  currentDiagramId: number | null
  /** The views to send; all of them when absent. The current view is always sent. */
  diagramIds?: number[]
  locale: AssistantSource['locale']
}

/** True when every id the selection names is a view of the architecture (diagrams preloaded). */
export function selectsOwnViews(architecture: Architecture, selection: ViewSelection): boolean {
  const ids = new Set(architecture.diagrams.map((diagram) => diagram.id))
  const named = [...(selection.diagramIds ?? []), selection.currentDiagramId ?? []].flat()
  return named.every((id) => ids.has(id))
}

/**
 * What `askAssistant` (and `assistantBudget`) is given for the next message: the selected views
 * as they are now, and the stored conversation, where a proposed change is one `changeLine`, never
 * its diagrams.
 */
export async function assistantSource(
  architecture: Architecture,
  conversation: AssistantConversation,
  selection: ViewSelection,
): Promise<AssistantSource> {
  const { message, currentDiagramId, diagramIds, locale } = selection
  const messages = await AssistantMessage.query()
    .where('conversationId', conversation.id)
    .orderBy('id', 'asc')

  return {
    architecture: architecture.title,
    views: architecture.diagrams
      .filter(
        (diagram) =>
          !diagramIds || diagramIds.includes(diagram.id) || diagram.id === currentDiagramId,
      )
      .map((diagram) => ({
        id: diagram.id,
        kind: diagram.kind,
        title: diagram.title,
        content: diagram.content,
        current: diagram.id === currentDiagramId,
      })),
    history: messages.map(historyTurn),
    message,
    locale,
  }
}

function historyTurn(message: AssistantMessage): AssistantTurn {
  if (message.role !== AssistantRole.Assistant) return { role: message.role, text: message.content }
  const lines = (message.changes ?? []).map((change) =>
    changeLine({ ...change, diagramId: change.diagramId ?? undefined }),
  )
  return { role: message.role, text: [message.content, ...lines].join('\n') }
}
