import type WatchArticle from '#app/watch/models/watch-article'
import type WatchSource from '#app/watch/models/watch-source'
import type { WatchArticleOutput, WatchSourceOutput } from '#app/watch/validators/watch-output'

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
export function serializeWatchSource(source: WatchSource): WatchSourceOutput {
  return {
    id: source.id,
    kind: source.kind,
    url: source.url,
    query: source.query,
    title: source.title,
    topics: source.topics,
    enabled: source.enabled,
    articles: Number(source.$extras.articles_count ?? 0),
    lastRunAt: source.lastRunAt?.toUTC().toISO() ?? null,
    lastError: source.lastError,
  }
}
