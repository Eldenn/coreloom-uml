import type { AssistantRole, StoredChange } from '#app/assistant/constants/assistant'

export type ConversationOutput = {
  id: number
  title: string
  createdAt: string
  updatedAt: string
}

/** A stored change without its internal base fields, plus its position in the message. */
export type ChangeOutput = Omit<StoredChange, 'baseTitle' | 'baseFormat'> & { index: number }

export type MessageOutput = {
  id: number
  role: AssistantRole
  content: string
  changes: ChangeOutput[] | null
  createdAt: string
}

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
