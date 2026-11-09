import testUtils from '@adonisjs/core/services/test_utils'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import { stateOf } from '#app/feature-flags/services/feature-flags'
import User from '#app/users/models/user'
import env from '#start/env'

const json = { accept: 'application/json' }
const ADMIN = 'flags-admin@example.com'
const KEY = FeatureFlagKey.LlmSubscriptionChatgpt
const ON = { enabled: true, rollout: 100, rules: [] }
const OFF = { enabled: false, rollout: 0, rules: [] }

function makeUser(email = `flags-${Math.random().toString(36).slice(2)}@example.com`) {
  return User.create({ email, password: 'a-very-strong-passphrase' })
}

test.group('Feature flags routes', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.setup(() => {
    env.set('DEFAULT_ACCOUNT_EMAIL', ADMIN)
    env.set('DEFAULT_ACCOUNT_PASSWORD', 'the-default-passphrase')
    return () => {
      env.set('DEFAULT_ACCOUNT_EMAIL', '')
      env.set('DEFAULT_ACCOUNT_PASSWORD', '')
    }
  })

  test('needs a session', async ({ client }) => {
    ;(await client.get('/features').headers(json)).assertStatus(401)
    ;(await client.get('/admin/feature-flags').headers(json)).assertStatus(401)
    ;(
      await client.put(`/admin/feature-flags/${KEY}`).headers(json).json({ state: ON })
    ).assertStatus(401)
  })

  test('hides the admin routes from everybody else', async ({ client, assert }) => {
    const user = await makeUser()
    ;(await client.get('/admin/feature-flags').headers(json).loginAs(user)).assertStatus(404)
    ;(
      await client
        .put(`/admin/feature-flags/${KEY}`)
        .headers(json)
        .json({ state: ON })
        .loginAs(user)
    ).assertStatus(404)
    const features = await client.get('/features').headers(json).loginAs(user)
    features.assertStatus(200)
    assert.deepEqual(features.body(), {
      flags: { 'llm-subscription-chatgpt': false, 'llm-subscription-claude': false },
    })
  })

  test('lets the admin turn a flag on for everybody', async ({ client, assert }) => {
    const admin = await makeUser(ADMIN)
    const user = await makeUser()
    const list = await client.get('/admin/feature-flags').headers(json).loginAs(admin)
    list.assertStatus(200)
    assert.equal(list.body().environment, 'instance')
    assert.lengthOf(list.body().flags, 2)

    const put = await client
      .put(`/admin/feature-flags/${KEY}`)
      .headers(json)
      .json({ state: ON })
      .loginAs(admin)
    put.assertStatus(200)
    assert.deepEqual(put.body().flag.state, ON)
    assert.equal(put.body().flag.history[0].author, ADMIN)

    const features = await client.get('/features').headers(json).loginAs(user)
    assert.isTrue(features.body().flags[KEY])
  })

  test('refuses an unknown flag and a malformed state', async ({ client, assert }) => {
    const admin = await makeUser(ADMIN)
    ;(
      await client
        .put('/admin/feature-flags/gone-flag')
        .headers(json)
        .json({ state: ON })
        .loginAs(admin)
    ).assertStatus(404)
    const rule = { id: 'r', attribute: 'email', operator: 'in', values: ['a'], serve: true }
    for (const state of [
      { ...ON, rollout: 101 },
      { ...ON, rules: [{ ...rule, operator: 'regex' }] },
      { ...ON, rules: Array.from({ length: 21 }, (_, i) => ({ ...rule, id: `r${i}` })) },
    ]) {
      ;(
        await client.put(`/admin/feature-flags/${KEY}`).headers(json).json({ state }).loginAs(admin)
      ).assertStatus(422)
    }
    assert.deepEqual(await stateOf(KEY), OFF)
  })

  test('has no admin when no default account is configured', async ({ client }) => {
    const admin = await makeUser(ADMIN)
    env.set('DEFAULT_ACCOUNT_EMAIL', '')
    ;(await client.get('/admin/feature-flags').headers(json).loginAs(admin)).assertStatus(404)
    ;(await client.get('/features').headers(json).loginAs(admin)).assertStatus(200)
  })

  test('tells the web app who the admin is', async ({ client, assert }) => {
    const admin = await makeUser(ADMIN)
    const user = await makeUser()
    assert.isTrue((await client.get('/auth/me').headers(json).loginAs(admin)).body().user.isAdmin)
    assert.isFalse((await client.get('/auth/me').headers(json).loginAs(user)).body().user.isAdmin)
  })
})
