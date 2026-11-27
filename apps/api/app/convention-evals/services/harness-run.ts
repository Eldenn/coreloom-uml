import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Condition, createWorkspace, type EvalTask } from '@coreloom-uml/catalog/evals'
import { type LanguageModel, runCodingTrial } from '@coreloom-uml/llm'
import { EvalFailureReason } from '#app/convention-evals/constants/convention-evals'
import { BASE_ENVS, SHELL } from '#app/convention-evals/services/eval-commands'
import type { RunLedger, TrialOutcome, TrialSpec } from '#app/convention-evals/services/run-ledger'
import {
  gradeInSandbox,
  openTrialSandbox,
  packWorkspace,
} from '#app/convention-evals/services/trial-sandbox'

export type HarnessTrial = TrialSpec & { task: EvalTask }

export type HarnessContext = {
  model: LanguageModel
  trials: readonly HarnessTrial[]
  /** The configuration's files for `full`, as `workspaceFiles` lays them out. */
  files: Readonly<Record<string, string>>
  /** Its AGENTS.md, given to the model in `full` as a coding agent's instruction file. */
  agentsMd: string | null
  graderArchive: Buffer
  ledger: RunLedger
  dir: string
  /** Aborts at the job's hard limit. */
  deadline: AbortSignal
  concurrency: number
  accountId: number
}

/**
 * Path II: our loop calls the user's model from the worker, one sandbox per trial runs its
 * commands, and the trial is graded in that sandbox. At most `concurrency` trials at once; none
 * starts once the run is stopped, or when it could pass the cap. A trial under way is aborted
 * when the measured cost passes the cap or the hard limit is reached.
 */
export async function runHarness(context: HarnessContext): Promise<void> {
  const { ledger } = context
  const stopAll = new AbortController()
  const stop = (reason: EvalFailureReason) => {
    ledger.stop(reason)
    stopAll.abort()
  }
  const onDeadline = () => stop(EvalFailureReason.TimeLimit)
  context.deadline.addEventListener('abort', onDeadline, { once: true })
  if (context.deadline.aborted) onDeadline()

  let next = 0
  let running = 0
  let thrown: unknown = null
  const worker = async () => {
    while (next < context.trials.length && !ledger.stopped) {
      if (ledger.wouldPassCap(running)) {
        stop(EvalFailureReason.CapReached)
        break
      }
      const trial = context.trials[next++] as HarnessTrial
      running++
      try {
        const outcome = await runTrial(context, trial, next, stopAll.signal, () => {
          if (ledger.overCap()) stop(EvalFailureReason.CapReached)
        })
        if (!(await ledger.record(outcome))) stopAll.abort()
        await ledger.save()
      } catch (error) {
        // One trial that throws (a full disk, the database) stops them all: no sibling starts
        // another, the ones under way are aborted, and the error reaches the job once they end.
        thrown ??= error
        stop(EvalFailureReason.RunnerFailed)
      } finally {
        running--
      }
    }
  }
  try {
    await Promise.allSettled(Array.from({ length: Math.max(context.concurrency, 1) }, worker))
  } finally {
    context.deadline.removeEventListener('abort', onDeadline)
  }
  if (thrown) throw thrown
}

async function runTrial(
  context: HarnessContext,
  trial: HarnessTrial,
  index: number,
  signal: AbortSignal,
  afterUsage: () => void,
): Promise<TrialOutcome> {
  const started = performance.now()
  const failed = (errorReason: string, texts: string[] = []): TrialOutcome => ({
    spec: trial,
    grades: null,
    errorReason,
    usage: null,
    durationMs: performance.now() - started,
    texts,
  })

  // The workspace is built here from our own fixture, then lives only in the sandbox.
  const folder = join(context.dir, `trial-${String(index)}`)
  await mkdir(folder, { recursive: true })
  let base: string
  let workspace: Buffer
  try {
    const conventions = trial.condition === Condition.Full ? context.files : {}
    const state = createWorkspace(trial.task, trial.condition as Condition, folder, conventions)
    base = state.base
    workspace = await packWorkspace(state, join(folder, 'stage'))
  } finally {
    await rm(folder, { recursive: true, force: true })
  }

  const opened = await openTrialSandbox(
    { runId: context.ledger.run.id, accountId: context.accountId },
    workspace,
  )
  if (!opened) return failed(EvalFailureReason.SandboxUnavailable)
  try {
    const result = await runCodingTrial(
      context.model,
      {
        instruction: trial.task.instruction,
        agentsMd: trial.condition === Condition.Full ? context.agentsMd : null,
        run: (command) => opened.sandbox.run(SHELL, { ...BASE_ENVS, SHELL_COMMAND: command }),
        onUsage: (usage) => {
          context.ledger.addUsage(usage)
          afterUsage()
        },
      },
      { signal },
    )
    const grades = await gradeInSandbox(opened.sandbox, {
      taskId: trial.task.id,
      base,
      graderArchive: context.graderArchive,
    })
    const errorReason =
      result.failure === 'aborted'
        ? (context.ledger.stopped ?? EvalFailureReason.TimeLimit)
        : (result.failure ?? (grades ? null : EvalFailureReason.GradingFailed))
    return {
      spec: trial,
      grades,
      errorReason,
      usage: result.usage,
      durationMs: performance.now() - started,
      texts: [result.transcript],
    }
  } finally {
    await opened.close()
  }
}
