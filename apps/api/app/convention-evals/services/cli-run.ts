import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import { Condition, type EvalTask } from '@coreloom-uml/catalog/evals'
import { addUsage, NO_USAGE } from '@coreloom-uml/llm'
import {
  CONVENTION_EVAL_LIMITS,
  EVAL_SANDBOX_METADATA,
  EvalFailureReason,
} from '#app/convention-evals/constants/convention-evals'
import EvalSandboxes from '#app/convention-evals/services/eval-sandbox'
import HarborRunner, {
  type HarborAgent,
  type HarborProcess,
  type HarborTrialResult,
} from '#app/convention-evals/services/harbor-runner'
import type { RunLedger, TrialOutcome } from '#app/convention-evals/services/run-ledger'
import {
  gradeInSandbox,
  openTrialSandbox,
  packWorkspace,
} from '#app/convention-evals/services/trial-sandbox'

export type CliContext = {
  agent: HarborAgent
  model: string
  providerHost: string
  /** The credential, handed to Harbor's process environment and nowhere else. */
  credential: string
  tasks: readonly EvalTask[]
  files: Readonly<Record<string, string>>
  graderArchive: Buffer
  ledger: RunLedger
  dir: string
  deadline: AbortSignal
  accountId: number
}

/** Harbor ended without a result to read: the run fails as `runner_failed`. */
export class HarborRunError extends Error {
  constructor() {
    super('Harbor left no trial result')
  }
}

/** Harbor's error class names a trial's error reason is reduced to; any other is `agent_error`. */
const HARBOR_ERRORS: Readonly<Record<string, EvalFailureReason>> = {
  AgentTimeoutError: EvalFailureReason.AgentTimeout,
  EnvironmentStartTimeoutError: EvalFailureReason.SandboxUnavailable,
  VerifierTimeoutError: EvalFailureReason.GradingFailed,
}

/**
 * Path I: Harbor runs the coding agent's own CLI, one E2B sandbox per trial, the credential in
 * its process environment only. While it runs, its job folder is read for the cost so far; past
 * the cap or the hard limit, its process group is killed and the remaining trials never start.
 * Each trial's final state is then graded in a sandbox of its own, never on this worker (it holds
 * the agent's code and repository), and every text is filtered before it is stored. Whatever E2B
 * still lists for the run afterwards is killed.
 */
export async function runCli(context: CliContext): Promise<void> {
  const { ledger } = context
  const harbor = await app.container.make(HarborRunner)
  const module = await harbor.load()
  const command = await module.prepareHarborRun({
    dir: context.dir,
    agent: context.agent,
    model: context.model,
    providerHost: context.providerHost,
    trials: context.tasks.flatMap((task) =>
      [Condition.None, Condition.Full].map((condition) => ({
        task,
        condition,
        files: condition === Condition.Full ? context.files : {},
      })),
    ),
    attempts: CONVENTION_EVAL_LIMITS.attempts,
    concurrency: CONVENTION_EVAL_LIMITS.concurrency,
    runId: String(ledger.run.id),
    accountId: context.accountId,
  })

  const child = harbor.start({
    file: command.file,
    args: command.args,
    env: { ...command.env, [module.credentialEnvName(context.agent)]: context.credential },
  })
  await watch(child, context, () => module.readHarborJob(command.jobDir))

  const results = await module.readHarborJob(command.jobDir).catch(() => [] as const)
  // Harbor answered nothing and nothing stopped it: the runner failed, the run did not pass.
  if (results.length === 0 && !ledger.stopped) throw new HarborRunError()
  for (const result of results) {
    if (ledger.stopped === EvalFailureReason.Leaked) break
    if (result.usage) ledger.addUsage(result.usage)
    const task = context.tasks.find((item) => item.id === result.taskId)
    if (!task) continue
    const outcome = await gradeResult(context, task, result)
    await ledger.record(outcome)
    await ledger.save()
  }
}

/**
 * Waits for Harbor to exit, reading its job folder every `harborPollMs` for the cost of the
 * trials done so far, and kills its process group at the cap or the hard limit.
 */
async function watch(
  child: HarborProcess,
  context: CliContext,
  read: () => Promise<readonly HarborTrialResult[]>,
): Promise<void> {
  const { ledger } = context
  let killed = false
  const kill = (reason: EvalFailureReason) => {
    if (killed) return
    killed = true
    ledger.stop(reason)
    child.kill('SIGTERM')
    setTimeout(() => child.kill('SIGKILL'), CONVENTION_EVAL_LIMITS.killGraceMs).unref()
  }
  const onDeadline = () => kill(EvalFailureReason.TimeLimit)
  context.deadline.addEventListener('abort', onDeadline, { once: true })
  if (context.deadline.aborted) onDeadline()
  const poll = setInterval(() => {
    void read()
      .then((done) => {
        const usage = done.reduce(
          (sum, trial) => (trial.usage ? addUsage(sum, trial.usage) : sum),
          NO_USAGE,
        )
        // The next wave could cross the cap: Harbor cannot be told to stop starting, so it stops.
        if (ledger.wouldPassCap(CONVENTION_EVAL_LIMITS.concurrency - 1, usage)) {
          kill(EvalFailureReason.CapReached)
        }
      })
      .catch(() => undefined)
  }, CONVENTION_EVAL_LIMITS.harborPollMs)
  try {
    await child.exited
  } finally {
    clearInterval(poll)
    context.deadline.removeEventListener('abort', onDeadline)
  }
}

/** One Harbor trial as the ledger stores it: graded in a fresh sandbox, its texts unfiltered. */
async function gradeResult(
  context: CliContext,
  task: EvalTask,
  result: HarborTrialResult,
): Promise<TrialOutcome> {
  const spec = { task, condition: result.condition, attempt: result.attempt }
  const output = result.outputs.map((item) => `== ${item.path}\n${item.text}`).join('\n')
  const texts = [output, result.error ?? '']
  const errorReason = result.error
    ? (HARBOR_ERRORS[result.error] ?? EvalFailureReason.AgentError)
    : null
  if (!result.state) {
    return {
      spec,
      grades: null,
      errorReason: errorReason ?? EvalFailureReason.AgentError,
      usage: result.usage,
      durationMs: result.durationMs,
      texts,
    }
  }
  const stage = join(context.dir, `grade-${result.taskId}-${result.condition}-${result.attempt}`)
  const opened = await openTrialSandbox(
    { runId: context.ledger.run.id, accountId: context.accountId },
    await packWorkspace(result.state, stage),
  )
  let grades = null
  if (opened) {
    try {
      grades = await gradeInSandbox(opened.sandbox, {
        taskId: task.id,
        base: result.state.base,
        graderArchive: context.graderArchive,
      })
    } finally {
      await opened.close()
    }
  }
  return {
    spec,
    grades,
    errorReason: errorReason ?? (grades ? null : EvalFailureReason.GradingFailed),
    usage: result.usage,
    durationMs: result.durationMs,
    texts,
  }
}

/** Kills whatever E2B still lists for this run, running or paused, by our metadata. */
export async function killRunSandboxes(runId: number): Promise<number> {
  const sandboxes = await app.container.make(EvalSandboxes)
  const listed = await sandboxes
    .list({
      [EVAL_SANDBOX_METADATA.purposeKey]: EVAL_SANDBOX_METADATA.purpose,
      [EVAL_SANDBOX_METADATA.runKey]: String(runId),
    })
    .catch(() => [])
  const ids = [...new Set(listed.map((item) => item.sandboxId))]
  await Promise.all(ids.map((id) => sandboxes.kill(id)))
  return ids.length
}
