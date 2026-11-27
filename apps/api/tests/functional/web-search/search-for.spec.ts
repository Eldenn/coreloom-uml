import app from '@adonisjs/core/services/app'
import redis from '@adonisjs/redis/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import User from '#app/users/models/user'
import { WEB_SEARCH_LIMITS, WebSearchFailure } from '#app/web-search/constants/web-search'
import {
  cleanQuery,
  searchCountKey,
  searchFor,
  webSearchOffered,
} from '#app/web-search/services/search-for'
import WebSearch from '#app/web-search/services/web-search'
import { saveWebSearch } from '#app/web-search/services/web-search-settings'
import { FakeWebSearch } from '#tests/helpers/fake-web-search'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs } from '#tests/helpers/leaks'

/**
 * `searchFor` is the only caller of the search client: it counts each account's searches of the
 * day in Redis and refuses past the limit without reaching the service. Linkup is never called.
 */

const API_KEY = 'linkup-key-0123456789-abcd'

function makeUser() {
  return User.create({
    email: `search-for-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

test.group('searchFor', (group) => {
  let fake: FakeWebSearch
  const users: User[] = []
  group.each.setup(async () => {
    const rollback = await withDefaultFlags()
    fake = new FakeWebSearch()
    app.container.swap(WebSearch, () => fake)
    return async () => {
      app.container.restore(WebSearch)
      if (users.length > 0) await redis.del(...users.map((user) => searchCountKey(user.id)))
      users.length = 0
      await rollback()
    }
  })

  async function account() {
    const user = await makeUser()
    users.push(user)
    return user
  }

  test('cleanQuery trims, joins whitespace and cuts', ({ assert }) => {
    assert.equal(cleanQuery('  a\n b  '), 'a b')
    assert.lengthOf(cleanQuery('x'.repeat(500)), WEB_SEARCH_LIMITS.queryMaxLength)
  })

  test('past the daily limit the service is not called, and other accounts are not affected', async ({
    assert,
  }) => {
    await saveWebSearch('linkup', API_KEY)
    const user = await account()
    const other = await account()
    for (let i = 0; i < WEB_SEARCH_LIMITS.perAccountPerDay; i++) {
      assert.deepEqual(await searchFor(user, '  adonis  queues '), { results: [] })
    }
    assert.deepEqual(await searchFor(user, 'one more'), { failure: WebSearchFailure.Quota })
    assert.lengthOf(fake.queries, WEB_SEARCH_LIMITS.perAccountPerDay)
    assert.equal(fake.queries[0], 'adonis queues')
    assert.deepEqual(await searchFor(other, 'another account'), { results: [] })
    assert.lengthOf(fake.queries, WEB_SEARCH_LIMITS.perAccountPerDay + 1)
    const ttl = await redis.ttl(searchCountKey(user.id))
    assert.isAbove(ttl, 0)
    assert.isAtMost(ttl, 48 * 3600)
  })

  test('with no service saved the answer is unavailable', async ({ assert }) => {
    const user = await account()
    assert.deepEqual(await searchFor(user, 'anything'), { failure: WebSearchFailure.Unavailable })
    assert.lengthOf(fake.queries, 0)
  })

  test('a Redis error answers unavailable and the service is not called', async ({ assert }) => {
    await saveWebSearch('linkup', API_KEY)
    const user = await account()
    const stubbed = redis as unknown as Record<string, unknown>
    stubbed.incr = async () => {
      throw new Error('redis down')
    }
    try {
      assert.deepEqual(await searchFor(user, 'anything'), {
        failure: WebSearchFailure.Unavailable,
      })
    } finally {
      delete stubbed.incr
    }
    assert.lengthOf(fake.queries, 0)
  })

  test('the log line holds neither the query nor the key', async ({ assert }) => {
    await saveWebSearch('linkup', API_KEY)
    const user = await account()
    const logs = captureLogs()
    try {
      await searchFor(user, 'secret-looking query')
    } finally {
      logs.restore()
    }
    const text = logs.lines.join('\n')
    assert.include(text, `"userId":${user.id}`)
    assert.notInclude(text, 'secret-looking')
    assert.notInclude(text, API_KEY)
  })

  test('is offered with the flag on and a service saved', async ({ assert }) => {
    const user = await account()
    assert.isFalse(await webSearchOffered(user))
    await updateFlag(FeatureFlagKey.WebSearch, { enabled: true, rollout: 100, rules: [] }, user)
    assert.isFalse(await webSearchOffered(user))
    await saveWebSearch('linkup', API_KEY)
    assert.isTrue(await webSearchOffered(user))
  })
})
