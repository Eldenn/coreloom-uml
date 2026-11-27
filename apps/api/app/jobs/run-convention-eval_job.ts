import { AGENTS_FILE, Target } from '@coreloom-uml/catalog'
import { type EvalTask, workspaceFiles } from '@coreloom-uml/catalog/evals'
import { LlmCallError, type ProviderSettings } from '@coreloom-uml/llm'
import { Job } from '@nemoventures/adonis-jobs'
import type { BullJobsOptions } from '@nemoventures/adonis-jobs/types'
import { DateTime } from 'luxon'
import AgentConfig from '#app/agent-configs/models/agent-config'
import { heldReadyRules } from '#app/agent-configs/serializers/agent-config-serializer'
import { currentInputs, render } from '#app/agent-configs/services/agent-context'
import {
  CONVENTION_EVAL_LIMITS,
  CONVENTION_EVALS_QUEUE,
  EvalAgent,
  EvalFailureReason,
  EvalPath,
  EvalRunStatus,
  SERIAL_KINDS,
} from '#app/convention-evals/constants/convention-evals'
import ConventionEvalRun from '#app/convention-evals/models/convention-eval-run'
import { killRunSandboxes, runCli } from '#app/convention-evals/services/cli-run'
import { priceOf } from '#app/convention-evals/services/eval-cost'
import {
  createRunFolder,
  purgeRunFoldersOnce,
  removeRunFolder,
} from '#app/convention-evals/services/eval-folders'
import { releaseEvalLock, renewEvalLock } from '#app/convention-evals/services/eval-lock'
import { EVAL_CONDITIONS, routeOf, tasksFor } from '#app/convention-evals/services/eval-plan'
import { buildGraderArchive } from '#app/convention-evals/services/grader-bundle'
import { type HarnessTrial, runHarness } from '#app/convention-evals/services/harness-run'
import { SecretFilter } from '#app/convention-evals/services/output-filter'
import { RunLedger } from '#app/convention-evals/services/run-ledger'
import { userLanguageModel } from '#app/llm/services/language-models'
import { resolveCredential } from '#app/llm-connections/services/llm-credential'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import User from '#app/users/models/user'

/**
 * Runs a convention test (`POST /agent-configs/:id/evals`). Its data holds ids and kinds only:
 * the credential is resolved here, in `process()`, through `resolveCredential`, and never leaves
 * this process but for Harbor's environment on path I. The configuration's files are rendered
 * now (`render`, the current catalog), the trials of its testable held rules run on the path its
 * provider's kind calls for, and every text is filtered before it is stored. The run stops at the
 * cap (`cancelled`), at the hard limit (`cancelled`, `time_limit`) or on a leak (`leaked`). The
 * account lock and the run's folder are released in a `finally`, whatever happened. Logs carry
 * ids, counts and reasons only. Never retried: a test spends the owner's money.
 */
export type RunConventionEvalJobData = {
  runId: number
  provider: { kind: ProviderSettings['kind']; model: string }
}

export default class RunConventionEvalJob extends Job<RunConventionEvalJobData, void> {
  static defaultQueue = CONVENTION_EVALS_QUEUE

  static options: BullJobsOptions = {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
  }

  /**
   * The signal that ends a run at its path's hard limit, counted from `process()`. A seam: the
   * specs give a shorter one rather than change `CONVENTION_EVAL_LIMITS`.
   */
  static deadlineOf: (path: EvalPath) => AbortSignal = (path) =>
    AbortSignal.timeout(CONVENTION_EVAL_LIMITS.hardLimitMs[path])

  async process(): Promise<void> {
    const run = await ConventionEvalRun.find(this.data.runId)
    if (!run) return
    const holder = String(run.id)
    if (run.status !== EvalRunStatus.Queued) {
      this.logger.warn({ runId: run.id, status: run.status }, 'convention test not queued')
      // Ended meanwhile (the sweep, a failed dispatch): its slot is free again, if still its.
      if (run.status !== EvalRunStatus.Running) await releaseEvalLock(run.userId, holder)
      return
    }
    let dir: string | null = null
    try {
      // The slot from now for the whole hard limit: the run may have waited in the queue.
      if (!(await renewEvalLock(run.userId, run.path, holder))) {
        return await this.end(run, EvalRunStatus.Failed, EvalFailureReason.Busy)
      }
      const user = await User.find(run.userId)
      const config = await AgentConfig.find(run.agentConfigId)
      if (!user || !config || !assertOwner(config, user)) {
        return await this.end(run, EvalRunStatus.Failed, EvalFailureReason.RunnerFailed)
      }
      await purgeRunFoldersOnce()
      run.status = EvalRunStatus.Running
      run.startedAt = DateTime.now()
      await run.save()

      dir = await createRunFolder(run.id)
      const outcome = await this.runTrials(run, user, config, dir)
      await this.end(run, outcome.status, outcome.reason)
    } catch (error) {
      const reason = error instanceof LlmCallError ? error.reason : EvalFailureReason.RunnerFailed
      // The class name only: a message may hold a path, a provider's text or worse.
      this.logger.error(
        { runId: run.id, error: error instanceof Error ? error.constructor.name : typeof error },
        'convention test failed',
      )
      await this.end(run, EvalRunStatus.Failed, reason).catch(() => undefined)
    } finally {
      if (dir) await removeRunFolder(dir).catch(() => undefined)
      if (run.path === EvalPath.Cli) await killRunSandboxes(run.id).catch(() => 0)
      await releaseEvalLock(run.userId, holder)
    }
  }

