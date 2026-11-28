import logger from '@adonisjs/core/services/logger'
import { CATALOG_VERSION } from '@coreloom-uml/catalog'
import type { ProviderSettings } from '@coreloom-uml/llm'
import { DateTime } from 'luxon'
import type AgentConfig from '#app/agent-configs/models/agent-config'
import {
  EvalFailureReason,
  type EvalRefusal,
  EvalRunStatus,
} from '#app/convention-evals/constants/convention-evals'
import ConventionEvalRun from '#app/convention-evals/models/convention-eval-run'
import { acquireEvalLock, releaseEvalLock } from '#app/convention-evals/services/eval-lock'
import { type EvalPlan, planEval } from '#app/convention-evals/services/eval-plan'
import RunConventionEvalJob, {
  type RunConventionEvalJobData,
} from '#app/jobs/run-convention-eval_job'
import type User from '#app/users/models/user'

export type EvalStart =
  | { notFound: true }
  | { refusal: EvalRefusal; plan: EvalPlan }
  | { busy: true; plan: EvalPlan }
  | { runId: number; plan: EvalPlan }

/**
 * Starts a convention test of the owner's configuration, as `POST /agent-configs/:id/evals` does
 * (and `node ace evals:pilot`): the plan first (a refusal stops it), then the run row, the
 * account's slot held for that row (`busy` when another run holds it), and the job queued with
 * ids and kinds only. The caller checks ownership and the flag. `dispatch` is the job's own unless
 * the pilot command runs the job in its own process.
 */
export async function startConventionEval(
  config: AgentConfig,
  provider: ProviderSettings,
  user: User,
  dispatch: (data: RunConventionEvalJobData) => Promise<unknown> = (data) =>
    RunConventionEvalJob.dispatch(data),
): Promise<EvalStart> {
  const plan = await planEval(config, provider, user)
  if ('notFound' in plan) return plan
  if (plan.refusal) return { refusal: plan.refusal, plan }
  // The row first, so the lock holds its id: only this run may renew or free it.
  const run = await ConventionEvalRun.create({
    userId: user.id,
    agentConfigId: config.id,
    path: plan.path,
    agent: plan.agent,
    providerKind: provider.kind,
    model: provider.model,
    status: EvalRunStatus.Queued,
    failureReason: null,
    capUsd: plan.capUsd,
    estimateLowUsd: plan.estimate?.lowUsd ?? null,
    estimateHighUsd: plan.estimate?.highUsd ?? null,
    pricesCheckedOn: plan.pricesCheckedOn,
    costUsd: null,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    trialCount: plan.trials,
    // The revision tested is the one the job renders (it writes it again then).
    configRevision: config.revision,
    catalogVersion: CATALOG_VERSION,
    startedAt: null,
    endedAt: null,
  })
  if (!(await acquireEvalLock(user.id, plan.path, String(run.id)))) {
    await run.delete()
    return { busy: true, plan }
  }
  try {
    // Ids and kinds only: the job resolves the credential itself.
    await dispatch({ runId: run.id, provider: { kind: provider.kind, model: provider.model } })
  } catch (error) {
    run.status = EvalRunStatus.Failed
    run.failureReason = EvalFailureReason.RunnerFailed
    run.endedAt = DateTime.now()
    await run.save().catch(() => undefined)
    await releaseEvalLock(user.id, String(run.id))
    throw error
  }
  logger.info(
    { runId: run.id, agentConfigId: config.id, kind: provider.kind, trials: plan.trials },
    'convention test queued',
  )
  return { runId: run.id, plan }
}
