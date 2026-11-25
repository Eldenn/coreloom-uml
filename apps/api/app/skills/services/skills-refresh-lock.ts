import redis from '@adonisjs/redis/services/main'
import { SKILLS_REFRESH_LOCK_SECONDS } from '#app/skills/constants/skill'

const KEY = 'skills:refresh:asked'

/**
 * Takes the one slot of a search the admin asks for: false while one asked earlier has not ended.
 * `RefreshSkillsJob` gives it back when it ends; the key ends by itself otherwise.
 */
// ponytail: a weekly run started by the scheduler does not hold it, so the admin can queue a
// search behind one; have the job take the lock itself if two in a row ever cost too much.
export async function acquireSkillsRefresh(): Promise<boolean> {
  return (await redis.set(KEY, '1', 'EX', SKILLS_REFRESH_LOCK_SECONDS, 'NX')) === 'OK'
}

export async function releaseSkillsRefresh(): Promise<void> {
  await redis.del(KEY)
}
