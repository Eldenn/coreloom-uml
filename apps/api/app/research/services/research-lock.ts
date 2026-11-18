import redis from '@adonisjs/redis/services/main'
import { RESEARCH_LOCK_SECONDS } from '#app/research/constants/research'

function lockKey(userId: number): string {
  return `research:running:${userId}`
}

/**
 * Takes the account's one research slot: false when a research is already running. The key ends
 * by itself, so a process that dies mid-research never locks the account out.
 */
export async function acquireResearch(userId: number): Promise<boolean> {
  return (await redis.set(lockKey(userId), '1', 'EX', RESEARCH_LOCK_SECONDS, 'NX')) === 'OK'
}

export async function releaseResearch(userId: number): Promise<void> {
  await redis.del(lockKey(userId))
}
