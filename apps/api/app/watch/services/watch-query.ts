import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { DateTime } from 'luxon'
import { isFeatureEnabled } from '#app/feature-flags/services/feature-flags'
import type User from '#app/users/models/user'
import WatchArticle from '#app/watch/models/watch-article'

export type WatchFilters = {
  topic?: string
  q?: string
  sinceDays?: number
  untagged?: boolean
  hidden?: boolean
}

/** Whether the tech watch is on for this person (`tech-watch`): off, every route answers 404. */
export function watchEnabled(user: User): Promise<boolean> {
  return isFeatureEnabled(FeatureFlagKey.TechWatch, user)
}

/**
 * The articles matching the filters, newest first: the visible ones, or with `hidden` the hidden
 * ones only. Words match the title or the excerpt, each word on its own.
 */
export function watchArticlesQuery(filters: WatchFilters) {
  const query = WatchArticle.query()
    .where('hidden', filters.hidden === true)
    .orderBy('published_at', 'desc')
    .orderBy('id', 'desc')
  if (filters.topic) query.whereRaw('topics @> ?::jsonb', [JSON.stringify([filters.topic])])
  if (filters.untagged) query.whereRaw(`topics = '[]'::jsonb`)
  if (filters.sinceDays) {
    query.where('published_at', '>=', DateTime.now().minus({ days: filters.sinceDays }).toJSDate())
  }
  for (const word of filters.q?.toLowerCase().split(/\s+/).filter(Boolean) ?? []) {
    const pattern = `%${word.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
    query.where((inner) => inner.whereILike('title', pattern).orWhereILike('excerpt', pattern))
  }
  return query
}
