import type WatchArticle from '#app/watch/models/watch-article'
import type WatchFeed from '#app/watch/models/watch-feed'
import type { WatchArticleOutput, WatchFeedOutput } from '#app/watch/validators/watch-output'

export function serializeWatchArticle(article: WatchArticle): WatchArticleOutput {
  return {
    id: article.id,
    title: article.title,
    url: article.url,
    site: article.site,
    excerpt: article.excerpt,
    publishedAt: article.publishedAt.toUTC().toISO() ?? '',
    topics: article.topics,
    reviewed: !!article.reviewedTopics?.length,
    hidden: article.hidden,
  }
}

/** A row loaded with its `articles_count`. */
export function serializeWatchFeed(feed: WatchFeed): WatchFeedOutput {
  return {
    id: feed.id,
    kind: feed.kind,
    url: feed.url,
    title: feed.title,
    topics: feed.topics,
    enabled: feed.enabled,
    articles: Number(feed.$extras.articles_count ?? 0),
    lastRunAt: feed.lastRunAt?.toUTC().toISO() ?? null,
    lastError: feed.lastError,
  }
}
