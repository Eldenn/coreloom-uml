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

/** `POST /assistant/files/digest`: the notes as a message's file, and how the reading went. */
/** `POST /assistant/conversations/:conversationId/files`: never the text or its summaries. */
export type AttachFileOutput = {
  file: {
    id: number
    name: string
    /** Its length, in characters. */
    chars: number
    parts: number
    /** Parts the model could not summarize: read only through the tools and the passages. */
    failed: number
  }
}

/** `POST /assistant/conversations/:conversationId/sandbox/commands`: what the command printed. */
export type SandboxCommandOutput = { exitCode: number; output: string }

/** `POST /assistant/conversations/:conversationId/messages` */
export type ChatOutput = {
  messages: MessageOutput[]
  handoff: HandoffOutput | null
  /**
   * The model used every step it had before it was done (reading a repository, say): the screen
   * may send a continuation, and the conversation's sandbox is where it left it.
   */
  unfinished: boolean
}

/** The input the next message would use, in estimated tokens; `skipped` views did not fit. */
export type BudgetOutput = {
  system: number
  diagrams: number
  history: number
  max: number
  skipped: number[]
}

/**
 * A reading: the message and what was read for it, stored (none when the message needs nothing
 * read), and whether it used every step (the screen may send a continuation).
 */
export type ReadingOutput = { messages: MessageOutput[]; unfinished: boolean }

export type AskAssistantOutput = {
  messages: MessageOutput[]
  budget: BudgetOutput
  /** The ids of the views left out of this call because they did not fit. */
  skipped: number[]
}
