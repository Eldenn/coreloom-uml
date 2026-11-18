import type { UmlProblem, UmlSpec } from '@coreloom-uml/uml'
import type { AgentImportOutput } from '#app/agent-configs/validators/agent-configs-output'
import type { DiagramFormat, DiagramKind } from '#app/diagrams/constants/diagram'

export const AssistantRole = {
  User: 'user',
  Assistant: 'assistant',
  /** A condensed stand-in for older turns of a long conversation. */
  Summary: 'summary',
} as const
export type AssistantRole = (typeof AssistantRole)[keyof typeof AssistantRole]

export const ChangeStatus = {
  Pending: 'pending',
  Accepted: 'accepted',
  Rejected: 'rejected',
  Stale: 'stale',
  Undone: 'undone',
  Failed: 'failed',
} as const
export type ChangeStatus = (typeof ChangeStatus)[keyof typeof ChangeStatus]

export const ChangeOp = {
  Create: 'create',
  Update: 'update',
  Delete: 'delete',
} as const
export type ChangeOp = (typeof ChangeOp)[keyof typeof ChangeOp]

export const ASSISTANT_MESSAGE_MAX_LENGTH = 4000
export const ASSISTANT_TITLE_MAX_LENGTH = 200
/** A conversation without a title takes the first characters of its first message. */
export const ASSISTANT_TITLE_FROM_MESSAGE = 60

/** A diagram change the assistant proposed, as stored in `assistant_messages.changes`. */
export type StoredChange = {
  op: ChangeOp
  diagramId: number | null
  /** `null` only on a `failed` change whose kind the model left out or got wrong. */
  kind: DiagramKind | null
  title: string
  format: DiagramFormat | null
  before: UmlSpec | null
  after: UmlSpec | null
  baseVersion: number | null
  baseTitle: string | null
  baseFormat: DiagramFormat | null
  relayout: boolean
  placed: number
  status: ChangeStatus
  appliedVersion: number | null
  problems: UmlProblem[]
  /** Set when an update is accepted: the view's kind before, restored by an undo. */
  baseKind?: DiagramKind
  /** Set when a delete is accepted: where the view stood, where an undo puts it back. */
  position?: number
  /**
   * On a view drawn from a code map's process: the places of the code each element stands for,
   * stored as confirmed links of the new view when it is accepted.
   */
  codeLinks?: { elementId: string; codeKey: string }[]
}

/** The languages the assistant replies in: the interface's. */
export const ASSISTANT_LOCALES = ['en', 'fr'] as const

export const ProposalsStatus = {
  Pending: 'pending',
  /** The owner added the rules they kept (`added`, possibly none). */
  Settled: 'settled',
} as const
export type ProposalsStatus = (typeof ProposalsStatus)[keyof typeof ProposalsStatus]

/** Most pages a research's proposals keep, and the longest address and title of one. */
export const PROPOSAL_SOURCES_MAX = 50
export const PROPOSAL_SOURCE_URL_MAX_LENGTH = 2000
export const PROPOSAL_SOURCE_TITLE_MAX_LENGTH = 300

/**
 * What a web research launched from the assistant proposed, as stored in
 * `assistant_messages.proposals`: the rules and the addresses of the pages read, never a page
 * or the findings.
 */
export type StoredProposals = {
  agentConfigId: number
  sources: { url: string; title: string | null }[]
  ready: AgentImportOutput['ready']
  rules: AgentImportOutput['rules']
  truncated: boolean
  status: ProposalsStatus
  /** How many rules the owner added, once settled. */
  added: number | null
}
