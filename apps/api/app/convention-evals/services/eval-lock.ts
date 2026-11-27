import redis from '@adonisjs/redis/services/main'
import {
  CONVENTION_EVAL_LIMITS,
  type EvalPath,
} from '#app/convention-evals/constants/convention-evals'

function lockKey(userId: number): string {
  return `convention-evals:running:${String(userId)}`
}

/** How long the account lock lives: the job's hard limit on that path, plus a margin. */
export function lockSeconds(path: EvalPath): number {
  return Math.ceil(
    (CONVENTION_EVAL_LIMITS.hardLimitMs[path] + CONVENTION_EVAL_LIMITS.lockMarginMs) / 1000,
  )
}

/**
 * Takes the account's one convention test slot, taken by the route and given back by the job's
 * `finally`: false when a test already runs. The key ends by itself, so a worker that dies
 * mid-run never locks the account out. It holds no value of the run.
 */
export async function acquireEvalLock(userId: number, path: EvalPath): Promise<boolean> {
  return (await redis.set(lockKey(userId), '1', 'EX', lockSeconds(path), 'NX')) === 'OK'
}

export async function releaseEvalLock(userId: number): Promise<void> {
  await redis.del(lockKey(userId))
}
