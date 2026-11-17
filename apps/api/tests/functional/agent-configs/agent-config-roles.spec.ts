import testUtils from '@adonisjs/core/services/test_utils'
import { CATALOG_VERSION, MARKER_PREFIX, type Role } from '@coreloom-uml/catalog'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import { AGENT_ROLES_MAX } from '#app/agent-configs/constants/agent-config'
import AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import AgentConfigRole from '#app/agent-configs/models/agent-config-role'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

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

const json = { accept: 'application/json' }
const FLAG_ON = { enabled: true, rollout: 100, rules: [] }

type Client = TestContext['client']

/** A user with the flag on (unless told otherwise) and a configuration answering `checks`. */
async function setup(
  client: Client,
  { flag = true, targets = ['claude-code'] }: { flag?: boolean; targets?: string[] } = {},
) {
  const user = await User.create({
    email: `agent-roles-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  if (flag) await updateFlag(FeatureFlagKey.AgentRoles, FLAG_ON, user)
  const created = await client
    .post('/agent-configs')
    .headers(json)
    .loginAs(user)
    .json({
      name: 'Storefront',
      projectId: null,
      questionnaires: ['frontend-react'],
      targets,
    })
  created.assertStatus(201)
  const configId = created.body().config.id as number
  const answered = await client
    .put(`/agent-configs/${configId}/answers`)
    .headers(json)
    .loginAs(user)
    .json({
      answers: [
        {
          questionnaireId: 'frontend-react',
          questionId: 'checks',
          value: 'pnpm lint && pnpm test',
        },
      ],
    })
  answered.assertStatus(200)
  return { user, configId }
}

const NEW_ROLE = {
  slug: 'docs-writer',
  name: 'Docs writer',
  description: 'Keeps the documentation in step with the code.',
  mission: 'Write and fix the documentation.',
  rights: ['read', 'write'],
}

async function revisionOf(configId: number) {
  return (await AgentConfig.findOrFail(configId)).revision
}

function postRole(client: Client, user: User, configId: number, body: object) {
  return client.post(`/agent-configs/${configId}/roles`).headers(json).loginAs(user).json(body)
}

function patchRole(client: Client, user: User, configId: number, roleId: number, body: object) {
  return client
    .patch(`/agent-configs/${configId}/roles/${roleId}`)
    .headers(json)
    .loginAs(user)
    .json(body)
}

function deleteRole(client: Client, user: User, configId: number, roleId: number) {
  return client.delete(`/agent-configs/${configId}/roles/${roleId}`).headers(json).loginAs(user)
}

test.group('Agent configs - roles routes', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('answers 404 on every route while the flag is off', async ({ client }) => {
    const { user, configId } = await setup(client, { flag: false })
    const role = await AgentConfigRole.create({ ...ROLE, agentConfigId: configId })

    ;(await postRole(client, user, configId, NEW_ROLE)).assertStatus(404)
    ;(await patchRole(client, user, configId, role.id, { name: 'Other' })).assertStatus(404)
    ;(await deleteRole(client, user, configId, role.id)).assertStatus(404)
    // Not even the validation runs.
    ;(await postRole(client, user, configId, {})).assertStatus(404)
  })

  test("answers 404 for someone else's configuration", async ({ client }) => {
    const { configId } = await setup(client)
    const { user: other } = await setup(client)

    const response = await postRole(client, other, configId, NEW_ROLE)
    response.assertStatus(404)
    response.assertBodyContains({ error: { message: 'Agent configuration not found' } })
  })

  test('creates a role from scratch with defaults and bumps the revision', async ({
    client,
    assert,
  }) => {
    const { user, configId } = await setup(client)
    const before = await revisionOf(configId)

    const response = await postRole(client, user, configId, NEW_ROLE)
    response.assertStatus(201)
    assert.containsSubset(response.body().role, {
      ...NEW_ROLE,
      scope: [],
      forbidden: [],
      done: { commands: [], text: null },
      escalation: null,
      source: null,
    })
    assert.property(response.body(), 'impact')
    assert.equal(await revisionOf(configId), before + 1)
  })

  test('creates a role from a preset with the configuration checks', async ({ client, assert }) => {
    const { user, configId } = await setup(client)

    const response = await postRole(client, user, configId, { preset: 'code-reviewer' })
    response.assertStatus(201)
    const role = response.body().role
    assert.equal(role.slug, 'code-reviewer')
    assert.deepEqual(role.rights, ['read', 'run-checks'])
    assert.deepEqual(role.done.commands, ['pnpm lint', 'pnpm test'])
    assert.equal(role.source.preset, 'code-reviewer')
  })

  test('refuses an unknown preset', async ({ client }) => {
    const { user, configId } = await setup(client)
    const response = await postRole(client, user, configId, { preset: 'no-such-preset' })
    response.assertStatus(422)
    response.assertBodyContains({ error: { message: 'Unknown preset: no-such-preset' } })
  })

  test('refuses shell without run-checks and lists the problems', async ({ client, assert }) => {
    const { user, configId } = await setup(client)
    const before = await revisionOf(configId)

    const response = await postRole(client, user, configId, {
      ...NEW_ROLE,
      rights: ['read', 'shell'],
    })
    response.assertStatus(422)
    assert.include(response.body().error.problems, 'rights: shell needs run-checks')
    assert.equal(await revisionOf(configId), before)
  })

  test('refuses a slug already taken', async ({ client }) => {
    const { user, configId } = await setup(client)
    ;(await postRole(client, user, configId, NEW_ROLE)).assertStatus(201)

    const response = await postRole(client, user, configId, NEW_ROLE)
    response.assertStatus(409)
    response.assertBodyContains({ error: { message: 'A role with this slug already exists' } })
  })

  test('refuses a role beyond the maximum', async ({ client }) => {
    const { user, configId } = await setup(client)
    for (let index = 0; index < AGENT_ROLES_MAX; index++) {
      await AgentConfigRole.create({ ...ROLE, slug: `role-${index}`, agentConfigId: configId })
    }

    const response = await postRole(client, user, configId, NEW_ROLE)
    response.assertStatus(422)
  })

  test('refuses a marker in a field', async ({ client }) => {
    const { user, configId } = await setup(client)
    const response = await postRole(client, user, configId, {
      ...NEW_ROLE,
      name: `${MARKER_PREFIX} begin`,
    })
    response.assertStatus(422)
  })

  test('changes a role, keeps its source, and refuses the slug of another', async ({
    client,
    assert,
  }) => {
    const { user, configId } = await setup(client)
    const preset = (await postRole(client, user, configId, { preset: 'code-reviewer' })).body()
    ;(await postRole(client, user, configId, NEW_ROLE)).assertStatus(201)
    const before = await revisionOf(configId)

    const renamed = await patchRole(client, user, configId, preset.role.id, { name: 'Reviewer' })
    renamed.assertStatus(200)
    assert.equal(renamed.body().role.name, 'Reviewer')
    assert.equal(renamed.body().role.source.preset, 'code-reviewer')
    assert.equal(await revisionOf(configId), before + 1)

    const clash = await patchRole(client, user, configId, preset.role.id, { slug: NEW_ROLE.slug })
    clash.assertStatus(409)
    assert.equal(await revisionOf(configId), before + 1)
  })

  test('a change that changes nothing does not bump the revision', async ({ client, assert }) => {
    const { user, configId } = await setup(client)
    const created = (await postRole(client, user, configId, NEW_ROLE)).body()
    const before = await revisionOf(configId)

    // Rights in another order are the same rights.
    const response = await patchRole(client, user, configId, created.role.id, {
      name: NEW_ROLE.name,
      rights: ['write', 'read'],
    })
    response.assertStatus(200)
    assert.equal(await revisionOf(configId), before)
  })

  test('answers 404 for a role of another configuration', async ({ client }) => {
    const { user, configId } = await setup(client)
    const { configId: otherConfigId } = await setup(client)
    const role = await AgentConfigRole.create({ ...ROLE, agentConfigId: otherConfigId })

    const response = await patchRole(client, user, configId, role.id, { name: 'Other' })
    response.assertStatus(404)
    response.assertBodyContains({ error: { message: 'Role not found' } })
    ;(await deleteRole(client, user, configId, role.id)).assertStatus(404)
  })

  test('deletes a role and bumps the revision', async ({ client, assert }) => {
    const { user, configId } = await setup(client)
    const created = (await postRole(client, user, configId, NEW_ROLE)).body()
    const before = await revisionOf(configId)

    ;(await deleteRole(client, user, configId, created.role.id)).assertStatus(204)
    assert.isNull(await AgentConfigRole.find(created.role.id))
    assert.equal(await revisionOf(configId), before + 1)
  })
})

const REVIEWER_FILES = ['.claude/agents/reviewer.md', '.codex/agents/reviewer.toml']

function generate(client: Client, user: User, configId: number) {
  return client.post(`/agent-configs/${configId}/generations`).headers(json).loginAs(user)
}

async function impactOf(client: Client, user: User, configId: number) {
  const response = await client.get(`/agent-configs/${configId}`).headers(json).loginAs(user)
  response.assertStatus(200)
  return response.body().impact as { files: { path: string; change: string }[] }
}

test.group('Agent configs - roles in generations', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('renders a role for each target and stores its launch and matrix', async ({
    client,
    assert,
  }) => {
    const { user, configId } = await setup(client, { targets: ['claude-code', 'codex'] })
    ;(await postRole(client, user, configId, { ...NEW_ROLE, slug: 'reviewer' })).assertStatus(201)

    const response = await generate(client, user, configId)
    response.assertStatus(201)
    const generation = response.body().generation
    const paths = generation.files.map((file: { path: string }) => file.path)
    for (const path of REVIEWER_FILES) assert.include(paths, path)
    assert.lengthOf(generation.roles, 2)
    for (const role of generation.roles) {
      assert.equal(role.slug, 'reviewer')
      assert.property(role, 'launch')
      assert.property(role, 'matrix')
    }
    assert.sameMembers(
      generation.roles.map((role: { target: string }) => role.target),
      ['claude-code', 'codex'],
    )
  })

  test('replays a generation stored before roles, listing the role files as added', async ({
    client,
    assert,
  }) => {
    const { user, configId } = await setup(client, { targets: ['claude-code', 'codex'] })
    ;(await generate(client, user, configId)).assertStatus(201)
    // A generation stored before roles existed: its inputs have no `roles` key.
    const latest = await AgentConfigGeneration.query()
      .where('agentConfigId', configId)
      .orderBy('id', 'desc')
      .firstOrFail()
    const { roles: _roles, ...inputs } = latest.inputs
    latest.inputs = inputs as AgentConfigGeneration['inputs']
    await latest.save()
    await latest.refresh()
    assert.notProperty(latest.inputs, 'roles')
    ;(await postRole(client, user, configId, { ...NEW_ROLE, slug: 'reviewer' })).assertStatus(201)

    const impact = await impactOf(client, user, configId)
    for (const path of REVIEWER_FILES) {
      assert.deepInclude(
        impact.files.map(({ path: file, change }) => ({ path: file, change })),
        { path, change: 'added' },
      )
    }
  })

  test('deleting a role lists its files as removed', async ({ client, assert }) => {
    const { user, configId } = await setup(client, { targets: ['claude-code', 'codex'] })
    const created = await postRole(client, user, configId, { ...NEW_ROLE, slug: 'reviewer' })
    ;(await generate(client, user, configId)).assertStatus(201)
    ;(await deleteRole(client, user, configId, created.body().role.id)).assertStatus(204)

    const impact = await impactOf(client, user, configId)
    for (const path of REVIEWER_FILES) {
      assert.deepInclude(
        impact.files.map(({ path: file, change }) => ({ path: file, change })),
        { path, change: 'removed' },
      )
    }
  })
})
