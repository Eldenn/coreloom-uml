import testUtils from '@adonisjs/core/services/test_utils'
import { CATALOG_VERSION, type Role } from '@coreloom-uml/catalog'
import { test } from '@japa/runner'
import AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import AgentConfigRole from '#app/agent-configs/models/agent-config-role'
import User from '#app/users/models/user'

const ROLE: Role = {
  slug: 'reviewer',
  name: 'Reviewer',
  description: 'Reads a change and reports what is wrong with it.',
  mission: 'x'.repeat(40_000),
  rights: ['read', 'run-checks'],
  scope: ['apps/api'],
  forbidden: ['Never edit a file.'],
  done: { commands: ['pnpm test'], text: 'Every finding has a location.' },
  escalation: 'Ask the owner when a finding is unclear.',
  source: { preset: 'code-reviewer', commit: 'a'.repeat(40) },
}

async function makeConfig() {
  const user = await User.create({
    email: `agent-roles-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  return AgentConfig.create({
    userId: user.id,
    projectId: null,
    name: 'Storefront',
    questionnaires: [],
    targets: [],
    revision: 1,
  })
}

test.group('Agent configs - roles storage', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('stores a role with a long mission and reads it back as written', async ({ assert }) => {
    const config = await makeConfig()
    await config.related('roles').create({ ...ROLE })

    await config.load('roles')
    assert.lengthOf(config.roles, 1)
    assert.deepEqual(config.roles[0].toRole(), ROLE)
  })

  test('refuses two roles with the same slug in one configuration', async ({ assert }) => {
    const config = await makeConfig()
    await config.related('roles').create({ ...ROLE })
    await assert.rejects(() => config.related('roles').create({ ...ROLE }))
  })

  test('deletes the roles with their configuration', async ({ assert }) => {
    const config = await makeConfig()
    await config.related('roles').create({ ...ROLE })
    await config.delete()
    assert.lengthOf(await AgentConfigRole.query().where('agent_config_id', config.id), 0)
  })

  test('a generation holds no role unless given some', async ({ assert }) => {
    const config = await makeConfig()
    const generation = await AgentConfigGeneration.create({
      agentConfigId: config.id,
      revision: 1,
      catalogVersion: CATALOG_VERSION,
      inputs: {} as AgentConfigGeneration['inputs'],
      files: [],
      recommendations: [],
      skills: { compatible: [], conflicting: [] },
    })
    await generation.refresh()
    assert.deepEqual(generation.roles, [])
  })
})
