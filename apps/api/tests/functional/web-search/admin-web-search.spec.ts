import app from '@adonisjs/core/services/app'
import { test } from '@japa/runner'
import User from '#app/users/models/user'
import { WebSearchFailure } from '#app/web-search/constants/web-search'
import WebSearchSetting from '#app/web-search/models/web-search-setting'
import WebSearch from '#app/web-search/services/web-search'
import type { WebSearchOutput } from '#app/web-search/validators/web-search-output'
import env from '#start/env'
import { FakeWebSearch } from '#tests/helpers/fake-web-search'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'
import { keepWebSearchSetting } from '#tests/helpers/web-search-setting'

/**
 * The instance's web search service, for the admin: saved only after the service accepted the key,
 * the key sealed and never answered or logged. Linkup is never called.
 */

const json = { accept: 'application/json' }
const ADMIN = 'web-search-admin@example.com'
const API_KEY = 'linkup-key-0123456789-abcd'

async function admin() {
  return (
    (await User.findBy('email', ADMIN)) ??
    User.create({ email: ADMIN, password: 'a-very-strong-passphrase' })
  )
}

test.group('Admin: web search service', (group) => {
  group.setup(() => keepWebSearchSetting())
  let fake: FakeWebSearch
  group.each.setup(() => {
    env.set('DEFAULT_ACCOUNT_EMAIL', ADMIN)
    env.set('DEFAULT_ACCOUNT_PASSWORD', 'the-default-passphrase')
    fake = new FakeWebSearch()
    app.container.swap(WebSearch, () => fake)
    return async () => {
      app.container.restore(WebSearch)
      env.set('DEFAULT_ACCOUNT_EMAIL', '')
      env.set('DEFAULT_ACCOUNT_PASSWORD', '')
      await WebSearchSetting.query().delete()
    }
  })

  test('is for the admin only', async ({ client }) => {
    const user = await User.create({
      email: `web-search-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'a-very-strong-passphrase',
    })
    ;(await client.get('/admin/web-search').headers(json)).assertStatus(401)
    ;(await client.get('/admin/web-search').headers(json).loginAs(user)).assertStatus(404)
    ;(
      await client
        .put('/admin/web-search')
        .headers(json)
        .json({ kind: 'linkup', apiKey: API_KEY })
        .loginAs(user)
    ).assertStatus(404)
    ;(await client.delete('/admin/web-search').headers(json).loginAs(user)).assertStatus(404)
  })

  test('a key the service refuses is not stored', async ({ client, assert }) => {
    const user = await admin()
    fake.checkFailure = WebSearchFailure.Unauthorized
    const refused = await client
      .put('/admin/web-search')
      .headers(json)
      .json({ kind: 'linkup', apiKey: API_KEY })
      .loginAs(user)
    refused.assertStatus(422)
    assert.equal(refused.body().error.reason, 'unauthorized')
    assert.notInclude(refused.text(), API_KEY)
    const shown = await client.get('/admin/web-search').headers(json).loginAs(user)
    assert.deepEqual(shown.body(), { service: null })
  })

  test('a key on more than one line is refused', async ({ client }) => {
    const user = await admin()
    ;(
      await client
        .put('/admin/web-search')
        .headers(json)
        .json({ kind: 'linkup', apiKey: 'linkup-key-0123\n456789-abcd' })
        .loginAs(user)
    ).assertStatus(422)
  })

  test('a good key is saved and only its hint is answered', async ({ client, assert }) => {
    const user = await admin()
    const logs = captureLogs()
    try {
      const saved = await client
        .put('/admin/web-search')
        .headers(json)
        .json({ kind: 'linkup', apiKey: API_KEY })
        .loginAs(user)
      saved.assertStatus(200)
      const body: WebSearchOutput = saved.body()
      assert.equal(body.service?.kind, 'linkup')
      assert.equal(body.service?.keyHint, 'abcd')
      assert.isString(body.service?.verifiedAt)
      assert.notInclude(saved.text(), API_KEY)

      const shown = await client.get('/admin/web-search').headers(json).loginAs(user)
      assert.deepEqual(shown.body(), body)
      assert.notInclude(shown.text(), API_KEY)
    } finally {
      logs.restore()
    }
    assert.notInclude(logs.lines.join('\n'), API_KEY)
    assert.notInclude(await dumpDatabase(), API_KEY)
  })

  test('deleting forgets the service', async ({ client, assert }) => {
    const user = await admin()
    ;(
      await client
        .put('/admin/web-search')
        .headers(json)
        .json({ kind: 'linkup', apiKey: API_KEY })
        .loginAs(user)
    ).assertStatus(200)
    ;(await client.delete('/admin/web-search').headers(json).loginAs(user)).assertStatus(204)
    const shown = await client.get('/admin/web-search').headers(json).loginAs(user)
    assert.deepEqual(shown.body(), { service: null })
  })

  test('a row whose key no longer opens reads as no service', async ({ client, assert }) => {
    const user = await admin()
    ;(
      await client
        .put('/admin/web-search')
        .headers(json)
        .json({ kind: 'linkup', apiKey: API_KEY })
        .loginAs(user)
    ).assertStatus(200)
    await WebSearchSetting.query().update({ sealedKey: 'sealed-with-another-key' })
    const shown = await client.get('/admin/web-search').headers(json).loginAs(user)
    assert.deepEqual(shown.body(), { service: null })
  })
})
