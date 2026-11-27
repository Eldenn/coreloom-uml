import type { TrialGrades } from '@coreloom-uml/catalog/evals'
import { addUsage, type CodingTrialUsage, NO_USAGE } from '@coreloom-uml/llm'
import {
  CONVENTION_EVAL_LIMITS,
  EVAL_ESTIMATE_P90_FACTOR,
  EVAL_TRIAL_TOKENS,
  type EvalAgent,
  EvalFailureReason,
} from '#app/convention-evals/constants/convention-evals'
import type { EvalPrice } from '#app/convention-evals/constants/eval-prices'
import type ConventionEvalRun from '#app/convention-evals/models/convention-eval-run'
import ConventionEvalTrial from '#app/convention-evals/models/convention-eval-trial'
import { costOf, roundUsd, totalTokens } from '#app/convention-evals/services/eval-cost'
import type { SecretFilter } from '#app/convention-evals/services/output-filter'

/** One trial to run: a task in a condition, its attempt (from 1). */
export type TrialSpec = {
  task: { id: string; rule: { slot: string; rule: string }; instruction: string }
  condition: string
  attempt: number
}

/** What a trial ended with, before anything of it is filtered or stored. */
export type TrialOutcome = {
  spec: TrialSpec
  grades: TrialGrades | null
  errorReason: string | null
  usage: CodingTrialUsage | null
  durationMs: number
  /** Every text the trial produced, unfiltered: its output first, then the rest to look in. */
  texts: readonly string[]
}

const cutText = (text: string, max: number) => (text.length <= max ? text : text.slice(0, max))

/**
 * The account of one run: what it spent (measured tokens times the dated prices, or tokens alone
 * for a kind with no price), whether the next trial may start under the cap, and the trials as
 * they are stored, each filtered first. A trial whose texts hold a secret is stored with no
 * output and no reason, and the run stops (`leaked`).
 */
export class RunLedger {
  usage: CodingTrialUsage = NO_USAGE
  /** Why the run stops early, once it does: the cap, the time limit, a leak. */
  stopped: EvalFailureReason | null = null
  stored = 0

  constructor(
    readonly run: ConventionEvalRun,
    readonly agent: EvalAgent,
    readonly price: EvalPrice | null,
    readonly filter: SecretFilter,
  ) {}

  get spentUsd(): number | null {
    return this.price ? costOf(this.usage, this.price) : null
  }

  /** Counts tokens as they are measured. */
  addUsage(usage: CodingTrialUsage): void {
    this.usage = addUsage(this.usage, usage)
  }

  /** Whether what was spent already passes the cap. */
  overCap(): boolean {
    const spent = this.spentUsd
    if (spent !== null) return spent > this.run.capUsd
    return totalTokens(this.usage) > CONVENTION_EVAL_LIMITS.maxTokens
  }

  /**
   * Whether starting one more trial, with `running` others still under way, could pass the cap:
   * each counted at the upper estimate of one trial, on top of what was spent (plus `extra`,
   * measured but not counted yet).
   */
  wouldPassCap(running: number, extra: CodingTrialUsage = NO_USAGE): boolean {
    const perTrial = EVAL_TRIAL_TOKENS[this.agent]
    const ahead = (running + 1) * EVAL_ESTIMATE_P90_FACTOR
    const spent = addUsage(this.usage, extra)
    if (this.price) {
      return costOf(spent, this.price) + costOf(perTrial, this.price) * ahead > this.run.capUsd
    }
    return totalTokens(spent) + totalTokens(perTrial) * ahead > CONVENTION_EVAL_LIMITS.maxTokens
  }

  stop(reason: EvalFailureReason): void {
    this.stopped ??= reason
  }

  /** Stores the trial, filtered; answers false when it leaked (nothing of it was kept). */
  async record(outcome: TrialOutcome): Promise<boolean> {
    if (this.stopped === EvalFailureReason.Leaked) return false
    const reasons = [outcome.grades?.success.reason, outcome.grades?.compliance.reason]
    const leaked = [...outcome.texts, ...reasons].some(
      (text) => typeof text === 'string' && this.filter.leaks(text),
    )
    const usage = outcome.usage ?? NO_USAGE
    const base = {
      runId: this.run.id,
      taskId: outcome.spec.task.id,
      ruleSlot: outcome.spec.task.rule.slot,
      ruleId: outcome.spec.task.rule.rule,
      condition: outcome.spec.condition,
      attempt: outcome.spec.attempt,
      inputTokens: usage.input,
      cachedInputTokens: usage.cachedInput,
      cacheWriteTokens: usage.cacheWrite,
      outputTokens: usage.output,
      costUsd: this.price ? roundUsd(costOf(usage, this.price)) : null,
      durationMs: Math.round(outcome.durationMs),
    }
    if (leaked) {
      // Stopped before anything is awaited: a trial recorded meanwhile stores nothing.
      this.stop(EvalFailureReason.Leaked)
      await ConventionEvalTrial.create({
        ...base,
        successVerdict: null,
        successReason: null,
        complianceVerdict: null,
        complianceReason: null,
        errorReason: EvalFailureReason.Leaked,
        output: null,
      })
      return false
    }
    const max = CONVENTION_EVAL_LIMITS.reasonMaxChars
    await ConventionEvalTrial.create({
      ...base,
      successVerdict: outcome.grades?.success.verdict ?? null,
      successReason: outcome.grades ? cutText(outcome.grades.success.reason, max) : null,
      complianceVerdict: outcome.grades?.compliance.verdict ?? null,
      complianceReason: outcome.grades ? cutText(outcome.grades.compliance.reason, max) : null,
      errorReason: outcome.errorReason,
      output: cutText(outcome.texts[0] ?? '', CONVENTION_EVAL_LIMITS.outputMaxChars) || null,
    })
    this.stored++
    return true
  }

  /** Writes the totals on the run. */
  async save(): Promise<void> {
    this.run.inputTokens = this.usage.input
    this.run.cachedInputTokens = this.usage.cachedInput
    this.run.cacheWriteTokens = this.usage.cacheWrite
    this.run.outputTokens = this.usage.output
    const spent = this.spentUsd
    this.run.costUsd = spent === null ? null : roundUsd(spent)
    await this.run.save()
  }
}
