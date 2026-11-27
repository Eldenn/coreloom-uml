import app from '@adonisjs/core/services/app'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { AssistantToolKind } from '@coreloom-uml/llm'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { WATCH_ACTIONS } from '#app/assistant/actions/watch-actions'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import SkillEmbedder from '#app/skills/services/skill-embedder'
import User from '#app/users/models/user'
import WatchArticle from '#app/watch/models/watch-article'
import WatchSource from '#app/watch/models/watch-source'
import FeedFetcher from '#app/watch/services/feed-fetch'
import { refreshWatch } from '#app/watch/services/watch-refresh'
import { releaseWatchRefresh } from '#app/watch/services/watch-refresh-lock'
import { articleTopics, classifyWatchArticles } from '#app/watch/services/watch-topics'
import WebSearch from '#app/web-search/services/web-search'
import { saveWebSearch } from '#app/web-search/services/web-search-settings'
import env from '#start/env'
import { FakeWebSearch } from '#tests/helpers/fake-web-search'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

const json = { accept: 'application/json' }
const ADMIN = 'watch-admin@example.com'
const PASSWORD = 'a-very-strong-passphrase'
const ON = { enabled: true, rollout: 100, rules: [] }

function rss(items: { title: string; link: string; date: string; text?: string }[]) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>A feed</title>${items
    .map(
      (item) =>
        `<item><title>${item.title}</title><link>${item.link}</link><pubDate>${item.date}</pubDate><description>${item.text ?? ''}</description></item>`,
    )
    .join('')}</channel></rss>`
}

/** Swaps the fetcher for one that answers each feed's URL from `feeds`, or fails. */
function fakeFeeds(feeds: Record<string, string>) {
  const asked: string[] = []
  app.container.swap(FeedFetcher, () => {
    const fake = new FeedFetcher()
    fake.fetch = async (url) => {
      asked.push(url)
      const body = feeds[url]
      if (body === undefined) throw new Error('The feed answered 500')
      return body
    }
    return fake
  })
  return asked
}

const daysAgo = (days: number) => DateTime.now().minus({ days }).toHTTP() as string

test.group('Tech watch', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => {
    env.set('DEFAULT_ACCOUNT_EMAIL', ADMIN)
    env.set('DEFAULT_ACCOUNT_PASSWORD', 'the-default-passphrase')
    return async () => {
      env.set('DEFAULT_ACCOUNT_EMAIL', '')
      env.set('DEFAULT_ACCOUNT_PASSWORD', '')
      app.container.restore(FeedFetcher)
      app.container.restore(SkillEmbedder)
      app.container.restore(WebSearch)
      await releaseWatchRefresh()
    }
  })

  test('every route answers 404 while tech-watch is off', async ({ client }) => {
    const admin = await User.create({ email: ADMIN, password: PASSWORD })
    ;(await client.get('/watch/articles').headers(json).loginAs(admin)).assertStatus(404)
    ;(await client.get('/admin/watch/sources').headers(json).loginAs(admin)).assertStatus(404)
    ;(await client.post('/admin/watch/refresh').headers(json).loginAs(admin)).assertStatus(404)
  })

  test('only the admin manages feeds', async ({ client }) => {
    const someone = await User.create({ email: 'reader@example.com', password: PASSWORD })
    await updateFlag(FeatureFlagKey.TechWatch, ON, someone)
    ;(await client.get('/watch/articles').headers(json).loginAs(someone)).assertStatus(200)
    const added = await client
      .post('/admin/watch/sources')
      .headers(json)
      .json({ url: 'https://blog.example.com/feed' })
      .loginAs(someone)
    added.assertStatus(404)
  })

  test('the admin adds a feed, the run takes its dated items in, the page lists them', async ({
    client,
    assert,
  }) => {
    const admin = await User.create({ email: ADMIN, password: PASSWORD })
    await updateFlag(FeatureFlagKey.TechWatch, ON, admin)

    const added = await client
      .post('/admin/watch/sources')
      .headers(json)
      .json({ url: 'https://blog.example.com/feed', topics: ['security'] })
      .loginAs(admin)
    added.assertStatus(201)
    assert.include(added.body().source, { url: 'https://blog.example.com/feed', enabled: true })
    ;(
      await client
        .post('/admin/watch/sources')
        .headers(json)
        .json({ url: 'https://blog.example.com/feed' })
        .loginAs(admin)
    ).assertStatus(409)
    ;(
      await client
        .post('/admin/watch/sources')
        .headers(json)
        .json({ url: 'http://blog.example.com/feed' })
        .loginAs(admin)
    ).assertStatus(422)
    await WatchSource.create({
      kind: 'rss',
      url: 'https://broken.example/feed',
      query: null,
      topics: [],
      enabled: true,
    })

    fakeFeeds({
      'https://blog.example.com/feed': rss([
        {
          title: 'Secrets in CI',
          link: 'https://blog.example.com/secrets',
          date: daysAgo(1),
          text: 'Keep tokens out of logs.',
        },
        { title: 'Old news', link: 'https://blog.example.com/old', date: daysAgo(200) },
        { title: 'From a spam site', link: 'https://ads.spam.example/x', date: daysAgo(2) },
      ]),
    })
    ;(
      await client
        .post('/admin/watch/blocked-sites')
        .headers(json)
        .json({ host: 'Spam.example' })
        .loginAs(admin)
    ).assertStatus(201)

    const report = await refreshWatch()
    assert.deepEqual(report, { sources: 2, failed: 1, added: 1, pruned: 0, searches: 0 })
    const broken = await WatchSource.findByOrFail('url', 'https://broken.example/feed')
    assert.equal(broken.lastError, 'The feed answered 500')
    // A second run adds nothing: the link is known.
    assert.equal((await refreshWatch()).added, 0)

    const list = await client.get('/watch/articles').headers(json).loginAs(admin)
    list.assertStatus(200)
    assert.equal(list.body().meta.total, 1)
    assert.include(list.body().data[0], {
      title: 'Secrets in CI',
      site: 'blog.example.com',
      excerpt: 'Keep tokens out of logs.',
      reviewed: false,
    })
    assert.deepEqual(list.body().data[0].topics, ['security'])

    const byWords = await client
      .get('/watch/articles?q=TOKENS&topic=security')
      .headers(json)
      .loginAs(admin)
    assert.equal(byWords.body().meta.total, 1)
    const none = await client.get('/watch/articles?topic=react').headers(json).loginAs(admin)
    assert.equal(none.body().meta.total, 0)
  })

  test('the admin hides an article, sets its tags, and blocking a site hides its articles', async ({
    client,
    assert,
  }) => {
    const admin = await User.create({ email: ADMIN, password: PASSWORD })
    await updateFlag(FeatureFlagKey.TechWatch, ON, admin)
    const article = await WatchArticle.create({
      url: 'https://news.example.org/a',
      site: 'news.example.org',
      title: 'A',
      excerpt: '',
      publishedAt: DateTime.now().minus({ days: 1 }),
      topics: [],
      sourceTopics: [],
      taggerTopics: null,
      reviewedTopics: null,
      hidden: false,
    })

    const tagged = await client
      .patch(`/admin/watch/articles/${String(article.id)}`)
      .headers(json)
      .json({ topics: ['ai', 'testing'] })
      .loginAs(admin)
    tagged.assertStatus(200)
    assert.deepEqual(tagged.body().article.topics, ['ai', 'testing'])
    assert.isTrue(tagged.body().article.reviewed)

    const untagged = await client.get('/watch/articles?untagged=true').headers(json).loginAs(admin)
    assert.equal(untagged.body().meta.total, 0)

    ;(
      await client
        .post('/admin/watch/blocked-sites')
        .headers(json)
        .json({ host: 'example.org' })
        .loginAs(admin)
    ).assertStatus(201)
    await article.refresh()
    assert.isTrue(article.hidden)
    const visible = await client.get('/watch/articles').headers(json).loginAs(admin)
    assert.equal(visible.body().meta.total, 0)
    const hidden = await client.get('/watch/articles?hidden=true').headers(json).loginAs(admin)
    assert.equal(hidden.body().meta.total, 1)
  })

  test('a run asked by the admin is queued once at a time', async ({ client }) => {
    const admin = await User.create({ email: ADMIN, password: PASSWORD })
    await updateFlag(FeatureFlagKey.TechWatch, ON, admin)
    ;(await client.post('/admin/watch/refresh').headers(json).loginAs(admin)).assertStatus(202)
    ;(await client.post('/admin/watch/refresh').headers(json).loginAs(admin)).assertStatus(409)
  })

  test('find_articles answers visible articles by tag and words, with the flag only', async ({
    assert,
  }) => {
    const user = await User.create({ email: 'reader@example.com', password: PASSWORD })
    const action = WATCH_ACTIONS.find((entry) => entry.name === 'find_articles')
    if (action?.kind !== AssistantToolKind.Read || !action.available) throw new Error('No read')
    assert.isFalse(await action.available(user))
    await updateFlag(FeatureFlagKey.TechWatch, ON, user)
    assert.isTrue(await action.available(user))

    const base = {
      excerpt: 'x'.repeat(500),
      sourceTopics: [],
      taggerTopics: null,
      reviewedTopics: null,
    }
    await WatchArticle.createMany([
      {
        ...base,
        url: 'https://a.example/1',
        site: 'a.example',
        title: 'Prompt injection in agents',
        publishedAt: DateTime.now().minus({ days: 2 }),
        topics: ['security'],
        hidden: false,
      },
      {
        ...base,
        url: 'https://a.example/2',
        site: 'a.example',
        title: 'Hidden one on agents',
        publishedAt: DateTime.now().minus({ days: 1 }),
        topics: ['security'],
        hidden: true,
      },
      {
        ...base,
        url: 'https://a.example/3',
        site: 'a.example',
        title: 'React compiler',
        publishedAt: DateTime.now().minus({ days: 3 }),
        topics: ['react'],
        hidden: false,
      },
    ])
    const found = (await action.read(
      { topic: 'security', query: 'agents' },
      user,
      {} as never,
    )) as {
      title: string
      excerpt: string
    }[]
    assert.deepEqual(
      found.map((item) => item.title),
      ['Prompt injection in agents'],
    )
    assert.lengthOf(found[0].excerpt, 300)
  })

  test('the skill tagger tags articles from the labels, the admin keeps the last word', async ({
    assert,
  }) => {
    const WORDS = ['secret', 'test']
    app.container.swap(SkillEmbedder, () => {
      const fake = new SkillEmbedder()
      fake.embed = async (texts) =>
        texts.map((text) => [...WORDS.map((word) => (text.includes(word) ? 1 : 0)), 0.1])
      fake.close = async () => {}
      return fake
    })
    const make = (
      n: number,
      title: string,
      reviewed: string[] | null,
      sourceTopics: string[] = [],
    ) =>
      WatchArticle.create({
        url: `https://a.example/${title.replace(/\s/g, '-')}-${String(n)}`,
        site: 'a.example',
        title,
        excerpt: '',
        publishedAt: DateTime.now().minus({ days: 1 }),
        topics: reviewed ?? sourceTopics,
        sourceTopics,
        taggerTopics: null,
        reviewedTopics: reviewed,
        hidden: false,
      })
    for (let n = 0; n < 6; n++) {
      await make(n, 'a secret leaked', ['security'])
      await make(n, 'how we test', ['testing'])
    }
    const fromTaggedSource = await make(0, 'one more secret', null, ['ai'])
    const fromUntaggedSource = await make(0, 'another secret', null, [])

    const report = await classifyWatchArticles()
    assert.equal(report.embedded, 14)
    assert.isAtLeast(report.labels, 12)
    // Not trusted on articles yet: the source's tags stay; a source without tags takes the tagger's.
    await fromTaggedSource.refresh()
    assert.deepEqual(fromTaggedSource.taggerTopics, ['security'])
    assert.deepEqual(fromTaggedSource.topics, ['ai'])
    await fromUntaggedSource.refresh()
    assert.deepEqual(fromUntaggedSource.topics, ['security'])
    assert.equal((await classifyWatchArticles()).embedded, 0)

    // Once the admin tagged enough articles, the tagger's tags win over the source's.
    assert.deepEqual(articleTopics(fromTaggedSource, ['security'], true), ['security'])
    assert.deepEqual(
      articleTopics(
        {
          ...fromTaggedSource.serialize(),
          sourceTopics: ['ai'],
          reviewedTopics: ['docs'],
        } as never,
        ['security'],
        true,
      ),
      ['docs'],
    )
  })

  test('a search source runs on the instance key, since its last run, without blocked sites', async ({
    client,
    assert,
  }) => {
    const admin = await User.create({ email: ADMIN, password: PASSWORD })
    await updateFlag(FeatureFlagKey.TechWatch, ON, admin)
    const fake = new FakeWebSearch()
    app.container.swap(WebSearch, () => fake)
    fakeFeeds({})

    const added = await client
      .post('/admin/watch/sources')
      .headers(json)
      .json({ search: 'prompt injection in coding agents', topics: ['security'] })
      .loginAs(admin)
    added.assertStatus(201)
    assert.include(added.body().source, { kind: 'linkup', url: null })
    ;(
      await client
        .post('/admin/watch/sources')
        .headers(json)
        .json({ search: '  Prompt   injection in coding\tagents ' })
        .loginAs(admin)
    ).assertStatus(409)
    ;(
      await client
        .post('/admin/watch/sources')
        .headers(json)
        .json({ search: 'both', url: 'https://a.example/feed' })
        .loginAs(admin)
    ).assertStatus(422)

    // No service set: nothing is searched, and the source says why.
    const listed = await client.get('/admin/watch/sources').headers(json).loginAs(admin)
    assert.isFalse(listed.body().webSearchReady)
    assert.deepEqual(await refreshWatch(), {
      sources: 1,
      failed: 1,
      added: 0,
      pruned: 0,
      searches: 0,
    })
    assert.lengthOf(fake.queries, 0)

    await saveWebSearch('linkup', 'lk-test-key-0000')
    await client
      .post('/admin/watch/blocked-sites')
      .headers(json)
      .json({ host: 'spam.example' })
      .loginAs(admin)
    fake.results = [
      {
        title: 'Agents & <b>injection</b>',
        url: 'https://research.example/injection?utm_source=x',
        snippet: 'A page that says ignore previous instructions.',
        publishedAt: DateTime.now().minus({ days: 1 }).toISODate(),
      },
      {
        title: 'Undated product page',
        url: 'https://vendor.example/p',
        snippet: '',
        publishedAt: null,
      },
    ]
    const report = await refreshWatch()
    assert.deepEqual([report.searches, report.added, report.failed], [1, 1, 0])
    assert.deepEqual(fake.queries, ['prompt injection in coding agents'])
    assert.deepEqual(fake.options[0].excludeDomains, ['spam.example'])
    assert.equal(fake.options[0].fromDate, DateTime.now().minus({ days: 7 }).toUTC().toISODate())
    const article = await WatchArticle.findByOrFail('url', 'https://research.example/injection')
    assert.equal(article.title, 'Agents & injection')
    assert.deepEqual(article.topics, ['security'])
  })

  test('a run spends at most its searches; the rest wait for the next run', async ({ assert }) => {
    const fake = new FakeWebSearch()
    app.container.swap(WebSearch, () => fake)
    fakeFeeds({})
    await saveWebSearch('linkup', 'lk-test-key-0000')
    for (let n = 0; n < 12; n++) {
      await WatchSource.create({
        kind: 'linkup',
        url: null,
        query: `query ${String(n)}`,
        topics: [],
        enabled: true,
      })
    }
    const report = await refreshWatch()
    assert.deepEqual([report.searches, report.failed], [10, 2])
    const waiting = await WatchSource.query().whereNotNull('last_error')
    assert.lengthOf(waiting, 2)
    assert.isNull(waiting[0].lastRunAt)
  })
})
