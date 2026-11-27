/**
 * Where a watch source's articles come from: an RSS or Atom feed (`url`), or a search of the
 * instance's web search service (`query`, Linkup, through `WebSearch`).
 */
export const WatchSourceKind = {
  Rss: 'rss',
  Linkup: 'linkup',
} as const

export type WatchSourceKind = (typeof WatchSourceKind)[keyof typeof WatchSourceKind]

export const WATCH_SOURCE_KINDS = Object.values(WatchSourceKind) as readonly WatchSourceKind[]

/**
 * What the watch keeps and reads. An article older than `retentionDays` (by its publication date)
 * is dropped by each run, and never taken in; at most `itemsPerSource` new articles a feed a run.
 * Titles, excerpts (the item's description reduced to plain text) and the strings of a feed are
 * cut to these lengths. `sources` and `blockedSites` are the most the admin may add.
 */
export const WATCH_LIMITS = {
  retentionDays: 90,
  itemsPerSource: 50,
  sources: 100,
  blockedSites: 500,
  titleMaxLength: 300,
  excerptMaxLength: 500,
  urlMaxLength: 2000,
  hostMaxLength: 253,
  sourceTitleMaxLength: 200,
  errorMaxLength: 300,
  queryMaxLength: 200,
} as const

/**
 * The spending bound of one run on the web search service, apart from the per-account cap of the
 * assistant's searches: at most `searchesPerRun` searches (Linkup: about $0.005 each in `fast`), each
 * of `results` pages published since the source's last run (`lookbackDays` before its first, a day
 * of overlap after), leaving out the blocked sites (`excludedDomainsMax` at most).
 */
export const WATCH_SEARCH_LIMITS = {
  searchesPerRun: 10,
  results: 20,
  lookbackDays: 7,
  excludedDomainsMax: 100,
} as const

/**
 * How a feed is fetched (`feed-fetch.ts`): given up after `timeoutMs`, cut at `maxBytes`, at
 * most `maxRedirects` redirects, each checked again.
 */
export const WATCH_FETCH_LIMITS = {
  timeoutMs: 15_000,
  maxBytes: 2_000_000,
  maxRedirects: 3,
} as const

/**
 * Addresses a feed is never fetched from, whatever its name resolves to: this machine, private
 * networks, link-local (cloud metadata), shared and multicast addresses.
 */
export const WATCH_DENIED_RANGES = {
  ipv4: [
    '0.0.0.0/8',
    '10.0.0.0/8',
    '100.64.0.0/10',
    '127.0.0.0/8',
    '169.254.0.0/16',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '224.0.0.0/3',
  ],
  ipv6: ['::/128', '::1/128', 'fc00::/7', 'fe80::/10', 'ff00::/8'],
} as const

/** The daily run over every enabled feed: its scheduler key and when it runs (05:00 UTC). */
export const WATCH_REFRESH_SCHEDULE = { key: 'watch-refresh', pattern: '0 5 * * *' } as const

/** How long a run the admin asked for keeps others from being asked (`watch-refresh-lock.ts`). */
export const WATCH_REFRESH_LOCK_SECONDS = 15 * 60

/** Articles `find_articles` answers, the longest excerpt of each and of a query. */
export const WATCH_ASSISTANT_LIMITS = {
  matches: 10,
  excerptMaxLength: 300,
  queryMaxLength: 100,
  sinceDaysMax: 90,
} as const

export const WATCH_NOT_FOUND = { error: { message: 'Not found' } } as const
