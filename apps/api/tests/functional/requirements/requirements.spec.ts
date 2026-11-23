import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import Project from '#app/projects/models/project'
import { REQUIREMENT_LIMITS } from '#app/requirements/constants/requirement'
import Requirement from '#app/requirements/models/requirement'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }

async function setup(email: string, enabled = true) {
  const user = await User.create({ email, password: 'a-very-strong-passphrase' })
  if (enabled) await updateFlag(FeatureFlagKey.DesignRecords, ON, user)
  const project = await Project.create({ userId: user.id, name: 'Shop', description: null })
  return { user, project }
}

const body = {
  category: 'availability',
  priority: 'should',
  statement: '  Checkout stays up when the mail provider is down.  ',
}

test.group('Requirements', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('answers 404 while the flag is off', async ({ client }) => {
    const { user, project } = await setup('req-off@example.com', false)
    const base = `/projects/${project.id}/requirements`

    ;(await client.get(base).headers(json).loginAs(user)).assertStatus(404)
    ;(await client.post(base).headers(json).loginAs(user).json(body)).assertStatus(404)
  })

  test('creates, lists the musts first, changes and deletes', async ({ client, assert }) => {
    const { user, project } = await setup('req-crud@example.com')
    const base = `/projects/${project.id}/requirements`

    const created = await client.post(base).headers(json).loginAs(user).json(body)
    created.assertStatus(201)
    created.assertBodyContains({
      requirement: {
        projectId: project.id,
        statement: 'Checkout stays up when the mail provider is down.',
        measure: null,
      },
    })
    const { id } = created.body().requirement
    const must = await client.post(base).headers(json).loginAs(user).json({
      category: 'performance',
      priority: 'must',
      statement: 'Fast.',
      measure: 'p95 300 ms',
    })
    must.assertStatus(201)

    const listed = await client.get(base).headers(json).loginAs(user)
    listed.assertStatus(200)
    assert.deepEqual(
      listed.body().data.map((item: { priority: string }) => item.priority),
      ['must', 'should'],
    )
    assert.equal(listed.body().meta.total, 2)

    const updated = await client
      .patch(`/requirements/${id}`)
      .headers(json)
      .loginAs(user)
      .json({ priority: 'must', measure: '99.9 % a month' })
    updated.assertStatus(200)
    updated.assertBodyContains({
      requirement: { id, priority: 'must', measure: '99.9 % a month', category: 'availability' },
    })

    const shown = await client.get(`/projects/${project.id}`).headers(json).loginAs(user)
    shown.assertBodyContains({ project: { requirementCount: 2, decisionCount: 0 } })

    ;(await client.delete(`/requirements/${id}`).headers(json).loginAs(user)).assertStatus(204)
    assert.isNull(await Requirement.find(id))
  })

  test('refuses an unknown category and an empty statement', async ({ client }) => {
    const { user, project } = await setup('req-invalid@example.com')
    const base = `/projects/${project.id}/requirements`

    const category = await client
      .post(base)
      .headers(json)
      .loginAs(user)
      .json({ ...body, category: 'speed' })
    category.assertStatus(422)
    const statement = await client
      .post(base)
      .headers(json)
      .loginAs(user)
      .json({ ...body, statement: '   ' })
    statement.assertStatus(422)
  })

  test("reads someone else's project and requirement as 404", async ({ client }) => {
    const { project } = await setup('req-owner@example.com')
    const { user: stranger } = await setup('req-stranger@example.com')
    const requirement = await Requirement.create({
      projectId: project.id,
      userId: project.userId,
      category: 'cost',
      priority: 'must',
      statement: 'Cheap.',
      measure: null,
    })

    const base = `/projects/${project.id}/requirements`
    ;(await client.get(base).headers(json).loginAs(stranger)).assertStatus(404)
    ;(await client.post(base).headers(json).loginAs(stranger).json(body)).assertStatus(404)
    const patched = await client
      .patch(`/requirements/${requirement.id}`)
      .headers(json)
      .loginAs(stranger)
      .json({ statement: 'Mine now.' })
    patched.assertStatus(404)
    const deleted = await client
      .delete(`/requirements/${requirement.id}`)
      .headers(json)
      .loginAs(stranger)
    deleted.assertStatus(404)
  })

  test('answers 409 past the limit of a project', async ({ client }) => {
    const { user, project } = await setup('req-full@example.com')
    await Requirement.createMany(
      Array.from({ length: REQUIREMENT_LIMITS.perProject }, (_, index) => ({
        projectId: project.id,
        userId: user.id,
        category: 'constraint' as const,
        priority: 'should' as const,
        statement: `Constraint ${index}`,
        measure: null,
      })),
    )

    const response = await client
      .post(`/projects/${project.id}/requirements`)
      .headers(json)
      .loginAs(user)
      .json(body)
    response.assertStatus(409)
  })

  test('goes with its project', async ({ client, assert }) => {
    const { user, project } = await setup('req-cascade@example.com')
    const created = await client
      .post(`/projects/${project.id}/requirements`)
      .headers(json)
      .loginAs(user)
      .json(body)

    ;(await client.delete(`/projects/${project.id}`).headers(json).loginAs(user)).assertStatus(204)
    assert.isNull(await Requirement.find(created.body().requirement.id))
  })
})
