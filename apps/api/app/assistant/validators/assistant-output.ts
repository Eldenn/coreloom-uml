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
