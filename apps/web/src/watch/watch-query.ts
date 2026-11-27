// What the Watch screen asks the API for, from its URL's parameters.

/** Articles per page. */
export const WATCH_PAGE_SIZE = 20

/** The periods the screen offers, in days. */
export const WATCH_PERIODS = ['7', '30', '90'] as const

/** The URL's parameters, as text (`untagged` and `hidden` are `'1'` when on). */
export interface WatchSearch {
  q?: string
  topic?: string
  since?: string
  untagged?: string
  hidden?: string
  page?: string
}

/**
 * The query of `GET /watch/articles`: an unknown tag or period is dropped, and the admin's
 * filters (`untagged`, `hidden`) are only sent for the admin.
 */
export function watchQueryFrom<T extends string>(
  search: WatchSearch,
  topics: Record<T, string>,
  isAdmin: boolean,
) {
  const q = search.q?.trim()
  const topic =
    search.topic && Object.hasOwn(topics, search.topic) ? (search.topic as T) : undefined
  const since = WATCH_PERIODS.find((period) => period === search.since)
  return {
    page: Math.max(1, Number(search.page) || 1),
    perPage: WATCH_PAGE_SIZE,
    ...(q ? { q } : {}),
    ...(topic ? { topic } : {}),
    ...(since ? { sinceDays: Number(since) } : {}),
    ...(isAdmin && search.untagged === '1' ? { untagged: true } : {}),
    ...(isAdmin && search.hidden === '1' ? { hidden: true } : {}),
  }
}
