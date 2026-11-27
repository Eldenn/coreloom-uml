import type { EvalTask } from '../src/task.ts'
import { commitMessagesConventional, commitMessagesImperative } from './commit-messages.ts'
import { packageManagerAdd, packageManagerIdle } from './package-manager.ts'

/** Every task of the suite, by pair: one where the graded rule matters, one where it must not act or flips. */
export const EVAL_TASKS: readonly EvalTask[] = [
  packageManagerAdd,
  packageManagerIdle,
  commitMessagesConventional,
  commitMessagesImperative,
]
