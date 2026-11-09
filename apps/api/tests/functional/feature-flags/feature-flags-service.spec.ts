import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { FEATURE_FLAGS, FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import FeatureFlagChange from '#app/feature-flags/models/feature-flag-change'
import {
  describeChange,
  evaluateAll,
  isFeatureEnabled,
  listForAdmin,
  stateOf,
  updateFlag,
} from '#app/feature-flags/services/feature-flags'
import User from '#app/users/models/user'

const KEY = FeatureFlagKey.LlmSubscriptionChatgpt
const ON = { enabled: true, rollout: 100, rules: [] }

function makeUser() {
  return User.create({
    email: `flags-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

test.group('Feature flags service', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('reads the declared default when nothing is stored', async ({ assert }) => {
    const user = await makeUser()
    assert.deepEqual(await stateOf(KEY), { enabled: false, rollout: 0, rules: [] })
    assert.isFalse(await isFeatureEnabled(KEY, user))
  })

  test('stores a new state with one history line, and only when it changes', async ({ assert }) => {
    const admin = await makeUser()
    const user = await makeUser()
    await updateFlag(KEY, ON, admin)
    await updateFlag(KEY, ON, admin)
    assert.isTrue(await isFeatureEnabled(KEY, user))
    const changes = await FeatureFlagChange.query().where('flag_key', KEY)
    assert.lengthOf(changes, 1)
    assert.equal(changes[0].userId, admin.id)
    assert.include(changes[0].text, 'Enabled')

    const [flag] = (await listForAdmin()).filter((f) => f.key === KEY)
    assert.deepEqual(flag.state, ON)
    assert.equal(flag.history[0].author, admin.email)
  })

  test('ignores a stored flag that is no longer declared', async ({ assert }) => {
    const user = await makeUser()
    await db.table('feature_flags').insert({
      key: 'gone-flag',
      state: JSON.stringify(ON),
      updated_at: new Date(),
    })
    const declared = FEATURE_FLAGS.map((f) => f.key).sort()
    assert.deepEqual(Object.keys(await evaluateAll(user)).sort(), declared)
    assert.deepEqual((await listForAdmin()).map((f) => f.key).sort(), declared)
  })

  test('reads a malformed stored state as the default', async ({ assert }) => {
    await db.table('feature_flags').insert({
      key: KEY,
      state: JSON.stringify({ enabled: true, rollout: 900 }),
      updated_at: new Date(),
    })
    assert.deepEqual(await stateOf(KEY), { enabled: false, rollout: 0, rules: [] })
  })

  test('describes a change in a line', ({ assert }) => {
    const off = { enabled: false, rollout: 25, rules: [] }
    assert.equal(describeChange(off, off), null)
    assert.equal(
      describeChange(off, { ...off, enabled: true, rollout: 50 }),
      'Enabled, rollout 25% → 50%',
    )
  })
})
