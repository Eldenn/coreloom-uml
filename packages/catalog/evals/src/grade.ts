import { EVAL_TASKS } from '../tasks/index.ts'
import { fail } from './graders.ts'
import type { EvalTask, FinalState, Grade } from './task.ts'

/** What a trial's final state is worth: whether the task was done, and whether the rule held. */
export type TrialGrades = { success: Grade; compliance: Grade }

/** The task of the suite with this id, or `null`. */
export function findEvalTask(id: string): EvalTask | null {
  return EVAL_TASKS.find((task) => task.id === id) ?? null
}

/** A grader that throws on a state it cannot read fails; it never ends the trial's grading. */
function safely(grader: EvalTask['success'], state: FinalState): Grade {
  try {
    return grader(state)
  } catch {
    return fail('the final state could not be read')
  }
}

/**
 * Both graders on a trial's final state. The graders run Git on that repository and the task's
 * hidden test on its code, both written by the agent: run this where that code can reach
 * nothing of ours (the trial's own sandbox, cut off the network; see `grade-cli.ts`).
 */
export function gradeTrial(task: EvalTask, state: FinalState): TrialGrades {
  return { success: safely(task.success, state), compliance: safely(task.compliance, state) }
}
