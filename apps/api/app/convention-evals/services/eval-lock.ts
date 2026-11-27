import redis from '@adonisjs/redis/services/main'
import {
  CONVENTION_EVAL_LIMITS,
  type EvalPath,
} from '#app/convention-evals/constants/convention-evals'

function lockKey(userId: number): string {
  return `convention-evals:running:${String(userId)}`
}

/** The account lock's Redis key, for the specs to read its TTL or free it. */
export const evalLockKey = lockKey

/** How long the account lock lives: the job's hard limit on that path, plus a margin. */
export function lockSeconds(path: EvalPath): number {
  return Math.ceil(
    (CONVENTION_EVAL_LIMITS.hardLimitMs[path] + CONVENTION_EVAL_LIMITS.lockMarginMs) / 1000,
  )
}

/** Sets the key to its holder for `ARGV[2]` seconds when it is free or already that holder's. */
const RENEW = `
local held = redis.call('GET', KEYS[1])
if held == false or held == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]))
  return 1
end
return 0
`

/** Deletes the key only while it is still that holder's. */
const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`

/**
 * Takes the account's one convention test slot for `holder` (the run's id): false when a test
 * already holds it. Taken by the route, renewed for the whole hard limit when the job starts
 * (`renewEvalLock`, since a run may wait in the queue first) and given back by the job's
 * `finally`. The key ends by itself, so a worker that dies mid-run never locks the account out,
 * and only its holder may renew or delete it, so a run whose key expired never frees another's.
 */
export async function acquireEvalLock(
  userId: number,
  path: EvalPath,
  holder: string,
): Promise<boolean> {
  return (await redis.set(lockKey(userId), holder, 'EX', lockSeconds(path), 'NX')) === 'OK'
}

/** Holds the slot for `holder` from now for the path's whole lock; false when another holds it. */
export async function renewEvalLock(
  userId: number,
  path: EvalPath,
  holder: string,
): Promise<boolean> {
  const done = await redis.eval(RENEW, 1, lockKey(userId), holder, String(lockSeconds(path)))
  return Number(done) === 1
}

/** Gives the slot back, if `holder` still holds it. */
export async function releaseEvalLock(userId: number, holder: string): Promise<void> {
  await redis.eval(RELEASE, 1, lockKey(userId), holder)
}
