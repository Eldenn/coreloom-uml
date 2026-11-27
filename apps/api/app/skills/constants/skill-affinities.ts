import type { AffinityDecision } from '@coreloom-uml/catalog'

/**
 * How skills are scored against the ready-made rules (`skill-rule-scores.ts`): a pair is stored
 * from `scoreFloor` (the threshold, 0.656, sits above it); two skills whose search vectors reach
 * `nearDuplicate` are one for the suggestions; a pair is proposed to the admin when the skill is
 * among the rule's `ruleTop` best skills, or the rule among the skill's `skillTop` best rules
 * (the study measured rule → skills only, `infra/skill-tagger/study/`).
 */
export const SKILL_RULE_SCORING = {
  scoreFloor: 0.5,
  nearDuplicate: 0.95,
  ruleTop: 3,
  skillTop: 10,
  /** Longest slot and rule id stored: both are short kebab-case names of the catalog. */
  keyMaxLength: 100,
} as const

/** What the admin may decide about a proposed pair (see `AffinityDecision` in the catalog). */
export const AFFINITY_DECISIONS = [
  'accepted',
  'rejected',
  'against',
] as const satisfies readonly AffinityDecision[]

/** Which proposed pairs the admin's list shows: still to decide (the default), decided, or both. */
export const AFFINITY_REVIEW_STATUSES = ['pending', 'decided', 'all'] as const

export type AffinityReviewStatus = (typeof AFFINITY_REVIEW_STATUSES)[number]
