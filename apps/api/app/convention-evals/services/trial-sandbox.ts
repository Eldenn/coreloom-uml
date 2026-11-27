import { cp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import type { FinalState, TrialGrades } from '@coreloom-uml/catalog/evals'
import { z } from 'zod'
import { CONVENTION_EVAL_LIMITS } from '#app/convention-evals/constants/convention-evals'
import { EVAL_SANDBOX_PATHS } from '#app/convention-evals/constants/eval-sandbox'
import {
  BASE_ENVS,
  DENY_SUDO,
  GRADE,
  SETUP,
  STOP_AGENT,
} from '#app/convention-evals/services/eval-commands'
import EvalSandboxes, { type OpenEvalSandbox } from '#app/convention-evals/services/eval-sandbox'
import { packFolder } from '#app/convention-evals/services/grader-bundle'

const gradeSchema = z.object({
  verdict: z.enum(['pass', 'fail', 'not-applicable']),
  reason: z.string().max(10_000),
})
const gradesSchema = z.object({ success: gradeSchema, compliance: gradeSchema })

/** A trial's workspace (`repo` and its bare `origin.git`) as the sandbox unpacks it. */
export async function packWorkspace(state: FinalState, stage: string): Promise<Buffer> {
  await mkdir(stage, { recursive: true })
  try {
    // Symbolic links are copied as links, never followed: nothing outside the state is read.
    await cp(state.root, join(stage, 'repo'), { recursive: true, verbatimSymlinks: true })
    await cp(state.remote, join(stage, 'origin.git'), { recursive: true, verbatimSymlinks: true })
    return await packFolder(stage, ['repo', 'origin.git'])
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}

/**
 * A new sandbox for a trial, cut off every network (confirmed) and holding the workspace, or
 * null when E2B could not give one. It renews itself every `sandboxRenewMs` until `close`, so it
 * ends `sandboxTimeoutMs` after its last renewal should this process die.
 */
export async function openTrialSandbox(
  meta: { runId: number; accountId: number },
  workspace: Buffer,
): Promise<{ sandbox: OpenEvalSandbox; close(): Promise<void> } | null> {
  const sandboxes = await app.container.make(EvalSandboxes)
  const sandbox = await sandboxes.create(meta)
  if (!sandbox) return null
  const renewal = setInterval(() => {
    void sandbox.renew()
  }, CONVENTION_EVAL_LIMITS.sandboxRenewMs)
  const close = async () => {
    clearInterval(renewal)
    await sandbox.kill()
  }
  const ready =
    (await sandbox.isolate()) &&
    (
      await sandbox.run(
        DENY_SUDO,
        {},
        { user: 'root', timeoutMs: CONVENTION_EVAL_LIMITS.sandboxAdminMs },
      )
    ).exitCode === 0 &&
    (await sandbox.upload(EVAL_SANDBOX_PATHS.trialArchive, workspace)) &&
    (await sandbox.run(SETUP, { ...BASE_ENVS })).exitCode === 0
  if (!ready) {
    await close()
    return null
  }
  return { sandbox, close }
}

/**
 * Grades the trial in its sandbox: whatever the model left running is stopped, the trial is
 * handed to root, and the graders run there on the agent's repository and code. Null when they
 * did not answer.
 */
export async function gradeInSandbox(
  sandbox: OpenEvalSandbox,
  input: { taskId: string; base: string; graderArchive: Buffer },
): Promise<TrialGrades | null> {
  const stopped = await sandbox.run(
    STOP_AGENT,
    {},
    { user: 'root', timeoutMs: CONVENTION_EVAL_LIMITS.sandboxAdminMs },
  )
  if (stopped.exitCode !== 0) return null
  if (!(await sandbox.upload(EVAL_SANDBOX_PATHS.graderArchive, input.graderArchive, 'root'))) {
    return null
  }
  const graded = await sandbox.run(
    GRADE,
    { ...BASE_ENVS, TASK_ID: input.taskId, BASE_COMMIT: input.base },
    { user: 'root', timeoutMs: (CONVENTION_EVAL_LIMITS.gradeSeconds + 15) * 1000 },
  )
  if (graded.exitCode !== 0) return null
  try {
    const parsed = gradesSchema.safeParse(JSON.parse(graded.output.trim()))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
