import type {
  AssistantRole,
  HandoffKind,
  StoredAction,
  StoredChange,
  StoredProposals,
} from '#app/assistant/constants/assistant'
import type { Paginated } from '#app/shared/pagination/paginate'

export type ConversationOutput = {
  id: number
  title: string
  createdAt: string
  updatedAt: string
}

export type ConversationsListOutput = Paginated<ConversationOutput>

/** A stored change without its internal base fields, plus its position in the message. */
export type ChangeOutput = Omit<
  StoredChange,
  'baseTitle' | 'baseFormat' | 'baseKind' | 'position'
> & {
  index: number
}

export type MessageOutput = {
  id: number
  role: AssistantRole
  content: string
  /** The architecture the message is about; null for none. */
  architectureId: number | null
  /** The name of the file a user message came with; null without one. */
  fileName: string | null
  changes: ChangeOutput[] | null
  proposals: StoredProposals | null
  actions: ActionOutput[] | null
  createdAt: string
}

/** A stored action plus its position in the message, `impact` and `before` always present. */
export type ActionOutput = Omit<StoredAction, 'impact' | 'before'> & {
  impact: NonNullable<StoredAction['impact']> | null
  before: string | null
  index: number
}

/** Where the plain message goes instead, when the model hands it over. */
export type HandoffOutput =
  | { kind: typeof HandoffKind.Diagrams; architectureId: number }
  | { kind: typeof HandoffKind.Web; agentConfigId: number }

/** `POST /assistant/conversations/:conversationId/messages` */
export type ChatOutput = { messages: MessageOutput[]; handoff: HandoffOutput | null }

/** The input the next message would use, in estimated tokens; `skipped` views did not fit. */
export type BudgetOutput = {
  system: number
  diagrams: number
  history: number
  max: number
  skipped: number[]
}

export type AskAssistantOutput = {
  messages: MessageOutput[]
  budget: BudgetOutput
  /** The ids of the views left out of this call because they did not fit. */
  skipped: number[]
}
