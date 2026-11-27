import { WEB_SEARCH_QUERY_MAX_LENGTH } from '@coreloom-uml/llm'

/** The web search services the admin can save for the instance. */
export const WebSearchKind = { Linkup: 'linkup' } as const
export type WebSearchKind = (typeof WebSearchKind)[keyof typeof WebSearchKind]

/** The bounds of one search: what is asked, how long it may take and what is kept of it. */
export const WEB_SEARCH_LIMITS = {
  results: 8,
  timeoutMs: 10_000,
  snippetMaxLength: 500,
  titleMaxLength: 200,
  /** A longer address is dropped, never cut: a cut address is another one. */
  urlMaxLength: 2048,
  publishedAtMaxLength: 40,
  queryMaxLength: WEB_SEARCH_QUERY_MAX_LENGTH,
  perAccountPerDay: 50,
} as const

/** Why a search answered no results; never the service's own message. */
export const WebSearchFailure = {
  Unauthorized: 'unauthorized',
  Quota: 'quota',
  Timeout: 'timeout',
  Unavailable: 'unavailable',
} as const
export type WebSearchFailure = (typeof WebSearchFailure)[keyof typeof WebSearchFailure]

/** One result as a model reads it: a page's title, address, excerpt and date. */
export type WebSearchResult = {
  title: string
  url: string
  snippet: string
  publishedAt: string | null
}

export type WebSearchAnswer = { results: WebSearchResult[] } | { failure: WebSearchFailure }