  private async runTrials(
    run: ConventionEvalRun,
    user: User,
    config: AgentConfig,
    dir: string,
  ): Promise<{ status: EvalRunStatus; reason: string | null }> {
    const provider: ProviderSettings = this.data.provider
    const route = routeOf(provider.kind)
    await config.load('readyRules')
    const tasks = tasksFor(heldReadyRules(config.readyRules))
    if (tasks.length === 0) {
      return { status: EvalRunStatus.Failed, reason: EvalFailureReason.NothingToTest }
    }

    const inputs = await currentInputs(config)
    const target = { [EvalAgent.ClaudeCode]: Target.ClaudeCode, [EvalAgent.Codex]: Target.Codex }
    const extra = route.agent === EvalAgent.Harness ? null : target[route.agent]
    const rendered = render({
      ...inputs,
      targets:
        extra && !inputs.targets.includes(extra) ? [...inputs.targets, extra] : inputs.targets,
    })
    const files = workspaceFiles(rendered.files)
    // The revision tested is the one rendered now, whatever it was when the run was asked for.
    run.configRevision = config.revision
    await run.save()
    const graderArchive = await buildGraderArchive(dir)
    const deadline = RunConventionEvalJob.deadlineOf(route.path)
    const price = priceOf(provider.kind, provider.model)

    if (route.path === EvalPath.Cli && route.agent !== EvalAgent.Harness && route.providerHost) {
      const resolved = await resolveCredential(provider, user)
      const credential =
        'credential' in resolved && typeof resolved.credential === 'string'
          ? resolved.credential
          : ''
      if (!credential) {
        return { status: EvalRunStatus.Failed, reason: EvalFailureReason.CredentialUnavailable }
      }
      const ledger = new RunLedger(run, route.agent, price, new SecretFilter([credential]))
      await runCli({
        agent: route.agent,
        model: provider.model,
        providerHost: route.providerHost,
        credential,
        tasks,
        files,
        graderArchive,
        ledger,
        dir,
        deadline,
        accountId: user.id,
      })
      return this.outcome(ledger)
    }

    const built = await userLanguageModel(provider, user)
    if (!('model' in built)) {
      const reason = 'reason' in built ? built.reason : EvalFailureReason.CredentialUnavailable
      return { status: EvalRunStatus.Failed, reason }
    }
    // No credential enters a harness sandbox; the filter still looks for every secret's shape.
    const ledger = new RunLedger(run, route.agent, price, new SecretFilter([]))
    await runHarness({
      model: built.model,
      trials: harnessTrials(tasks),
      files,
      agentsMd: files[AGENTS_FILE] ?? null,
      graderArchive,
      ledger,
      dir,
      deadline,
      concurrency: SERIAL_KINDS.includes(provider.kind) ? 1 : CONVENTION_EVAL_LIMITS.concurrency,
      accountId: user.id,
    })
    return this.outcome(ledger)
  }

  private async outcome(ledger: RunLedger) {
    await ledger.save()
    if (ledger.stopped === EvalFailureReason.Leaked) {
      return { status: EvalRunStatus.Leaked, reason: EvalFailureReason.Leaked }
    }
    if (ledger.stopped) return { status: EvalRunStatus.Cancelled, reason: ledger.stopped }
    // Nothing graded is no result: the run failed, for the reason most of its trials gave.
    if (ledger.graded === 0) {
      return {
        status: EvalRunStatus.Failed,
        reason: ledger.commonError ?? EvalFailureReason.RunnerFailed,
      }
    }
    return { status: EvalRunStatus.Done, reason: null }
  }

  /**
   * Ends the run, unless it already ended (the sweep took it for a dead worker's): a run that
   * ended stays as it ended.
   */
  private async end(run: ConventionEvalRun, status: EvalRunStatus, reason: string | null) {
    const endedAt = DateTime.now()
    const updated = await ConventionEvalRun.query()
      .where('id', run.id)
      .whereIn('status', [EvalRunStatus.Queued, EvalRunStatus.Running])
      .update({ status, failureReason: reason, endedAt: endedAt.toSQL() })
    if (Number(updated[0] ?? 0) === 0) {
      this.logger.warn({ runId: run.id, status }, 'convention test already ended')
      return
    }
    run.status = status
    run.failureReason = reason
    run.endedAt = endedAt
    const trials = await run.related('trials').query().count('* as total')
    this.logger.info(
      {
        runId: run.id,
        agentConfigId: run.agentConfigId,
        path: run.path,
        kind: run.providerKind,
        status,
        reason,
        trials: Number(trials[0]?.$extras.total ?? 0),
      },
      'convention test ended',
    )
  }
}

/** Every trial of the run, by attempt then task then condition, so a cut run stays balanced. */
export function harnessTrials(tasks: readonly EvalTask[]): HarnessTrial[] {
  const trials: HarnessTrial[] = []
  for (let attempt = 1; attempt <= CONVENTION_EVAL_LIMITS.attempts; attempt++) {
    for (const task of tasks) {
      for (const condition of EVAL_CONDITIONS) trials.push({ task, condition, attempt })
    }
  }
  return trials
}
