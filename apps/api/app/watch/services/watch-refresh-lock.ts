import redis from '@adonisjs/redis/services/main'
import { WATCH_REFRESH_LOCK_SECONDS } from '#app/watch/constants/watch'

const KEY = 'watch:refresh:asked'

/**
 * Takes the one slot of a run the admin asks for: false while one asked earlier has not ended.
 * `RefreshWatchJob` gives it back when it ends; the key ends by itself otherwise.
 */
export async function acquireWatchRefresh(): Promise<boolean> {
  return (await redis.set(KEY, '1', 'EX', WATCH_REFRESH_LOCK_SECONDS, 'NX')) === 'OK'
}

export async function releaseWatchRefresh(): Promise<void> {
  await redis.del(KEY)
}
