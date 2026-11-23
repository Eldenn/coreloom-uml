export const DecisionStatus = {
  Proposed: 'proposed',
  Accepted: 'accepted',
  Superseded: 'superseded',
} as const
export type DecisionStatus = (typeof DecisionStatus)[keyof typeof DecisionStatus]
export const DECISION_STATUSES = Object.values(DecisionStatus)

export const DECISION_LIMITS = {
  titleLength: 160,
  textLength: 4000,
  optionNameLength: 120,
  optionTextLength: 1000,
  options: 5,
  /** Requirements, and diagrams, one decision names. */
  links: 50,
  /** A project holds at most this many. */
  perProject: 100,
} as const

/** One option weighed by a decision. */
export type DecisionOption = { name: string; pros: string | null; cons: string | null }
