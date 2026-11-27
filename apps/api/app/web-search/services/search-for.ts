import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import redis from '@adonisjs/redis/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { isFeatureEnabled } from '#app/feature-flags/services/feature-flags'
import type User from '#app/users/models/user'
import {
  WEB_SEARCH_LIMITS,
  type WebSearchAnswer,
  WebSearchFailure,
} from '#app/web-search/constants/web-search'
import WebSearch from '#app/web-search/services/web-search'
import { webSearchKey, webSearchReady } from '#app/web-search/services/web-search-settings'

/** How long a day's counter outlives its first search: past the end of that UTC day. */
const COUNT_TTL_SECONDS = 48 * 3600

/** The Redis key counting an account's searches of the current UTC day. */
export function searchCountKey(userId: number): string {
  return `web-search:count:${userId}:${new Date().toISOString().slice(0, 10)}`
}

/** Whether a model loop may offer the search tool to this account. */
export async function webSearchOffered(user: User): Promise<boolean> {
  return (await isFeatureEnabled(FeatureFlagKey.WebSearch, user)) && webSearchReady()
}

/** The query as it is sent: trimmed, its whitespace runs made one space, cut to the limit. */
export function cleanQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').slice(0, WEB_SEARCH_LIMITS.queryMaxLength)
}

/** Counts this search in the account's day; false past the limit. Throws when Redis does. */
async function countSearch(userId: number): Promise<boolean> {
  const key = searchCountKey(userId)
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, COUNT_TTL_SECONDS)
  return count <= WEB_SEARCH_LIMITS.perAccountPerDay
}

async function answer(
  userId: number,
  query: string,
  signal?: AbortSignal,
): Promise<WebSearchAnswer> {
  const service = await webSearchKey()
  if (!service) return { failure: WebSearchFailure.Unavailable }
  let allowed: boolean
  try {
    allowed = await countSearch(userId)
  } catch {
    return { failure: WebSearchFailure.Unavailable }
  }
  if (!allowed) return { failure: WebSearchFailure.Quota }
  const client = await app.container.make(WebSearch)
  return client.search(service.kind, service.apiKey, cleanQuery(query), signal)
}

/**
 * The only caller of the search client: one search for this account, counted in its day and
 * refused past `WEB_SEARCH_LIMITS.perAccountPerDay` without reaching the service. The log line
 * holds the account, the count of results or the failure, and the duration: never the query.
 */
export async function searchFor(
  user: { id: number },
  query: string,
  signal?: AbortSignal,
): Promise<WebSearchAnswer> {
  const started = Date.now()
  const result = await answer(user.id, query, signal)
  const outcome =
    'failure' in result ? { reason: result.failure } : { results: result.results.length }
  logger.info({ userId: user.id, ...outcome, durationMs: Date.now() - started }, 'web search')
  return result
}
