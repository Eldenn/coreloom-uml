import type { CodingTrialUsage } from '@coreloom-uml/llm'
import {
  EVAL_ESTIMATE_P90_FACTOR,
  EVAL_TRIAL_TOKENS,
  type EvalAgent,
} from '#app/convention-evals/constants/convention-evals'
import {
  CLAUDE_CODE_ALIASES,
  EVAL_PRICES,
  type EvalPrice,
  PRICE_TABLE_OF,
} from '#app/convention-evals/constants/eval-prices'
import { ProviderKind } from '#app/llm-connections/constants/llm-connections'

/**
 * What one million tokens of each class cost with this provider and model, or null for a kind
 * with no price table. A model the table does not list is priced as the most expensive one it
 * does list, so the cap is never looser than the bill.
 */
export function priceOf(kind: ProviderKind, model: string): EvalPrice | null {
  const table = PRICE_TABLE_OF[kind]
  if (!table) return null
  const prices: Readonly<Record<string, EvalPrice>> = EVAL_PRICES[table]
  const id = kind === ProviderKind.ClaudeCode ? (CLAUDE_CODE_ALIASES[model] ?? model) : model
  return prices[id] ?? mostExpensive(Object.values(prices))
}

function mostExpensive(prices: readonly EvalPrice[]): EvalPrice {
  return prices.reduce((top, price) =>
    price.input + price.output > top.input + top.output ? price : top,
  )
}

/** The cost of `usage` at `price`, in US dollars. */
export function costOf(usage: CodingTrialUsage, price: EvalPrice): number {
  return (
    (usage.input * price.input +
      usage.cachedInput * price.cachedInput +
      usage.cacheWrite * price.cacheWrite +
      usage.output * price.output) /
    1_000_000
  )
}

export function totalTokens(usage: CodingTrialUsage): number {
  return usage.input + usage.cachedInput + usage.cacheWrite + usage.output
}

/** The estimated cost of one trial by this agent, [p50, p90]; null when the kind is not priced. */
export function trialEstimate(agent: EvalAgent, price: EvalPrice | null): [number, number] | null {
  if (!price) return null
  const low = costOf(EVAL_TRIAL_TOKENS[agent], price)
  return [low, low * EVAL_ESTIMATE_P90_FACTOR]
}

/** A dollar amount as stored and answered: rounded to the hundredth of a cent. */
export const roundUsd = (usd: number) => Math.round(usd * 10_000) / 10_000
