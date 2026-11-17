import { FEATURE_FLAGS, FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import { agentRolesEnabled } from '#app/agent-configs/services/roles-flag'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

function makeUser() {
  return User.create({
    email: `roles-flag-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

test.group('Agent configs - roles flag', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('is declared and off by default', async ({ assert }) => {
    const flag = FEATURE_FLAGS.find((f) => f.key === FeatureFlagKey.AgentRoles)
    assert.equal(FeatureFlagKey.AgentRoles, 'agent-roles')
    assert.deepEqual(flag?.defaultState, { enabled: false, rollout: 0, rules: [] })
    assert.isFalse(await agentRolesEnabled(await makeUser()))
  })

  test('follows the stored state', async ({ assert }) => {
    const user = await makeUser()
    await updateFlag(FeatureFlagKey.AgentRoles, { enabled: true, rollout: 100, rules: [] }, user)
    assert.isTrue(await agentRolesEnabled(user))
  })
})
