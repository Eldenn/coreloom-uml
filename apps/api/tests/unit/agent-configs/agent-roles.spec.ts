import { MARKER_PREFIX } from '@coreloom-uml/catalog'
import { test } from '@japa/runner'
import { errors } from '@vinejs/vine'
import { DateTime } from 'luxon'
import AgentConfigRole from '#app/agent-configs/models/agent-config-role'
import { serializeAgentRole } from '#app/agent-configs/serializers/agent-config-serializer'
import {
  createAgentRoleFromPresetInput,
  createAgentRoleInput,
  updateAgentRoleInput,
} from '#app/agent-configs/validators/agent-configs-input'

const role = {
  slug: 'reviewer',
  name: 'Reviewer',
  description: 'Reads a change and lists what is wrong with it.',
  mission: '# Reviewer\n\nRead the diff.',
  rights: ['read', 'run-checks'],
  scope: ['apps/api'],
  forbidden: ['Never edit a file'],
  done: { commands: ['pnpm test'], text: 'Every finding has a line.' },
  escalation: 'Ask when the change has no description.',
}

test.group('Agent configs - role inputs', () => {
  test('a valid role passes', async ({ assert }) => {
    assert.deepEqual(await createAgentRoleInput.validate(role), role)
  })

  test('only the required fields pass', async ({ assert }) => {
    const { slug, name, description, mission, rights } = role
    const minimal = { slug, name, description, mission, rights }
    assert.deepEqual(await createAgentRoleInput.validate(minimal), minimal)
  })

  test('a marker in the mission is refused', async ({ assert }) => {
    await assert.rejects(
      () => createAgentRoleInput.validate({ ...role, mission: `x ${MARKER_PREFIX} y` }),
      errors.E_VALIDATION_ERROR,
    )
  })

  test('a marker in a forbidden line is refused', async ({ assert }) => {
    await assert.rejects(
      () => createAgentRoleInput.validate({ ...role, forbidden: [`${MARKER_PREFIX} end`] }),
      errors.E_VALIDATION_ERROR,
    )
  })

  test('a marker in a done command is refused', async ({ assert }) => {
    await assert.rejects(
      () =>
        createAgentRoleInput.validate({ ...role, done: { commands: [MARKER_PREFIX], text: null } }),
      errors.E_VALIDATION_ERROR,
    )
  })

  test('an unknown right is refused', async ({ assert }) => {
    await assert.rejects(
      () => createAgentRoleInput.validate({ ...role, rights: ['fly'] }),
      errors.E_VALIDATION_ERROR,
    )
    await assert.rejects(
      () => updateAgentRoleInput.validate({ rights: ['fly'] }),
      errors.E_VALIDATION_ERROR,
    )
  })

  test('a list longer than the catalog allows is refused', async ({ assert }) => {
    await assert.rejects(
      () => createAgentRoleInput.validate({ ...role, forbidden: Array(31).fill('No') }),
      errors.E_VALIDATION_ERROR,
    )
  })

  test('an update takes any subset of the fields', async ({ assert }) => {
    assert.deepEqual(await updateAgentRoleInput.validate({}), {})
    assert.deepEqual(await updateAgentRoleInput.validate({ name: 'Critic' }), { name: 'Critic' })
  })

  test('a preset is created from its id', async ({ assert }) => {
    assert.deepEqual(await createAgentRoleFromPresetInput.validate({ preset: 'reviewer' }), {
      preset: 'reviewer',
    })
    await assert.rejects(
      () => createAgentRoleFromPresetInput.validate({ preset: '' }),
      errors.E_VALIDATION_ERROR,
    )
  })
})

test.group('Agent configs - role serializer', () => {
  test('serializes the role with its id and dates', ({ assert }) => {
    const source = { preset: 'reviewer', commit: 'a'.repeat(40) }
    const date = DateTime.fromISO('2026-11-13T10:00:00.000Z', { zone: 'utc' })
    const row = new AgentConfigRole()
    row.merge({
      id: 7,
      agentConfigId: 3,
      ...role,
      rights: ['read', 'run-checks'],
      escalation: null,
      source,
      createdAt: date,
      updatedAt: date,
    })
    assert.deepEqual(serializeAgentRole(row), {
      id: 7,
      ...role,
      rights: ['read', 'run-checks'],
      escalation: null,
      source,
      createdAt: '2026-11-13T10:00:00.000Z',
      updatedAt: '2026-11-13T10:00:00.000Z',
    })
  })
})
