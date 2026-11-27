import { describe, expect, it } from 'vitest'

import {
  activeRunId,
  durationParts,
  evalBlocker,
  type EvalTrial,
  heldCell,
  isRunActive,
  isSubscriptionKind,
  isUnverifiedKind,
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

describe('evalBlocker, a run still going', () => {
  const provider = { kind: 'anthropic' as const, model: 'claude-sonnet-5-5' }

  it('blocks a start while a run is going, after what the owner must change', () => {
    expect(evalBlocker(provider, { refusal: null }, false, true)).toEqual({ kind: 'busy' })
    expect(evalBlocker(provider, { refusal: 'over_cap' }, false, true)).toEqual({
      kind: 'refused',
      refusal: 'over_cap',
    })
  })
})

describe('activeRunId', () => {
  it('picks the newest run still going, or none', () => {
    expect(
      activeRunId([
        { id: 9, status: 'done' },
        { id: 8, status: 'running' },
        { id: 7, status: 'queued' },
      ]),
    ).toBe(8)
    expect(activeRunId([{ id: 9, status: 'failed' }])).toBeNull()
    expect(activeRunId([])).toBeNull()
  })
})

describe('heldCell', () => {
  it('writes no ratio when nothing was graded, and counts what k leaves out', () => {
    expect(heldCell({ held: 0, graded: 0, notApplicable: 0 }, 2)).toEqual({
      ratio: null,
      notApplicable: 0,
      ungraded: 2,
    })
    expect(heldCell({ held: 2, graded: 2, notApplicable: 0 }, 3)).toEqual({
      ratio: { held: 2, graded: 2 },
      notApplicable: 0,
      ungraded: 1,
    })
    expect(heldCell({ held: 1, graded: 2, notApplicable: 1 }, 3).ungraded).toBe(0)
  })
})

// QA's cases for PR #152.
let nextId = 1

function qaTrial(
  condition: string,
  success: string | null,
  compliance: string | null,
  taskId = 'commit-conventional',
): EvalTrial {
  return {
    id: nextId++,
    taskId,
    rule: { slot: 'git.commit-messages', rule: 'conventional' },
    condition,
    attempt: 1,
    success: success === null ? null : { verdict: success, reason: '' },
    compliance: compliance === null ? null : { verdict: compliance, reason: '' },
    errorReason: success === null && compliance === null ? 'agent_error' : null,
    tokens: NO_TOKENS,
    costUsd: null,
    durationMs: 1000,
    output: null,
  }
}

/** The conditions of the first task of the first rule. */
function firstConditions(trials: EvalTrial[]) {
  return ruleResults(trials).flatMap((rule) => rule.tasks.slice(0, 1))[0]?.conditions ?? []
}

describe('ruleResults, edge cases', () => {
  it('orders none, full, then an unknown condition, whatever the order trials ran in', () => {
    const conditions = firstConditions([
      qaTrial('partial', 'pass', 'pass'),
      qaTrial('full', 'pass', 'pass'),
      qaTrial('none', 'pass', 'fail'),
    ])
    expect(conditions.map((c) => c.condition)).toEqual(['none', 'full', 'partial'])
  })

  it('never lets a task passed hide a rule broken: success and compliance stay independent', () => {
    const full = firstConditions([
      qaTrial('full', 'pass', 'fail'),
      qaTrial('full', 'pass', 'fail'),
      qaTrial('full', 'pass', 'fail'),
    ]).at(0)
    expect(full?.success).toEqual({ held: 3, graded: 3, notApplicable: 0 })
    expect(full?.compliance).toEqual({ held: 0, graded: 3, notApplicable: 0 })
  })

  it('counts a trial graded on one side only as graded, not as ungraded', () => {
    const none = firstConditions([qaTrial('none', 'pass', null)]).at(0)
    expect(none?.ungraded).toBe(0)
    expect(none?.success.graded).toBe(1)
    expect(none?.compliance).toEqual({ held: 0, graded: 0, notApplicable: 0 })
  })

  it('a condition whose every trial is ungraded has k = 0 on both sides (the screen writes —)', () => {
    const full = firstConditions([qaTrial('full', null, null), qaTrial('full', null, null)]).at(0)
    expect(full).toMatchObject({ trials: 2, ungraded: 2 })
    expect(full?.success.graded).toBe(0)
    expect(full?.compliance.graded).toBe(0)
  })

  it('keeps two rules of the same slot apart', () => {
    const results = ruleResults([
      qaTrial('none', 'pass', 'pass'),
      {
        ...qaTrial('none', 'pass', 'pass', 'commit-imperative'),
        rule: { slot: 'git.commit-messages', rule: 'imperative' },
      },
    ])
    expect(results.map((r) => r.rule)).toEqual(['conventional', 'imperative'])
  })
})

describe('evalBlocker precedence', () => {
  const provider = { kind: 'claude-code' as const, model: 'sonnet' }

  it('a 404 plan wins over any refusal a stale plan still holds', () => {
    expect(evalBlocker(provider, { refusal: 'over_cap' }, true)).toEqual({
      kind: 'provider-unavailable',
    })
  })

  it('no provider wins over everything', () => {
    expect(evalBlocker(null, { refusal: 'no_testable_rule' }, true, true)).toEqual({
      kind: 'no-provider',
    })
  })

  it('passes every refusal of the API through', () => {
    for (const refusal of [
      'no_testable_rule',
      'no_credential',
      'provider_settings',
      'over_cap',
    ] as const)
      expect(evalBlocker(provider, { refusal }, false)).toEqual({ kind: 'refused', refusal })
  })
})

describe('startFailure, hostile bodies', () => {
  it('reads an unknown refusal, or a non-object body, as a refusal without words', () => {
    expect(startFailure(422, { refusal: 'something_new' })).toEqual({
      kind: 'refused',
      refusal: null,
    })
    expect(startFailure(422, 'refusal')).toEqual({ kind: 'refused', refusal: null })
    expect(startFailure(422, null)).toEqual({ kind: 'refused', refusal: null })
  })
})

describe('kinds', () => {
  it('prices the two subscriptions as equivalent cost, and flags only openai-codex as unverified', () => {
    for (const kind of ['claude-code', 'openai-codex']) expect(isSubscriptionKind(kind)).toBe(true)
    for (const kind of ['anthropic', 'openai', 'mistral', 'ollama', 'openai-compatible'])
      expect(isSubscriptionKind(kind)).toBe(false)
    expect(isUnverifiedKind('openai-codex')).toBe(true)
    expect(isUnverifiedKind('claude-code')).toBe(false)
  })
})

describe('the failure reasons stay in step with the API', () => {
  it('has words for every EvalFailureReason the API declares', () => {
    // Copied from apps/api/app/convention-evals/constants/convention-evals.ts (EvalFailureReason),
    // which the web cannot import (it reads `#app/...`): change both together.
    const api = [
      'cap_reached',
      'time_limit',
      'leaked',
      'interrupted',
      'sandbox_unavailable',
      'runner_failed',
      'grading_failed',
      'agent_error',
      'agent_timeout',
      'credential_unavailable',
      'nothing_to_test',
    ]
    for (const reason of api) expect(knownFailureReason(reason)).toBe(reason)
  })
})

describe('runDurationMs, bad clocks', () => {
  it('never answers a negative duration (clock skew) nor NaN (bad date)', () => {
    expect(
      runDurationMs({ startedAt: '2026-11-27T10:00:10Z', endedAt: '2026-11-27T10:00:00Z' }, 0),
    ).toBe(0)
    expect(runDurationMs({ startedAt: 'not a date', endedAt: null }, 0)).toBeNull()
  })
})
