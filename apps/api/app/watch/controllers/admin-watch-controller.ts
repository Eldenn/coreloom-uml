import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import ClassifySkillTopicsJob from '#app/jobs/classify-skill-topics_job'
import RefreshWatchJob from '#app/jobs/refresh-watch_job'
import { effectiveTopics } from '#app/skills/services/skill-topics'
import { WATCH_LIMITS, WATCH_NOT_FOUND, WatchFeedKind } from '#app/watch/constants/watch'
import WatchArticle from '#app/watch/models/watch-article'
import WatchBlockedSite from '#app/watch/models/watch-blocked-site'
import WatchFeed from '#app/watch/models/watch-feed'
import { serializeWatchArticle, serializeWatchFeed } from '#app/watch/serializers/watch-serializer'
import { normalizeUrl } from '#app/watch/services/feed-parse'
import { watchEnabled } from '#app/watch/services/watch-query'
import { acquireWatchRefresh } from '#app/watch/services/watch-refresh-lock'
import {
  blockWatchSiteInput,
  createWatchFeedInput,
  updateWatchArticleInput,
  updateWatchFeedInput,
} from '#app/watch/validators/watch-input'
import type { WatchBlockedSiteOutput } from '#app/watch/validators/watch-output'

/**
 * What the admin sets of the tech watch (`middleware.admin()`, and `tech-watch` on for them, 404
 * otherwise): the feeds, the blocked sites, an article's tags and whether it is shown, and a run
 * asked now. These routes only write rows or queue a job: none fetches a feed.
 */
export default class AdminWatchController {
  async feeds({ auth, response }: HttpContext) {
    if (!(await watchEnabled(auth.getUserOrFail()))) return response.notFound(WATCH_NOT_FOUND)
    const feeds = await WatchFeed.query().withCount('articles').orderBy('id')
    return response.ok({ data: feeds.map(serializeWatchFeed) })
  }

  async storeFeed({ auth, request, response }: HttpContext) {
    if (!(await watchEnabled(auth.getUserOrFail()))) return response.notFound(WATCH_NOT_FOUND)
    const { url, topics } = await request.validateUsing(createWatchFeedInput)
    const normalized = normalizeUrl(url)
    if (!normalized) {
      return response.unprocessableEntity({ error: { message: 'Not a feed address' } })
    }
    if (await WatchFeed.findBy('url', normalized.href)) {
      return response.conflict({ error: { message: 'This feed exists already' } })
    }
    const [{ count }] = await db.from('watch_feeds').count('* as count')
    if (Number(count) >= WATCH_LIMITS.feeds) {
      return response.conflict({ error: { message: 'Too many feeds' } })
    }
    const feed = await WatchFeed.create({
      kind: WatchFeedKind.Rss,
      url: normalized.href,
      topics: topics ?? [],
      enabled: true,
    })
    return response.created({ feed: await withCount(feed) })
  }

  async updateFeed({ auth, params, request, response }: HttpContext) {
    if (!(await watchEnabled(auth.getUserOrFail()))) return response.notFound(WATCH_NOT_FOUND)
    const changes = await request.validateUsing(updateWatchFeedInput)
    const feed = await WatchFeed.find(Number(params.id))
    if (!feed) return response.notFound(WATCH_NOT_FOUND)
    await feed.merge(changes).save()
    return response.ok({ feed: await withCount(feed) })
  }

  /** Its articles stay, without a feed. */
  async destroyFeed({ auth, params, response }: HttpContext) {
    if (!(await watchEnabled(auth.getUserOrFail()))) return response.notFound(WATCH_NOT_FOUND)
    const feed = await WatchFeed.find(Number(params.id))
    if (!feed) return response.notFound(WATCH_NOT_FOUND)
    await feed.delete()
    return response.noContent()
  }

  /** Queues a run now: one at a time (409 while one asked earlier has not ended). */
  async refresh({ auth, response }: HttpContext) {
    if (!(await watchEnabled(auth.getUserOrFail()))) return response.notFound(WATCH_NOT_FOUND)
    if (!(await acquireWatchRefresh())) {
      return response.conflict({ error: { message: 'A watch run is already queued' } })
    }
    await RefreshWatchJob.dispatch({})
    return response.accepted({ queued: true })
  }

  /**
   * Hides an article or shows it again, and sets its tags (they replace the tagger's and the
   * feed's, and the tagger learns the main one at its next run, queued here).
   */
  async updateArticle({ auth, params, request, response }: HttpContext) {
    if (!(await watchEnabled(auth.getUserOrFail()))) return response.notFound(WATCH_NOT_FOUND)
    const { hidden, topics } = await request.validateUsing(updateWatchArticleInput)
    const article = await WatchArticle.find(Number(params.id))
    if (!article) return response.notFound(WATCH_NOT_FOUND)
    if (hidden !== undefined) article.hidden = hidden
    if (topics !== undefined) {
      article.reviewedTopics = topics
      article.topics = effectiveTopics(article.feedTopics, article.taggerTopics, topics)
    }
    await article.save()
    if (topics !== undefined) await ClassifySkillTopicsJob.dispatch({})
    return response.ok({ article: serializeWatchArticle(article) })
  }

  async blockedSites({ auth, response }: HttpContext) {
    if (!(await watchEnabled(auth.getUserOrFail()))) return response.notFound(WATCH_NOT_FOUND)
    const sites = await WatchBlockedSite.query().orderBy('host')
    const data: WatchBlockedSiteOutput[] = sites.map(({ id, host }) => ({ id, host }))
    return response.ok({ data })
  }

  /** Blocks a host and its subdomains: their articles kept so far are hidden too. */
  async blockSite({ auth, request, response }: HttpContext) {
    if (!(await watchEnabled(auth.getUserOrFail()))) return response.notFound(WATCH_NOT_FOUND)
    const { host } = await request.validateUsing(blockWatchSiteInput)
    if (await WatchBlockedSite.findBy('host', host)) {
      return response.conflict({ error: { message: 'This site is blocked already' } })
    }
    const [{ count }] = await db.from('watch_blocked_sites').count('* as count')
    if (Number(count) >= WATCH_LIMITS.blockedSites) {
      return response.conflict({ error: { message: 'Too many blocked sites' } })
    }
    const site = await WatchBlockedSite.create({ host })
    const suffix = `%.${host.replace(/[\\%_]/g, (char) => `\\${char}`)}`
    await WatchArticle.query()
      .where((query) => query.where('site', host).orWhereLike('site', suffix))
      .update({ hidden: true })
    const output: WatchBlockedSiteOutput = { id: site.id, host: site.host }
    return response.created({ site: output })
  }

  /** Its articles hidden when it was blocked stay hidden: the admin shows them one by one. */
  async unblockSite({ auth, params, response }: HttpContext) {
    if (!(await watchEnabled(auth.getUserOrFail()))) return response.notFound(WATCH_NOT_FOUND)
    const site = await WatchBlockedSite.find(Number(params.id))
    if (!site) return response.notFound(WATCH_NOT_FOUND)
    await site.delete()
    return response.noContent()
  }
}

async function withCount(feed: WatchFeed) {
  const row = await WatchFeed.query().where('id', feed.id).withCount('articles').firstOrFail()
  return serializeWatchFeed(row)
}
