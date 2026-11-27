import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import ClassifySkillTopicsJob from '#app/jobs/classify-skill-topics_job'
import RefreshWatchJob from '#app/jobs/refresh-watch_job'
import { WATCH_LIMITS, WATCH_NOT_FOUND, WatchSourceKind } from '#app/watch/constants/watch'
import WatchArticle from '#app/watch/models/watch-article'
import WatchBlockedSite from '#app/watch/models/watch-blocked-site'
import WatchSource from '#app/watch/models/watch-source'
import {
  serializeWatchArticle,
  serializeWatchSource,
} from '#app/watch/serializers/watch-serializer'
import { normalizeUrl } from '#app/watch/services/feed-parse'
import { watchEnabled } from '#app/watch/services/watch-query'
import { acquireWatchRefresh } from '#app/watch/services/watch-refresh-lock'
import { articleTaggerTrusted, articleTopics } from '#app/watch/services/watch-topics'
import {
  blockWatchSiteInput,
  createWatchSourceInput,
  updateWatchArticleInput,
  updateWatchSourceInput,
} from '#app/watch/validators/watch-input'
import type { WatchBlockedSiteOutput, WatchSourcesOutput } from '#app/watch/validators/watch-output'
import { webSearchReady } from '#app/web-search/services/web-search-settings'

/**
 * What the admin sets of the tech watch (`middleware.admin()`, and `tech-watch` on for them, 404
 * otherwise): the sources (feeds and web searches), the blocked sites, an article's tags and whether it is shown, and a run
 * asked now. These routes only write rows or queue a job: none fetches a feed or runs a search.
 */
export default class AdminWatchController {
  async sources({ auth, response }: HttpContext) {
    if (!(await watchEnabled(auth.getUserOrFail()))) return response.notFound(WATCH_NOT_FOUND)
    const sources = await WatchSource.query().withCount('articles').orderBy('id')
    const output: WatchSourcesOutput = {
      data: sources.map(serializeWatchSource),
      webSearchReady: await webSearchReady(),
    }
    return response.ok(output)
  }

  async storeSource({ auth, request, response }: HttpContext) {
    if (!(await watchEnabled(auth.getUserOrFail()))) return response.notFound(WATCH_NOT_FOUND)
    const { url, query, topics } = await request.validateUsing(createWatchSourceInput)
    if (url !== undefined && query !== undefined) {
      return response.unprocessableEntity({ error: { message: 'A feed or a search, not both' } })
    }
    const normalized = url === undefined ? null : normalizeUrl(url)
    if (url !== undefined && !normalized) {
      return response.unprocessableEntity({ error: { message: 'Not a feed address' } })
    }
    const target = normalized
      ? { kind: WatchSourceKind.Rss, url: normalized.href, query: null }
      : { kind: WatchSourceKind.Linkup, url: null, query: query as string }
    const existing = await WatchSource.query()
      .if(target.url, (q) => q.where('url', target.url as string))
      .if(target.query, (q) => q.whereRaw('lower(query) = lower(?)', [target.query as string]))
      .first()
    if (existing) return response.conflict({ error: { message: 'This source exists already' } })
    const [{ count }] = await db.from('watch_sources').count('* as count')
    if (Number(count) >= WATCH_LIMITS.sources) {
      return response.conflict({ error: { message: 'Too many sources' } })
    }
    const source = await WatchSource.create({ ...target, topics: topics ?? [], enabled: true })
    return response.created({ source: await withCount(source) })
  }

  async updateSource({ auth, params, request, response }: HttpContext) {
    if (!(await watchEnabled(auth.getUserOrFail()))) return response.notFound(WATCH_NOT_FOUND)
    const changes = await request.validateUsing(updateWatchSourceInput)
    const source = await WatchSource.find(Number(params.id))
    if (!source) return response.notFound(WATCH_NOT_FOUND)
    await source.merge(changes).save()
    return response.ok({ source: await withCount(source) })
  }

  /** Its articles stay, without a source. */
  async destroySource({ auth, params, response }: HttpContext) {
    if (!(await watchEnabled(auth.getUserOrFail()))) return response.notFound(WATCH_NOT_FOUND)
    const source = await WatchSource.find(Number(params.id))
    if (!source) return response.notFound(WATCH_NOT_FOUND)
    await source.delete()
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
      article.topics = articleTopics(article, article.taggerTopics, await articleTaggerTrusted())
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

async function withCount(source: WatchSource) {
  const row = await WatchSource.query().where('id', source.id).withCount('articles').firstOrFail()
  return serializeWatchSource(row)
}
