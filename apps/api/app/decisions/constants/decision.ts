import type { POINTED_TYPES } from '#app/assistant/constants/assistant'

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
  /** Parts of views one decision names. */
  parts: 50,
  /** A project holds at most this many. */
  perProject: 100,
} as const

/** One option weighed by a decision. */
export type DecisionOption = { name: string; pros: string | null; cons: string | null }

/** A part of a view a decision names, typed and labelled as the assistant's `pointed` parts. */
export type DecisionPartType = (typeof POINTED_TYPES)[number]
export type DecisionPartRef = { diagramId: number; type: DecisionPartType; label: string }
