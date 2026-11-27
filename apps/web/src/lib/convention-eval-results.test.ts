import { describe, expect, it } from 'vitest'

import {
  durationParts,
  evalBlocker,
  type EvalTrial,
  isRunActive,
  knownFailureReason,
  ruleResults,
  runDurationMs,
  startFailure,
  totalTokens,
} from './convention-eval-results'

const NO_TOKENS = { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 }

function trial(
  rule: string,
  condition: string,
  grades: { success: string | null; compliance: string | null },
  taskId = `${rule}-task`,
): EvalTrial {
  const { success, compliance } = grades
  return {
    id: Math.random(),
    taskId,
    rule: { slot: rule.split(':')[0] ?? rule, rule: rule.split(':')[1] ?? rule },
    condition,
    attempt: 1,
    success: success === null ? null : { verdict: success, reason: '' },
    compliance: compliance === null ? null : { verdict: compliance, reason: '' },
    errorReason: success === null ? 'agent_error' : null,
    tokens: NO_TOKENS,
    costUsd: null,
    durationMs: 1000,
    output: null,
  }
}

describe('isRunActive', () => {
  it('asks again while queued or running only', () => {
    expect(isRunActive('queued')).toBe(true)
    expect(isRunActive('running')).toBe(true)
    for (const status of ['done', 'failed', 'cancelled', 'leaked'] as const)
      expect(isRunActive(status)).toBe(false)
  })
})

describe('ruleResults', () => {
  it('counts success and compliance apart, per rule and condition, none before full', () => {
    const results = ruleResults([
      trial('git.commit-messages:conventional', 'full', { success: 'pass', compliance: 'pass' }),
      trial('git.commit-messages:conventional', 'none', { success: 'pass', compliance: 'fail' }),
      trial('git.commit-messages:conventional', 'full', { success: 'fail', compliance: 'pass' }),
      trial('git.commit-messages:conventional', 'none', {
        success: 'pass',
        compliance: 'not-applicable',
      }),
      trial('tooling.package-manager:pnpm', 'none', { success: null, compliance: null }),
    ])
    expect(results).toEqual([
      {
        slot: 'git.commit-messages',
        rule: 'conventional',
        tasks: [
          {
            taskId: 'git.commit-messages:conventional-task',
            conditions: [
              {
                condition: 'none',
                trials: 2,
                success: { held: 2, graded: 2, notApplicable: 0 },
                compliance: { held: 0, graded: 1, notApplicable: 1 },
                ungraded: 0,
              },
              {
                condition: 'full',
                trials: 2,
                success: { held: 1, graded: 2, notApplicable: 0 },
                compliance: { held: 2, graded: 2, notApplicable: 0 },
                ungraded: 0,
              },
            ],
          },
        ],
      },
      {
        slot: 'tooling.package-manager',
        rule: 'pnpm',
        tasks: [
          {
            taskId: 'tooling.package-manager:pnpm-task',
            conditions: [
              {
                condition: 'none',
                trials: 1,
                success: { held: 0, graded: 0, notApplicable: 0 },
                compliance: { held: 0, graded: 0, notApplicable: 0 },
                ungraded: 1,
              },
            ],
          },
        ],
      },
    ])
  })

  it('keeps the tasks of one rule apart, so k is the attempts of one task', () => {
    const results = ruleResults([
      trial(
        'tooling.package-manager:pnpm',
        'none',
        { success: 'pass', compliance: 'pass' },
        'pnpm-applies',
      ),
      trial(
        'tooling.package-manager:pnpm',
        'none',
        { success: 'pass', compliance: 'fail' },
        'pnpm-idle',
      ),
    ])
    expect(results).toHaveLength(1)
    expect(
      results.flatMap((rule) =>
        rule.tasks.map((task) => [task.taskId, task.conditions.map((c) => c.compliance)]),
      ),
    ).toEqual([
      ['pnpm-applies', [{ held: 1, graded: 1, notApplicable: 0 }]],
      ['pnpm-idle', [{ held: 0, graded: 1, notApplicable: 0 }]],
    ])
  })

  it('answers nothing for no trial', () => {
    expect(ruleResults([])).toEqual([])
  })
})

describe('evalBlocker', () => {
  const provider = { kind: 'anthropic' as const, model: 'claude-sonnet-5-5' }

  it('asks for a provider first', () => {
    expect(evalBlocker(null, null, false)).toEqual({ kind: 'no-provider' })
  })

  it('reads a 404 plan as a provider this account cannot use', () => {
    expect(evalBlocker(provider, null, true)).toEqual({ kind: 'provider-unavailable' })
  })

  it('passes the plan’s refusal on, and lets a plan without one start', () => {
    expect(evalBlocker(provider, { refusal: 'no_testable_rule' }, false)).toEqual({
      kind: 'refused',
      refusal: 'no_testable_rule',
    })
    expect(evalBlocker(provider, { refusal: null }, false)).toBeNull()
  })
})

describe('startFailure', () => {
  it('tells a running test, a refusal and anything else apart', () => {
    expect(startFailure(409, { error: { message: 'busy' } })).toEqual({ kind: 'busy' })
    expect(startFailure(422, { error: { message: 'x' }, refusal: 'over_cap' })).toEqual({
      kind: 'refused',
      refusal: 'over_cap',
    })
    expect(startFailure(422, { errors: [] })).toEqual({ kind: 'refused', refusal: null })
    expect(startFailure(500, null)).toEqual({ kind: 'other' })
    expect(startFailure(undefined, null)).toEqual({ kind: 'other' })
  })
})

describe('durations and tokens', () => {
  it('measures a run from its start to its end, or to now while it runs', () => {
    const startedAt = '2026-11-27T10:00:00.000Z'
    expect(runDurationMs({ startedAt: null, endedAt: null }, 0)).toBeNull()
    expect(
      runDurationMs({ startedAt, endedAt: '2026-11-27T10:12:30.000Z' }, Date.parse(startedAt)),
    ).toBe(750_000)
    expect(runDurationMs({ startedAt, endedAt: null }, Date.parse(startedAt) + 5000)).toBe(5000)
  })

  it('splits a duration into minutes and seconds', () => {
    expect(durationParts(750_400)).toEqual({ minutes: 12, seconds: 30 })
    expect(durationParts(59_600)).toEqual({ minutes: 1, seconds: 0 })
  })

  it('adds every price class of tokens', () => {
    expect(totalTokens({ input: 1, cachedInput: 20, cacheWrite: 300, output: 4000 })).toBe(4321)
  })
})

describe('knownFailureReason', () => {
  it('keeps the reasons the screen has words for', () => {
    expect(knownFailureReason('cap_reached')).toBe('cap_reached')
    expect(knownFailureReason('something_new')).toBeNull()
    expect(knownFailureReason(null)).toBeNull()
  })
})
