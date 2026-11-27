import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { isTopic } from '@coreloom-uml/catalog'
import { DateTime } from 'luxon'
import { WATCH_LIMITS, WATCH_SEARCH_LIMITS, WatchSourceKind } from '#app/watch/constants/watch'
import WatchArticle from '#app/watch/models/watch-article'
import WatchBlockedSite from '#app/watch/models/watch-blocked-site'
import WatchSource from '#app/watch/models/watch-source'
import FeedFetcher from '#app/watch/services/feed-fetch'
import {
  type FeedItem,
  normalizeUrl,
  type ParsedFeed,
  parseFeed,
  plainText,
} from '#app/watch/services/feed-parse'
import type { WebSearchResult } from '#app/web-search/constants/web-search'
import WebSearch from '#app/web-search/services/web-search'
import { webSearchKey } from '#app/web-search/services/web-search-settings'

export type WatchRefreshReport = {
  sources: number
  failed: number
  /** Articles taken in this run. */
  added: number
  /** Articles past the retention, deleted. */
  pruned: number
  /** Searches spent on the web search service this run (`WATCH_SEARCH_LIMITS.searchesPerRun`). */
  searches: number
}

/** Why a source gave nothing this run, as its `last_error` says it. */
export class SourceError extends Error {}

/** Whether a host is a blocked one or one of its subdomains. */
export function isBlockedHost(host: string, blocked: readonly string[]): boolean {
  return blocked.some((site) => host === site || host.endsWith(`.${site}`))
}

/**
 * The items of one run worth keeping: dated, not in the future, within the retention, on a site
 * that is not blocked, one per link, the newest first, `WATCH_LIMITS.itemsPerSource` at most.
 */
export function keptItems(items: FeedItem[], blocked: readonly string[], now: Date): FeedItem[] {
  const oldest = now.getTime() - WATCH_LIMITS.retentionDays * 86_400_000
  const seen = new Set<string>()
  return items
    .filter((item): item is FeedItem & { publishedAt: Date } => {
      const time = item.publishedAt?.getTime()
      if (time === undefined || time > now.getTime() || time < oldest) return false
      if (isBlockedHost(new URL(item.url).hostname, blocked) || seen.has(item.url)) return false
      seen.add(item.url)
      return true
    })
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, WATCH_LIMITS.itemsPerSource)
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : 'The feed could not be read'
  return message.slice(0, WATCH_LIMITS.errorMaxLength)
}

/** What one run reads with: the fetcher, the web search client and key, and its budget. */
type RunContext = {
  now: Date
  blocked: readonly string[]
  fetcher: FeedFetcher
  search: { client: WebSearch; key: Awaited<ReturnType<typeof webSearchKey>> } | null
  report: WatchRefreshReport
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10)

/** A source's items this run: its feed, or one search since its last run. */
async function readSource(source: WatchSource, run: RunContext): Promise<ParsedFeed> {
  if (source.kind === WatchSourceKind.Rss && source.url) {
    return parseFeed(await run.fetcher.fetch(source.url), source.url)
  }
  if (source.kind !== WatchSourceKind.Linkup || !source.query) {
    throw new SourceError('Nothing to read')
  }
  if (!run.search?.key) throw new SourceError('No web search service is set')
  if (run.report.searches >= WATCH_SEARCH_LIMITS.searchesPerRun) {
    throw new SourceError('The searches of this run are spent: read at the next run')
  }
  run.report.searches += 1
  const since = source.lastRunAt
    ? source.lastRunAt.minus({ days: 1 }).toJSDate()
    : new Date(run.now.getTime() - WATCH_SEARCH_LIMITS.lookbackDays * 86_400_000)
  const answer = await run.search.client.search(
    run.search.key.kind,
    run.search.key.apiKey,
    source.query,
    undefined,
    {
      fromDate: isoDate(since),
      excludeDomains: run.blocked.slice(0, WATCH_SEARCH_LIMITS.excludedDomainsMax),
      maxResults: WATCH_SEARCH_LIMITS.results,
    },
  )
  if ('failure' in answer) throw new SourceError(`The web search failed: ${answer.failure}`)
  return { title: null, items: searchItems(answer.results) }
}

/** The pages of a search as feed items: a clean link, the title and excerpt as plain text. */
export function searchItems(results: WebSearchResult[]): FeedItem[] {
  return results.flatMap((result) => {
    const url = normalizeUrl(result.url)
    const title = plainText(result.title, WATCH_LIMITS.titleMaxLength)
    const published = result.publishedAt ? Date.parse(result.publishedAt) : Number.NaN
    if (!url || !title) return []
    return [
      {
        title,
        url: url.href,
        publishedAt: Number.isNaN(published) ? null : new Date(published),
        excerpt: plainText(result.snippet, WATCH_LIMITS.excerptMaxLength),
      },
    ]
  })
}

/**
 * Reads every enabled source once (a feed through `FeedFetcher`, a search through `WebSearch`
 * with the instance's key, `WATCH_SEARCH_LIMITS.searchesPerRun` at most), takes in the items
 * `keptItems` keeps and that are not known yet by their link (a hidden one stays hidden), with
 * the source's tags, and deletes the articles past the retention. A source that fails keeps its
 * articles and records why. Run by `RefreshWatchJob` only: no request handler reads a source.
 */
export async function refreshWatch(now = new Date()): Promise<WatchRefreshReport> {
  const report: WatchRefreshReport = { sources: 0, failed: 0, added: 0, pruned: 0, searches: 0 }
  const sources = await WatchSource.query().where('enabled', true).orderBy('id')
  const needsSearch = sources.some((source) => source.kind === WatchSourceKind.Linkup)
  const run: RunContext = {
    now,
    report,
    blocked: (await WatchBlockedSite.all()).map((site) => site.host),
    fetcher: await app.container.make(FeedFetcher),
    search: needsSearch
      ? { client: await app.container.make(WebSearch), key: await webSearchKey() }
      : null,
  }

  for (const source of sources) {
    report.sources += 1
    try {
      const parsed = await readSource(source, run)
      const topics = source.topics.filter(isTopic)
      const rows = keptItems(parsed.items, run.blocked, now).map((item) => ({
        source_id: source.id,
        url: item.url,
        site: new URL(item.url).hostname.slice(0, WATCH_LIMITS.hostMaxLength),
        title: item.title,
        excerpt: item.excerpt,
        published_at: item.publishedAt,
        topics: JSON.stringify(topics),
        source_topics: JSON.stringify(topics),
        created_at: now,
        updated_at: now,
      }))
      if (rows.length > 0) {
        const inserted = await db
          .table('watch_articles')
          .insert(rows)
          .onConflict('url')
          .ignore()
          .returning('id')
        report.added += inserted.length
      }
      await source
        .merge({
          title: parsed.title ?? source.title,
          lastRunAt: DateTime.fromJSDate(now),
          lastError: null,
        })
        .save()
    } catch (error) {
      report.failed += 1
      // A search left for the next run keeps its date, so the next one reads from there.
      await source
        .merge({
          lastRunAt: error instanceof SourceError ? source.lastRunAt : DateTime.fromJSDate(now),
          lastError: errorText(error),
        })
        .save()
    }
  }

  const oldest = DateTime.fromJSDate(now).minus({ days: WATCH_LIMITS.retentionDays })
  const pruned = await WatchArticle.query().where('published_at', '<', oldest.toJSDate()).delete()
  report.pruned = Number(Array.isArray(pruned) ? pruned[0] : pruned) || 0
  return report
}
