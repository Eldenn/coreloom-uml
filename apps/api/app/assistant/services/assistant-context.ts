import {
  type AssistantSource,
  type AssistantTurn,
  changeLine,
  type FilePassageText,
} from '@coreloom-uml/llm'
import type Architecture from '#app/architectures/models/architecture'
import {
  AssistantRole,
  type StoredAction,
  type StoredProposals,
} from '#app/assistant/constants/assistant'
import type AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import { conversationFiles, filesContext } from '#app/assistant/services/conversation-files'

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
 * as they are now, the stored conversation, where a proposed change is one `changeLine`, never
 * its diagrams, and the conversation's files by name and summary, with the `passages` read for
 * this message.
 */
export async function assistantSource(
  architecture: Architecture,
  conversation: AssistantConversation,
  selection: ViewSelection,
  passages: FilePassageText[] = [],
): Promise<AssistantSource> {
  const { message, currentDiagramId, diagramIds, locale } = selection
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
    history: await conversationHistory(conversation),
    files: filesContext(await conversationFiles(conversation.id)),
    passages,
    message,
    locale,
  }
}

/**
 * The stored conversation as the model reads it, whatever architecture each message is about: a
 * proposed change is one `changeLine`, a research's proposals one `proposalsLine`, the actions of
 * a message one `actionsLine`.
 */
export async function conversationHistory(
  conversation: AssistantConversation,
): Promise<AssistantTurn[]> {
  const messages = await AssistantMessage.query()
    .where('conversationId', conversation.id)
    .orderBy('id', 'asc')
  return messages.map(historyTurn)
}

function historyTurn(message: AssistantMessage): AssistantTurn {
  if (message.role !== AssistantRole.Assistant) {
    // The file itself is in <files>: the turn names it only.
    const file = message.fileName === null ? '' : `\n(attached file: ${message.fileName})`
    return { role: message.role, text: message.content + file }
  }
  const lines = (message.changes ?? []).map((change) =>
    changeLine({ ...change, diagramId: change.diagramId ?? undefined }),
  )
  if (message.proposals) lines.push(proposalsLine(message.proposals))
  if (message.actions?.length) lines.push(actionsLine(message.actions))
  return { role: message.role, text: [message.content, ...lines].filter(Boolean).join('\n') }
}

/** One history line for a research's proposals: counts only, never a rule's text or a page. */
export function proposalsLine(proposals: StoredProposals): string {
  const { ready, rules, sources, status, added, agentConfigId } = proposals
  const outcome = added === null ? status : `${status}, ${String(added)} added`
  return `proposed from a web research (${String(sources.length)} pages read): ${String(ready.length)} ready-made rules and ${String(rules.length)} other rules for agent conventions #${String(agentConfigId)} (${outcome})`
}

/** One history line for a message's actions: names and statuses, never an input or a name. */
export function actionsLine(actions: readonly StoredAction[]): string {
  return `proposed: ${actions.map((action) => `${action.name} (${action.status})`).join(', ')}`
}
