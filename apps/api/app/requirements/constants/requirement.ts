/** The quality a requirement is about. */
export const RequirementCategory = {
  Performance: 'performance',
  Availability: 'availability',
  Security: 'security',
  Cost: 'cost',
  Evolvability: 'evolvability',
  Constraint: 'constraint',
} as const
export type RequirementCategory = (typeof RequirementCategory)[keyof typeof RequirementCategory]
export const REQUIREMENT_CATEGORIES = Object.values(RequirementCategory)

export const RequirementPriority = { Must: 'must', Should: 'should' } as const
export type RequirementPriority = (typeof RequirementPriority)[keyof typeof RequirementPriority]
export const REQUIREMENT_PRIORITIES = Object.values(RequirementPriority)

export const REQUIREMENT_LIMITS = {
  statementLength: 500,
  measureLength: 300,
  /** A project holds at most this many. */
  perProject: 100,
} as const
