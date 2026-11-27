/**
 * The convention evals as the app reads them (`@coreloom-uml/catalog/evals`): the tasks, their
 * format, the workspace builder and the grading of a final state. The runners (Harbor's, under
 * `./harbor`, and the app's own harness) build on these.
 */
export { EVAL_TASKS } from '../tasks/index.ts'
export { findEvalTask, gradeTrial, type TrialGrades } from './grade.ts'
export {
  Condition,
  type EvalTask,
  type FinalState,
  type Grade,
  Polarity,
  Verdict,
} from './task.ts'
export { AGENT_CLI_PACKAGES, AGENT_CLI_VERSIONS, HARBOR_VERSION } from './versions.ts'
export {
  conventionFiles,
  createWorkspace,
  EVAL_TARGETS,
  isHookFile,
  workspaceFiles,
} from './workspace.ts'

/** The files of this folder a trial's sandbox needs to grade there (`grade-cli.ts`). */
export const GRADER_ENTRY = 'evals/src/grade-cli.ts'
