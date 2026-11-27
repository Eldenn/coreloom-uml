import type {
  EvalAgent,
  EvalPath,
  EvalRefusal,
  EvalRunStatus,
} from '#app/convention-evals/constants/convention-evals'
import type { Paginated } from '#app/shared/pagination/paginate'

/** What `GET /agent-configs/:id/evals/plan` answers. */
export type ConventionEvalPlanOutput = {
  path: EvalPath
  agent: EvalAgent
  /** What the result will say it measured. */
  label: string
  rules: { slot: string; rule: string }[]
  tasks: { id: string; slot: string; rule: string; polarity: string }[]
  conditions: string[]
  attempts: number
  trials: number
  /** [p50, p90] in US dollars; null for a kind with no price, capped in tokens. */
  estimate: { lowUsd: number; highUsd: number } | null
  pricesCheckedOn: string
  capUsd: number
  maxTokens: number
  /** Why it cannot run, or null. */
  refusal: EvalRefusal | null
  /** Every rule a task grades today. */
  testable: { slot: string; rule: string }[]
}

export type ConventionEvalStartOutput = { runId: number }

export type ConventionEvalTokensOutput = {
  input: number
  cachedInput: number
  cacheWrite: number
  output: number
}

export type ConventionEvalRunOutput = {
  id: number
  agentConfigId: number
  path: EvalPath
  agent: EvalAgent
  label: string
  providerKind: string
  model: string
  status: EvalRunStatus
  failureReason: string | null
  capUsd: number
  estimate: { lowUsd: number; highUsd: number } | null
  pricesCheckedOn: string
  costUsd: number | null
  tokens: ConventionEvalTokensOutput
  trialCount: number
  configRevision: number
  catalogVersion: string
  startedAt: string | null
  endedAt: string | null
  createdAt: string
}

export type ConventionEvalTrialOutput = {
  id: number
  taskId: string
  rule: { slot: string; rule: string }
  condition: string
  attempt: number
  success: { verdict: string; reason: string } | null
  compliance: { verdict: string; reason: string } | null
  errorReason: string | null
  tokens: ConventionEvalTokensOutput
  costUsd: number | null
  durationMs: number
  /** Filtered for secrets and capped; null when there was none, or when it leaked. */
  output: string | null
}

export type ConventionEvalRunDetailOutput = {
  run: ConventionEvalRunOutput
  trials: ConventionEvalTrialOutput[]
}

export type ConventionEvalRunListOutput = Paginated<ConventionEvalRunOutput>
