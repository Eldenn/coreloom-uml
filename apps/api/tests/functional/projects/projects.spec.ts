import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import Architecture from '#app/architectures/models/architecture'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'

const json = { accept: 'application/json' }

function makeUser() {
  return User.create({
    email: `projects-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

async function createProject(client: TestContext['client'], user: User, name: string) {
  const response = await client.post('/projects').headers(json).loginAs(user).json({ name })
  response.assertStatus(201)
  return response.body().project as { id: number; name: string }
}

async function createArchitecture(
  client: TestContext['client'],
  user: User,
  body: Record<string, unknown>,
) {
  return client.post('/architectures').headers(json).loginAs(user).json(body)
}

test.group('Projects', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates, renames and describes a project', async ({ client }) => {
    const user = await makeUser()

    const created = await client
      .post('/projects')
      .headers(json)
      .loginAs(user)
      .json({ name: '  Billing  ', description: 'Payments and invoices' })
    created.assertStatus(201)
    created.assertBodyContains({
      project: { name: 'Billing', description: 'Payments and invoices', architectureCount: 0 },
    })
    const { id } = created.body().project

    const updated = await client
      .patch(`/projects/${id}`)
      .headers(json)
      .loginAs(user)
      .json({ name: 'Billing v2', description: null })
    updated.assertStatus(200)
    updated.assertBodyContains({ project: { id, name: 'Billing v2', description: null } })

    const shown = await client.get(`/projects/${id}`).headers(json).loginAs(user)
    shown.assertStatus(200)
    shown.assertBodyContains({ project: { id, name: 'Billing v2' } })
  })

  test('rejects a missing or too long name with 422', async ({ client }) => {
    const user = await makeUser()

    const missing = await client.post('/projects').headers(json).loginAs(user).json({ name: ' ' })
    missing.assertStatus(422)
    const long = await client
      .post('/projects')
      .headers(json)
      .loginAs(user)
      .json({ name: 'x'.repeat(121) })
    long.assertStatus(422)
  })

  test('requires a session or an API token', async ({ client }) => {
    const response = await client.get('/projects').headers(json)
    response.assertStatus(401)
  })

  test('lists only the caller projects, with their architecture count and a search', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const other = await makeUser()
    const payments = await createProject(client, user, 'Payments 100%')
    await createProject(client, user, 'Search')
    await createProject(client, other, 'Payments elsewhere')
    await createArchitecture(client, user, { projectId: payments.id, title: 'A' })
    await createArchitecture(client, user, { projectId: payments.id, title: 'B' })

    const all = await client.get('/projects').headers(json).loginAs(user)
    all.assertStatus(200)
    assert.equal(all.body().meta.total, 2)

    const search = await client.get('/projects?search=100%25').headers(json).loginAs(user)
    assert.deepEqual(search.body().data, [
      { ...search.body().data[0], id: payments.id, name: 'Payments 100%', architectureCount: 2 },
    ])
  })

  test('hides another user project behind a 404', async ({ client }) => {
    const owner = await makeUser()
    const intruder = await makeUser()
    const project = await createProject(client, owner, 'Secret')

    for (const request of [
      client.get(`/projects/${project.id}`),
      client.patch(`/projects/${project.id}`).json({ name: 'Mine now' }),
      client.delete(`/projects/${project.id}`),
    ]) {
      const response = await request.headers(json).loginAs(intruder)
      response.assertStatus(404)
    }
  })

  test('deletes a project with its architectures', async ({ client, assert }) => {
    const user = await makeUser()
    const project = await createProject(client, user, 'Doomed')
    const kept = await createProject(client, user, 'Kept')
    const doomed = await createArchitecture(client, user, { projectId: project.id, title: 'A' })
    const other = await createArchitecture(client, user, { projectId: kept.id, title: 'B' })

    const deleted = await client.delete(`/projects/${project.id}`).headers(json).loginAs(user)

    deleted.assertStatus(204)
    assert.isNull(await Project.find(project.id))
    assert.isNull(await Architecture.find(doomed.body().architecture.id))
    assert.isNotNull(await Architecture.find(other.body().architecture.id))
  })
})

test.group('Projects - architectures', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates an architecture in the given project and lists it there', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const first = await createProject(client, user, 'First')
    const second = await createProject(client, user, 'Second')

    const created = await createArchitecture(client, user, { projectId: second.id, title: 'A' })
    created.assertStatus(201)
    created.assertBodyContains({ architecture: { projectId: second.id } })
    await createArchitecture(client, user, { projectId: first.id, title: 'B' })

    const list = await client
      .get(`/architectures?projectId=${second.id}`)
      .headers(json)
      .loginAs(user)
    assert.deepEqual(
      list.body().data.map((a: { title: string }) => a.title),
      ['A'],
    )
  })

  test('keeps an architecture created without a project outside any project', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user, 'Held')
    await createArchitecture(client, user, { projectId: project.id, title: 'In' })

    const omitted = await createArchitecture(client, user, { title: 'A' })
    const explicit = await createArchitecture(client, user, { projectId: null, title: 'B' })

    assert.isNull(omitted.body().architecture.projectId)
    assert.isNull(explicit.body().architecture.projectId)
    assert.lengthOf(await Project.query().where('userId', user.id), 1)

    const all = await client.get('/architectures').headers(json).loginAs(user)
    assert.sameMembers(
      all.body().data.map((a: { title: string }) => a.title),
      ['In', 'A', 'B'],
    )
  })

  test('takes an architecture out of its project, and puts it back', async ({ client }) => {
    const user = await makeUser()
    const project = await createProject(client, user, 'Home')
    const created = await createArchitecture(client, user, { projectId: project.id, title: 'A' })
    const id = created.body().architecture.id

    const out = await client
      .patch(`/architectures/${id}`)
      .headers(json)
      .loginAs(user)
      .json({ projectId: null })
    out.assertStatus(200)
    out.assertBodyContains({ architecture: { projectId: null } })

    const back = await client
      .patch(`/architectures/${id}`)
      .headers(json)
      .loginAs(user)
      .json({ projectId: project.id })
    back.assertBodyContains({ architecture: { projectId: project.id } })
  })

  test('refuses another user project as the target, on create and on move', async ({ client }) => {
    const user = await makeUser()
    const other = await makeUser()
    const theirs = await createProject(client, other, 'Theirs')
    const mine = await createArchitecture(client, user, { title: 'Mine' })

    const created = await createArchitecture(client, user, { projectId: theirs.id, title: 'A' })
    created.assertStatus(404)
    created.assertBodyContains({ error: { message: 'Project not found' } })

    const moved = await client
      .patch(`/architectures/${mine.body().architecture.id}`)
      .headers(json)
      .loginAs(user)
      .json({ projectId: theirs.id })
    moved.assertStatus(404)
  })

  test('moves an architecture to another project; a copy stays in its project', async ({
    client,
  }) => {
    const user = await makeUser()
    const from = await createProject(client, user, 'From')
    const to = await createProject(client, user, 'To')
    const created = await createArchitecture(client, user, { projectId: from.id, title: 'A' })
    const id = created.body().architecture.id

    const copy = await client.post(`/architectures/${id}/duplicate`).headers(json).loginAs(user)
    copy.assertBodyContains({ architecture: { projectId: from.id } })

    const moved = await client
      .patch(`/architectures/${id}`)
      .headers(json)
      .loginAs(user)
      .json({ projectId: to.id })
    moved.assertStatus(200)
    moved.assertBodyContains({ architecture: { id, projectId: to.id, title: 'A' } })
  })
})

test.group('Projects - API tokens', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function tokenFor(client: TestContext['client'], user: User, abilities: string[]) {
    const response = await client
      .post('/account/api-tokens')
      .headers(json)
      .loginAs(user)
      .json({ name: 'Agent', abilities, expiresInDays: 30 })
    response.assertStatus(201)
    return { ...json, authorization: `Bearer ${response.body().secret}` }
  }

  test('reads with a read token and writes only with a write token', async ({ client }) => {
    const user = await makeUser()
    const reader = await tokenFor(client, user, ['read'])
    const writer = await tokenFor(client, user, ['read', 'write'])

    const refused = await client.post('/projects').headers(reader).json({ name: 'A' })
    refused.assertStatus(403)

    const created = await client.post('/projects').headers(writer).json({ name: 'A' })
    created.assertStatus(201)
    const list = await client.get('/projects').headers(reader)
    list.assertStatus(200)
    list.assertBodyContains({ data: [{ id: created.body().project.id, name: 'A' }] })
  })
})
