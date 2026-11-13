import { AGENCY_AGENTS_COMMIT, AGENCY_AGENTS_REPOSITORY } from '@coreloom-uml/catalog'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

const json = { accept: 'application/json' }

async function makeUser({ flag }: { flag: boolean }) {
  const user = await User.create({
    email: `role-presets-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  if (flag) {
    await updateFlag(FeatureFlagKey.AgentRoles, { enabled: true, rollout: 100, rules: [] }, user)
  }
  return user
}

test.group('Role presets', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('lists the ready-made roles without their missions', async ({ client, assert }) => {
    const user = await makeUser({ flag: true })

    const response = await client.get('/role-presets').headers(json).loginAs(user)
    response.assertStatus(200)
    const presets = response.body().presets
    assert.lengthOf(presets, 66)
    const reviewer = presets.find((preset: { slug: string }) => preset.slug === 'code-reviewer')
    assert.deepEqual(Object.keys(reviewer).sort(), [
      'description',
      'name',
      'readOnly',
      'slug',
      'source',
    ])
    assert.isTrue(reviewer.readOnly)
    assert.deepEqual(reviewer.source, {
      repository: AGENCY_AGENTS_REPOSITORY,
      commit: AGENCY_AGENTS_COMMIT,
    })
    assert.notInclude(response.text(), '"mission"')
  })

  test('answers 404 while the flag is off', async ({ client }) => {
    const user = await makeUser({ flag: false })
    ;(await client.get('/role-presets').headers(json).loginAs(user)).assertStatus(404)
  })

  test('answers 401 without a session', async ({ client }) => {
    ;(await client.get('/role-presets').headers(json)).assertStatus(401)
  })
})
