import type { Paginated } from '#app/shared/pagination/paginate'
import type { WatchSourceKind } from '#app/watch/constants/watch'

/** One article of the watch: never the page, only what its feed or search said of it. */
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
  /** The feed (its title, else its address) or the search (its query) that brought it. */
  source: { kind: WatchSourceKind; label: string } | null
}

export type WatchArticlesOutput = Paginated<WatchArticleOutput>

/** One feed or search the daily run reads, with how its last run went. */
export type WatchSourceOutput = {
  id: number
  kind: WatchSourceKind
  url: string | null
  query: string | null
  title: string | null
  topics: string[]
  enabled: boolean
  articles: number
  lastRunAt: string | null
  lastError: string | null
}

export type WatchBlockedSiteOutput = { id: number; host: string }

export type WatchSourcesOutput = {
  data: WatchSourceOutput[]
  /** Whether a web search service is set (Settings): a search source is read only then. */
  webSearchReady: boolean
}
