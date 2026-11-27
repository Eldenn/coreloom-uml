// Convention tests, as pure functions: whether a run is still going, the results of its trials
// counted per rule and condition ("held n/k", success and compliance apart, never one verdict),
// what keeps a test from starting, and the totals the screen shows. Kept apart from the hooks
// (`convention-evals.ts`) so they run in Node unit tests.
import type { client } from '@/lib/client'
import type { StoredProvider } from '@/lib/llm-provider-body'

export type EvalPlan = Awaited<ReturnType<typeof client.api.agentConfigs.evals.plan>>
export type EvalRunDetail = Awaited<ReturnType<typeof client.api.agentConfigs.evals.show>>
export type EvalRun = EvalRunDetail['run']
export type EvalTrial = EvalRunDetail['trials'][number]
export type EvalRunStatus = EvalRun['status']
export type EvalRefusal = NonNullable<EvalPlan['refusal']>
export type EvalTokens = EvalRun['tokens']

/** The statuses a run is still going in: the screen asks again while it is in one. */
const ACTIVE_STATUSES: readonly EvalRunStatus[] = ['queued', 'running']

export const isRunActive = (status: EvalRunStatus): boolean => ACTIVE_STATUSES.includes(status)

/** Subscriptions are not billed per token: their cost is what a key would have paid. */
const SUBSCRIPTION_KINDS: readonly string[] = ['claude-code', 'openai-codex']

export const isSubscriptionKind = (kind: string): boolean => SUBSCRIPTION_KINDS.includes(kind)

/** The fix that lets this kind carry a tool call has not been checked against the real endpoint. */
export const isUnverifiedKind = (kind: string): boolean => kind === 'openai-codex'

/** The order conditions are shown in: without the conventions, then with them. */
export const EVAL_CONDITIONS = ['none', 'full'] as const

/** One side of a trial's grade, counted over the trials of a rule and condition. */
export interface HeldCount {
  /** Trials whose grade passed. */
  held: number
  /** Trials graded pass or fail: the k of "held n/k". */
  graded: number
  /** Trials the agent did not do the part the grade is about. */
  notApplicable: number
}

export interface ConditionResult {
  condition: string
  /** Trials stored for this task and condition. */
  trials: number
  success: HeldCount
  compliance: HeldCount
  /** Trials that ended with no grade (an error, the cap, a leak). */
  ungraded: number
}

/** One task of a rule: a rule can have several (one where it applies, one where it must not). */
export interface TaskResult {
  taskId: string
  /** One per condition that has trials, `none` then `full`, then any other. */
  conditions: ConditionResult[]
}

export interface RuleResult {
  slot: string
  rule: string
  /** The tasks that grade this rule, in the order their trials ran. */
  tasks: TaskResult[]
}

const emptyCount = (): HeldCount => ({ held: 0, graded: 0, notApplicable: 0 })

function count(target: HeldCount, grade: EvalTrial['success']) {
  if (!grade) return
  if (grade.verdict === 'pass') {
    target.held++
    target.graded++
  } else if (grade.verdict === 'fail') target.graded++
  else target.notApplicable++
}

const conditionRank = (condition: string) => {
  const index = (EVAL_CONDITIONS as readonly string[]).indexOf(condition)
  return index === -1 ? EVAL_CONDITIONS.length : index
}

function conditionOf(conditions: Map<string, ConditionResult>, condition: string) {
  let result = conditions.get(condition)
  if (!result) {
    result = { condition, trials: 0, success: emptyCount(), compliance: emptyCount(), ungraded: 0 }
    conditions.set(condition, result)
  }
  return result
}

/**
 * The trials of a run, counted per rule, task (both in the order they ran) and condition: the k
 * of "held n/k" is then the attempts of one task, never two tasks added together.
 */
