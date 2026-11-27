import type { Paginated } from '#app/shared/pagination/paginate'
import type { WatchFeedKind } from '#app/watch/constants/watch'

/** One article of the watch: never the page, only what the feed said of it. */
export type WatchArticleOutput = {
  id: number
  title: string
  url: string
  site: string
  excerpt: string
  publishedAt: string
  topics: string[]
  /** Whether the admin set its tags (else they are the tagger's or the feed's). */
  reviewed: boolean
  hidden: boolean
}

export type WatchArticlesOutput = Paginated<WatchArticleOutput>

/** One feed the daily run reads, with how its last run went. */
export type WatchFeedOutput = {
  id: number
  kind: WatchFeedKind
  url: string
  title: string | null
  topics: string[]
  enabled: boolean
  articles: number
  lastRunAt: string | null
  lastError: string | null
}

export type WatchBlockedSiteOutput = { id: number; host: string }
