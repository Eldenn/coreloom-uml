import { EVAL_AGENT_LABELS } from '#app/convention-evals/constants/convention-evals'
import type ConventionEvalRun from '#app/convention-evals/models/convention-eval-run'
import type ConventionEvalTrial from '#app/convention-evals/models/convention-eval-trial'
import type {
  ConventionEvalRunOutput,
  ConventionEvalTrialOutput,
} from '#app/convention-evals/validators/convention-evals-output'

export function serializeConventionEvalRun(run: ConventionEvalRun): ConventionEvalRunOutput {
  return {
    id: run.id,
    agentConfigId: run.agentConfigId,
    path: run.path,
    agent: run.agent,
    label: EVAL_AGENT_LABELS[run.agent],
    providerKind: run.providerKind,
    model: run.model,
    status: run.status,
    failureReason: run.failureReason,
    capUsd: run.capUsd,
    estimate:
      run.estimateLowUsd === null || run.estimateHighUsd === null
        ? null
        : { lowUsd: run.estimateLowUsd, highUsd: run.estimateHighUsd },
    pricesCheckedOn: run.pricesCheckedOn,
    costUsd: run.costUsd,
    tokens: {
      input: run.inputTokens,
      cachedInput: run.cachedInputTokens,
      cacheWrite: run.cacheWriteTokens,
      output: run.outputTokens,
    },
    trialCount: run.trialCount,
    configRevision: run.configRevision,
    catalogVersion: run.catalogVersion,
    startedAt: run.startedAt?.toISO() ?? null,
    endedAt: run.endedAt?.toISO() ?? null,
    createdAt: run.createdAt.toISO() ?? '',
  }
}

const grade = (verdict: string | null, reason: string | null) =>
  verdict === null ? null : { verdict, reason: reason ?? '' }

export function serializeConventionEvalTrial(
  trial: ConventionEvalTrial,
): ConventionEvalTrialOutput {
  return {
    id: trial.id,
    taskId: trial.taskId,
    rule: { slot: trial.ruleSlot, rule: trial.ruleId },
    condition: trial.condition,
    attempt: trial.attempt,
    success: grade(trial.successVerdict, trial.successReason),
    compliance: grade(trial.complianceVerdict, trial.complianceReason),
    errorReason: trial.errorReason,
    tokens: {
      input: trial.inputTokens,
      cachedInput: trial.cachedInputTokens,
      cacheWrite: trial.cacheWriteTokens,
      output: trial.outputTokens,
    },
    costUsd: trial.costUsd,
    durationMs: trial.durationMs,
    output: trial.output,
  }
}
