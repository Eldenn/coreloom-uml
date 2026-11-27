import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { isTopic } from '@coreloom-uml/catalog'
import { DateTime } from 'luxon'
import { WATCH_LIMITS } from '#app/watch/constants/watch'
import WatchArticle from '#app/watch/models/watch-article'
import WatchBlockedSite from '#app/watch/models/watch-blocked-site'
import WatchFeed from '#app/watch/models/watch-feed'
import FeedFetcher from '#app/watch/services/feed-fetch'
import { type FeedItem, parseFeed } from '#app/watch/services/feed-parse'

export type WatchRefreshReport = {
  feeds: number
  failed: number
  /** Articles taken in this run. */
  added: number
  /** Articles past the retention, deleted. */
  pruned: number
}

/** Whether a host is a blocked one or one of its subdomains. */
export function isBlockedHost(host: string, blocked: readonly string[]): boolean {
  return blocked.some((site) => host === site || host.endsWith(`.${site}`))
}

/**
 * The items of one run worth keeping: dated, not in the future, within the retention, on a site
 * that is not blocked, one per link, the newest first, `WATCH_LIMITS.itemsPerFeed` at most.
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
    .slice(0, WATCH_LIMITS.itemsPerFeed)
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : 'The feed could not be read'
  return message.slice(0, WATCH_LIMITS.errorMaxLength)
}

/**
 * Reads every enabled feed once (`FeedFetcher`, then `parseFeed`), takes in the items
 * `keptItems` keeps and that are not known yet by their link (a hidden one stays hidden), with
 * the feed's tags, and deletes the articles past the retention. A feed that fails keeps its
 * articles and records why. Run by `RefreshWatchJob` only: no request handler fetches a feed.
 */
export async function refreshWatch(now = new Date()): Promise<WatchRefreshReport> {
  const report: WatchRefreshReport = { feeds: 0, failed: 0, added: 0, pruned: 0 }
  const fetcher = await app.container.make(FeedFetcher)
  const blocked = (await WatchBlockedSite.all()).map((site) => site.host)
  const feeds = await WatchFeed.query().where('enabled', true).orderBy('id')

  for (const feed of feeds) {
    report.feeds += 1
    try {
      const parsed = parseFeed(await fetcher.fetch(feed.url), feed.url)
      const topics = feed.topics.filter(isTopic)
      const rows = keptItems(parsed.items, blocked, now).map((item) => ({
        feed_id: feed.id,
        url: item.url,
        site: new URL(item.url).hostname.slice(0, WATCH_LIMITS.hostMaxLength),
        title: item.title,
        excerpt: item.excerpt,
        published_at: item.publishedAt,
        topics: JSON.stringify(topics),
        feed_topics: JSON.stringify(topics),
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
      await feed
        .merge({ title: parsed.title, lastRunAt: DateTime.fromJSDate(now), lastError: null })
        .save()
    } catch (error) {
      report.failed += 1
      await feed.merge({ lastRunAt: DateTime.fromJSDate(now), lastError: errorText(error) }).save()
    }
  }

  const oldest = DateTime.fromJSDate(now).minus({ days: WATCH_LIMITS.retentionDays })
  const pruned = await WatchArticle.query().where('published_at', '<', oldest.toJSDate()).delete()
  report.pruned = Number(Array.isArray(pruned) ? pruned[0] : pruned) || 0
  return report
}
