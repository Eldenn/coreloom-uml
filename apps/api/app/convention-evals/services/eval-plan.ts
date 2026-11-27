import type { AcceptedRule } from '@coreloom-uml/catalog'
import { Condition, EVAL_TASKS, type EvalTask } from '@coreloom-uml/catalog/evals'
import { type ProviderSettings, requiresApiKey } from '@coreloom-uml/llm'
import type AgentConfig from '#app/agent-configs/models/agent-config'
import { heldReadyRules } from '#app/agent-configs/serializers/agent-config-serializer'
import {
  CLI_AGENTS,
  CONVENTION_EVAL_LIMITS,
  EVAL_AGENT_LABELS,
  EvalAgent,
  EvalPath,
  EvalRefusal,
} from '#app/convention-evals/constants/convention-evals'
import { EVAL_PRICES_CHECKED_ON } from '#app/convention-evals/constants/eval-prices'
import { cliPathEnabled } from '#app/convention-evals/services/cli-path'
import { priceOf, roundUsd, trialEstimate } from '#app/convention-evals/services/eval-cost'
import { providerProblem } from '#app/llm/services/language-models'
import type { ProviderKind } from '#app/llm-connections/constants/llm-connections'
import { resolveCredential } from '#app/llm-connections/services/llm-credential'
import type User from '#app/users/models/user'

/** A user's short test: `none` against `full`. */
export const EVAL_CONDITIONS = [Condition.None, Condition.Full] as const

export type EvalRoute = { path: EvalPath; agent: EvalAgent; providerHost: string | null }

/**
 * Which path serves a kind: a saved Anthropic or OpenAI key drives that provider's coding agent
 * CLI (path I); every other kind, subscriptions included, goes through our harness (path II).
 */
export function routeOf(kind: ProviderKind): EvalRoute {
  const cli = CLI_AGENTS[kind]
  if (cli) return { path: EvalPath.Cli, agent: cli.agent, providerHost: cli.providerHost }
  return { path: EvalPath.Harness, agent: EvalAgent.Harness, providerHost: null }
}

const sameRule = (a: Pick<AcceptedRule, 'slot' | 'rule'>, b: Pick<AcceptedRule, 'slot' | 'rule'>) =>
  a.slot === b.slot && a.rule === b.rule

/** Every rule a task grades, once each. */
export function testableRules(): { slot: string; rule: string }[] {
  const rules: { slot: string; rule: string }[] = []
  for (const task of EVAL_TASKS) {
    if (!rules.some((rule) => sameRule(rule, task.rule))) {
      rules.push({ slot: task.rule.slot, rule: task.rule.rule })
    }
  }
  return rules
}

/** The tasks that grade a rule the configuration holds. */
export function tasksFor(held: readonly Pick<AcceptedRule, 'slot' | 'rule'>[]): EvalTask[] {
  return EVAL_TASKS.filter((task) => held.some((rule) => sameRule(rule, task.rule)))
}

export type EvalPlan = {
  path: EvalPath
  agent: EvalAgent
  label: string
  /** The held ready-made rules that have a task. */
  rules: { slot: string; rule: string }[]
  tasks: { id: string; slot: string; rule: string; polarity: string }[]
  conditions: readonly string[]
  attempts: number
  trials: number
  /** [p50, p90] in US dollars; null for a kind with no price table (capped in tokens). */
  estimate: { lowUsd: number; highUsd: number } | null
  pricesCheckedOn: string
  capUsd: number
  maxTokens: number
  /** Why it cannot run, or null. */
  refusal: EvalRefusal | null
  /** Every rule a task grades today, for the screen to say what can be tested. */
  testable: { slot: string; rule: string }[]
}

/**
 * What a test of this configuration with this provider would run, and why it cannot when it
 * cannot. `notFound` for a subscription kind behind an off flag (the caller answers 404). Reads
 * whether a credential is there, never the credential itself.
 */
export async function planEval(
  config: AgentConfig,
  provider: ProviderSettings,
  user: User,
): Promise<EvalPlan | { notFound: true }> {
  await config.load('readyRules')
  const held = heldReadyRules(config.readyRules)
  const tasks = tasksFor(held)
  const route = routeOf(provider.kind)
  const trials = tasks.length * EVAL_CONDITIONS.length * CONVENTION_EVAL_LIMITS.attempts
  const perTrial = trialEstimate(route.agent, priceOf(provider.kind, provider.model))
  const estimate = perTrial
    ? { lowUsd: roundUsd(perTrial[0] * trials), highUsd: roundUsd(perTrial[1] * trials) }
    : null

  const resolved = await resolveCredential(provider, user)
  if ('notFound' in resolved) return resolved
  const refusal = refusalOf({ tasks, provider, resolved, estimate, path: route.path })
  return {
    ...route,
    label: EVAL_AGENT_LABELS[route.agent],
    rules: held
      .filter((rule) => tasks.some((task) => sameRule(task.rule, rule)))
      .map(({ slot, rule }) => ({ slot, rule })),
    tasks: tasks.map((task) => ({
      id: task.id,
      slot: task.rule.slot,
      rule: task.rule.rule,
      polarity: task.polarity,
    })),
    conditions: EVAL_CONDITIONS,
    attempts: CONVENTION_EVAL_LIMITS.attempts,
    trials,
    estimate,
    pricesCheckedOn: EVAL_PRICES_CHECKED_ON,
    capUsd: CONVENTION_EVAL_LIMITS.capUsd,
    maxTokens: CONVENTION_EVAL_LIMITS.maxTokens,
    refusal,
    testable: testableRules(),
  }
}

function refusalOf(input: {
  tasks: readonly EvalTask[]
  provider: ProviderSettings
  resolved: Exclude<Awaited<ReturnType<typeof resolveCredential>>, { notFound: true }>
  estimate: EvalPlan['estimate']
  path: EvalPath
}): EvalRefusal | null {
  if (input.tasks.length === 0) return EvalRefusal.NoTestableRule
  if (input.path === EvalPath.Cli && !cliPathEnabled()) return EvalRefusal.CliPathUnavailable
  if (!('credential' in input.resolved)) return EvalRefusal.NoCredential
  const { credential, baseUrl } = input.resolved
  const key = typeof credential === 'string' ? credential : ''
  if (requiresApiKey(input.provider.kind) && !key) return EvalRefusal.NoCredential
  const effective = baseUrl ? { ...input.provider, baseUrl } : input.provider
  if (providerProblem(effective, key)) return EvalRefusal.ProviderSettings
  if (input.estimate && input.estimate.lowUsd > CONVENTION_EVAL_LIMITS.capUsd) {
    return EvalRefusal.OverCap
  }
  return null
}
