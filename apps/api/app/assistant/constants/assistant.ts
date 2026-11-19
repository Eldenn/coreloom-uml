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
/** Above anything one research can propose: the count a settle may report. */
export const PROPOSALS_ADDED_MAX = 1000
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
  /** The ready-made rules proposed, without the evidence an import answers them with. */
  ready: Omit<AgentImportOutput['ready'][number], 'evidence'>[]
  rules: AgentImportOutput['rules']
  truncated: boolean
  status: ProposalsStatus
  /** How many rules the owner added, once settled. */
  added: number | null
}

/** What an assistant action targets or created, and the pages a message can be written from. */
export const AssistantTargetKind = {
  Project: 'project',
  Architecture: 'architecture',
  AgentConfig: 'agent-config',
} as const
export type AssistantTargetKind = (typeof AssistantTargetKind)[keyof typeof AssistantTargetKind]
export const ASSISTANT_TARGET_KINDS = Object.values(AssistantTargetKind)

export const ActionStatus = {
  Pending: 'pending',
  Accepted: 'accepted',
  Rejected: 'rejected',
  Failed: 'failed',
} as const
export type ActionStatus = (typeof ActionStatus)[keyof typeof ActionStatus]

/** Why an accepted action could not be applied. */
export const ActionFailure = {
  /** Its target is gone, or is not the caller's. */
  NotFound: 'not_found',
  /** Its input no longer passes the checks of the route it goes through. */
  Invalid: 'invalid',
  Conflict: 'conflict',
} as const
export type ActionFailure = (typeof ActionFailure)[keyof typeof ActionFailure]

/**
 * What an action takes with it (a deletion's content, the oldest generation a new one drops),
 * counted when it is proposed and again when it is accepted: a card never deletes more than it says.
 */
export const ActionImpact = {
  Architectures: 'architectures',
  Diagrams: 'diagrams',
  AgentConfigs: 'agentConfigs',
  CodeMaps: 'codeMaps',
  CodeReviews: 'codeReviews',
  Rules: 'rules',
  ReadyRules: 'readyRules',
  Roles: 'roles',
  Generations: 'generations',
  /** The oldest generations a new one drops, past `AGENT_GENERATIONS_KEPT`. */
  DroppedGenerations: 'droppedGenerations',
} as const
export type ActionImpact = (typeof ActionImpact)[keyof typeof ActionImpact]

/**
 * A change the assistant proposed on a project, an architecture or agent conventions, as stored
 * in `assistant_messages.actions`: nothing is written before the owner accepts it. `subject` is
 * the display name of what it targeted when proposed (null for a creation). It never holds a
 * share link, a share token or an access code.
 */
export type StoredAction = {
  name: string
  input: Record<string, unknown>
  subject: string | null
  destructive: boolean
  status: ActionStatus
  /** What an accepted action created or changed; null for a deletion (its target is gone). */
  result: { kind: AssistantTargetKind; id: number } | null
  failure: ActionFailure | null
  /** Non-zero counts of what goes with it; absent from actions stored before it existed. */
  impact?: Partial<Record<ActionImpact, number>> | null
  /**
   * The state the action changes, when proposed (a visibility, a revision, a role's fingerprint);
   * absent before it existed.
   */
  before?: string | null
}

/** Where a plain message goes instead when the model hands it over (a route tool). */
export const HandoffKind = { Diagrams: 'diagrams', Web: 'web' } as const
export type HandoffKind = (typeof HandoffKind)[keyof typeof HandoffKind]