export function ruleResults(trials: readonly EvalTrial[]): RuleResult[] {
  const rules = new Map<
    string,
    { slot: string; rule: string; tasks: Map<string, Map<string, ConditionResult>> }
  >()
  for (const trial of trials) {
    const key = `${trial.rule.slot}\u0000${trial.rule.rule}`
    let rule = rules.get(key)
    if (!rule) {
      rule = { ...trial.rule, tasks: new Map() }
      rules.set(key, rule)
    }
    let task = rule.tasks.get(trial.taskId)
    if (!task) {
      task = new Map()
      rule.tasks.set(trial.taskId, task)
    }
    const result = conditionOf(task, trial.condition)
    result.trials++
    if (!trial.success && !trial.compliance) result.ungraded++
    count(result.success, trial.success)
    count(result.compliance, trial.compliance)
  }
  return [...rules.values()].map(({ slot, rule, tasks }) => ({
    slot,
    rule,
    tasks: [...tasks].map(([taskId, conditions]) => ({
      taskId,
      conditions: [...conditions.values()].sort(
        (a, b) => conditionRank(a.condition) - conditionRank(b.condition),
      ),
    })),
  }))
}

/** Every token a run or a trial counted, whatever its price class. */
export const totalTokens = (tokens: EvalTokens): number =>
  tokens.input + tokens.cachedInput + tokens.cacheWrite + tokens.output

/** How long a run took, or has taken so far, in milliseconds; null before it starts. */
export function runDurationMs(
  run: Pick<EvalRun, 'startedAt' | 'endedAt'>,
  now: number,
): number | null {
  if (!run.startedAt) return null
  const start = Date.parse(run.startedAt)
  const end = run.endedAt ? Date.parse(run.endedAt) : now
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return Math.max(0, end - start)
}

/** A duration as whole minutes and the seconds left, for `Intl` to write. */
export function durationParts(ms: number): { minutes: number; seconds: number } {
  const total = Math.round(ms / 1000)
  return { minutes: Math.floor(total / 60), seconds: total % 60 }
}

/** Why the screen cannot offer to start a test, before the plan is even asked for. */
export type EvalBlocker =
  | { kind: 'no-provider' }
  | { kind: 'refused'; refusal: EvalRefusal }
  /** The plan answered 404: a subscription this account cannot use here. */
  | { kind: 'provider-unavailable' }

/** What keeps a test from starting, or null when it can start. */
export function evalBlocker(
  provider: StoredProvider | null,
  plan: Pick<EvalPlan, 'refusal'> | null,
  planNotFound: boolean,
): EvalBlocker | null {
  if (!provider) return { kind: 'no-provider' }
  if (planNotFound) return { kind: 'provider-unavailable' }
  if (plan?.refusal) return { kind: 'refused', refusal: plan.refusal }
  return null
}

/** Every refusal the plan and the start answer (`EvalRefusal` in the API). */
const EVAL_REFUSALS = [
  'no_testable_rule',
  'no_credential',
  'provider_settings',
  'over_cap',
] as const satisfies readonly EvalRefusal[]

/** How a start was refused, as the screen tells it. */
export type StartFailure =
  { kind: 'busy' } | { kind: 'refused'; refusal: EvalRefusal | null } | { kind: 'other' }

/** A failed `POST /agent-configs/:id/evals`, from its status and body (a `TuyauError`'s). */
export function startFailure(status: number | undefined, body: unknown): StartFailure {
  if (status === 409) return { kind: 'busy' }
  if (status === 422) {
    const refusal = body && typeof body === 'object' && 'refusal' in body ? body.refusal : null
    return {
      kind: 'refused',
      refusal: EVAL_REFUSALS.find((known) => known === refusal) ?? null,
    }
  }
  return { kind: 'other' }
}

/** The failure reasons the screen has words for; any other reads as a generic failure. */
export const EVAL_FAILURE_REASONS = [
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
] as const
export type EvalFailureReason = (typeof EVAL_FAILURE_REASONS)[number]

export const knownFailureReason = (reason: string | null): EvalFailureReason | null =>
  reason && (EVAL_FAILURE_REASONS as readonly string[]).includes(reason)
    ? (reason as EvalFailureReason)
    : null
