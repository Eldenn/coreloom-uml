import app from '@adonisjs/core/services/app'
import { Job } from '@nemoventures/adonis-jobs'
import type { BullJobsOptions } from '@nemoventures/adonis-jobs/types'
import { DateTime } from 'luxon'
import {
  CONVENTION_EVAL_LIMITS,
  EVAL_SANDBOX_METADATA,
  EVAL_SWEEP_SCHEDULE,
  EvalFailureReason,
  EvalRunStatus,
} from '#app/convention-evals/constants/convention-evals'
import ConventionEvalRun from '#app/convention-evals/models/convention-eval-run'
import EvalSandboxes from '#app/convention-evals/services/eval-sandbox'

/**
 * Kills every sandbox of the convention tests E2B still lists, running or paused, started more
 * than `maxAgeMs` ago: those carrying `coreloom.purpose=convention-evals` (the harness's, and
 * Harbor's through our environment class) and those carrying any `harbor.*` key (Harbor's,
 * should our metadata be missing). Driven by E2B's list, never by rows: a sandbox Harbor created
 * has no row of ours. Answers how many it killed. The job passes `EVAL_SWEEP_SCHEDULE.maxAgeMs`;
 * `node ace evals:smoke --sweep` a lower age.
 */
export async function sweepEvalSandboxes(maxAgeMs: number): Promise<number> {
  const sandboxes = await app.container.make(EvalSandboxes)
  const cutoff = Date.now() - maxAgeMs
  const ours = await sandboxes.list({
    [EVAL_SANDBOX_METADATA.purposeKey]: EVAL_SANDBOX_METADATA.purpose,
  })
  // E2B filters on a metadata value, not on a key alone: every sandbox, then read the keys here.
  // Harbor's own keys vary by version (`harbor.job_id`, `harbor.context_id`, `harbor.trial_name`).
  const all = await sandboxes.list({})
  const harbor = all.filter((item) =>
    Object.keys(item.metadata).some((key) => key.startsWith(EVAL_SANDBOX_METADATA.harborPrefix)),
  )
  const stale = [
    ...new Set(
      [...ours, ...harbor]
        .filter((item) => item.startedAt.getTime() < cutoff)
        .map((item) => item.sandboxId),
    ),
  ]
  // One kill that fails (E2B answering 500) leaves the others killed, and the next sweep retries.
  const kills = await Promise.allSettled(stale.map((id) => sandboxes.kill(id)))
  return kills.filter((kill) => kill.status === 'fulfilled').length
}

/**
 * The sweep of the convention tests (`sweepEvalSandboxes`, at `EVAL_SWEEP_SCHEDULE.maxAgeMs`). It
 * also ends the runs a dead worker left `queued` or `running` past their hard limit
 * (`interrupted`). Every ten minutes, scheduled by `node ace assistant:setup`; on the default
 * queue, so a long test never delays it.
 */
export type PruneConventionEvalSandboxesJobData = Record<string, never>

export default class PruneConventionEvalSandboxesJob extends Job<
  PruneConventionEvalSandboxesJobData,
  void
> {
  static options: BullJobsOptions = {
    attempts: 2,
    backoff: { type: 'fixed', delay: 60_000 },
    removeOnComplete: 50,
    removeOnFail: 50,
  }

  async process(): Promise<void> {
    // The runs first: a sandbox list E2B cannot give never keeps a dead worker's run open.
    const interrupted = await endAbandonedRuns()
    const killed = await sweepEvalSandboxes(EVAL_SWEEP_SCHEDULE.maxAgeMs)
    this.logger.info({ killed, interrupted }, 'convention test sandboxes swept')
  }
}

/**
 * Ends the runs a dead worker left behind (`interrupted`): a `running` one past its path's hard
 * limit and margin since it started, a `queued` one past the longest of them since it was asked
 * for. Answers how many.
 */
export async function endAbandonedRuns(): Promise<number> {
  const now = DateTime.now()
  const ago = (ms: number) => now.minus({ milliseconds: ms }).toSQL() ?? ''
  const margin = CONVENTION_EVAL_LIMITS.lockMarginMs
  const longest = Math.max(...Object.values(CONVENTION_EVAL_LIMITS.hardLimitMs))
  const updated = await ConventionEvalRun.query()
    .where((query) => {
      query.where((queued) => {
        queued.where('status', EvalRunStatus.Queued).where('createdAt', '<', ago(longest + margin))
      })
      for (const [path, limit] of Object.entries(CONVENTION_EVAL_LIMITS.hardLimitMs)) {
        query.orWhere((running) => {
          running
            .where('status', EvalRunStatus.Running)
            .where('path', path)
            .whereRaw('coalesce(started_at, created_at) < ?', [ago(limit + margin)])
        })
      }
    })
    .update({
      status: EvalRunStatus.Failed,
      failureReason: EvalFailureReason.Interrupted,
      endedAt: now.toSQL(),
    })
  return Number(updated[0] ?? 0)
}
