import { describe, expect, it } from 'vitest'

import {
  evaluateFeatureFlag,
  FEATURE_FLAG_LIMITS,
  FEATURE_FLAGS,
  FeatureFlagKey,
  type FeatureFlagRule,
  featureFlagStateSchema,
  isFeatureFlagKey,
} from './index.ts'

const rule = (over: Partial<FeatureFlagRule> = {}): FeatureFlagRule => ({
  id: 'r1',
  attribute: 'email',
  operator: 'in',
  values: ['Admin@Example.com'],
  serve: true,
  ...over,
})

describe('evaluateFeatureFlag', () => {
  it('is off when the flag is disabled, whatever the rules', () => {
    const state = { enabled: false, rollout: 100, rules: [rule()] }
    expect(evaluateFeatureFlag('f', state, { email: 'admin@example.com' })).toBe(false)
  })

  it('matches rule values without regard to case', () => {
    const state = { enabled: true, rollout: 0, rules: [rule()] }
    expect(evaluateFeatureFlag('f', state, { email: 'admin@example.com' })).toBe(true)
  })

  it('serves the first matching rule', () => {
    const state = {
      enabled: true,
      rollout: 100,
      rules: [rule({ id: 'a', serve: false }), rule({ id: 'b', serve: true })],
    }
    expect(evaluateFeatureFlag('f', state, { email: 'admin@example.com' })).toBe(false)
  })

  it('matches not-in when the attribute is missing', () => {
    const state = { enabled: true, rollout: 0, rules: [rule({ operator: 'not-in' })] }
    expect(evaluateFeatureFlag('f', state, {})).toBe(true)
  })

  it('rolls out to nobody at 0, everybody at 100, the same people twice at 50', () => {
    for (const id of ['1', '2', '3', '42', '1000']) {
      expect(evaluateFeatureFlag('f', { enabled: true, rollout: 0, rules: [] }, { id })).toBe(false)
      expect(evaluateFeatureFlag('f', { enabled: true, rollout: 100, rules: [] }, { id })).toBe(
        true,
      )
      const half = { enabled: true, rollout: 50, rules: [] }
      expect(evaluateFeatureFlag('f', half, { id })).toBe(evaluateFeatureFlag('f', half, { id }))
    }
  })
})

describe('featureFlagStateSchema', () => {
  it('refuses a rollout over 100, an unknown operator and too many rules', () => {
    expect(
      featureFlagStateSchema.safeParse({ enabled: true, rollout: 101, rules: [] }).success,
    ).toBe(false)
    expect(
      featureFlagStateSchema.safeParse({
        enabled: true,
        rollout: 0,
        rules: [{ ...rule(), operator: 'regex' }],
      }).success,
    ).toBe(false)
    const rules = Array.from({ length: FEATURE_FLAG_LIMITS.rules + 1 }, (_, i) =>
      rule({ id: `r${i}` }),
    )
    expect(featureFlagStateSchema.safeParse({ enabled: true, rollout: 0, rules }).success).toBe(
      false,
    )
  })

  it('refuses a rule on an attribute the context does not carry', () => {
    const state = {
      enabled: true,
      rollout: 0,
      rules: [{ ...rule(), attribute: 'plan', operator: 'not-in' }],
    }
    expect(featureFlagStateSchema.safeParse(state).success).toBe(false)
  })

  it('accepts every declared default state', () => {
    for (const flag of FEATURE_FLAGS) {
      expect(featureFlagStateSchema.safeParse(flag.defaultState).success).toBe(true)
    }
  })
})

describe('FEATURE_FLAGS', () => {
  it('declares each key once', () => {
    expect(FEATURE_FLAGS.map((flag) => flag.key).sort()).toEqual(
      Object.values(FeatureFlagKey).sort(),
    )
    expect(isFeatureFlagKey('llm-subscription-chatgpt')).toBe(true)
    expect(isFeatureFlagKey('diagram-assistant')).toBe(true)
    expect(isFeatureFlagKey('gone-flag')).toBe(false)
  })
})
