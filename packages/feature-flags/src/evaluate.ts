// A flag's state and how it is evaluated for a person. Ported from coreloom-ui's
// `src/components/feature-flag-rules.tsx` (rule operators, rollout bucketing, evaluation order):
// keep them in step, so the admin screen and the API agree on who gets a flag.
import { z } from 'zod'

export const FLAG_OPERATORS = ['in', 'not-in', 'contains', 'starts-with'] as const
export type FeatureFlagOperator = (typeof FLAG_OPERATORS)[number]

/** Bounds on a stored state, checked by the schema and by the API's input. */
export const FEATURE_FLAG_LIMITS = {
  rules: 20,
  values: 50,
  valueLength: 200,
  attributeLength: 50,
  ruleIdLength: 100,
} as const

export const featureFlagRuleSchema = z.object({
  id: z.string().min(1).max(FEATURE_FLAG_LIMITS.ruleIdLength),
  /** The context attribute it reads (`email`, `id`). */
  attribute: z.string().min(1).max(FEATURE_FLAG_LIMITS.attributeLength),
  operator: z.enum(FLAG_OPERATORS),
  values: z.array(z.string().max(FEATURE_FLAG_LIMITS.valueLength)).max(FEATURE_FLAG_LIMITS.values),
  /** What people matched by this rule get. */
  serve: z.boolean(),
})

export const featureFlagStateSchema = z.object({
  enabled: z.boolean(),
  /** Share of the people no rule matches who get the flag, 0 to 100. */
  rollout: z.number().int().min(0).max(100),
  rules: z.array(featureFlagRuleSchema).max(FEATURE_FLAG_LIMITS.rules),
})

export type FeatureFlagRule = z.infer<typeof featureFlagRuleSchema>
export type FeatureFlagState = z.infer<typeof featureFlagStateSchema>
export type FeatureFlagContext = Readonly<Record<string, string | undefined>>

function ruleMatches(rule: FeatureFlagRule, context: FeatureFlagContext): boolean {
  const actual = context[rule.attribute]
  if (actual === undefined) return rule.operator === 'not-in'
  const a = actual.toLowerCase()
  const values = rule.values.map((v) => v.toLowerCase())
  switch (rule.operator) {
    case 'in':
      return values.includes(a)
    case 'not-in':
      return !values.includes(a)
    case 'contains':
      return values.some((v) => a.includes(v))
    case 'starts-with':
      return values.some((v) => a.startsWith(v))
  }
}

/** A stable bucket from 0 to 99 for a flag and a person (FNV-1a, as in coreloom-ui). */
function rolloutBucket(flagKey: string, id: string): number {
  let hash = 0x811c9dc5
  for (const ch of `${flagKey}:${id}`) {
    hash ^= ch.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash % 100
}

/**
 * Whether a person gets the flag: off when disabled, else the first matching rule's value, else
 * on when their bucket (from `context.id` or `context.key`) is under the rollout percentage.
 */
export function evaluateFeatureFlag(
  flagKey: string,
  state: FeatureFlagState,
  context: FeatureFlagContext,
): boolean {
  if (!state.enabled) return false
  const rule = state.rules.find((r) => ruleMatches(r, context))
  if (rule) return rule.serve
  return rolloutBucket(flagKey, context.id ?? context.key ?? '') < state.rollout
}
