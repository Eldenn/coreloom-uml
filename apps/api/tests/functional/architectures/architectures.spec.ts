import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import Architecture from '#app/architectures/models/architecture'
import User from '#app/users/models/user'

function makeUser(email: string) {
  return User.create({ email, password: 'a-very-strong-passphrase' })
}

const json = { accept: 'application/json' }

test.group('Architectures', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates a private architecture with one empty diagram', async ({ client, assert }) => {
    const user = await makeUser('arch-create@example.com')

    const response = await client
      .post('/architectures')
      .headers(json)
      .loginAs(user)
      .json({
        title: 'Billing',
        description: 'Payments and invoices',
        diagram: { kind: 'deployment' },
      })

    response.assertStatus(201)
    response.assertBodyContains({
      architecture: {
        title: 'Billing',
        visibility: 'private',
        description: 'Payments and invoices',
      },
    })
    const [diagram] = response.body().architecture.diagrams
    assert.equal(diagram.kind, 'deployment')
    assert.isNull(diagram.content)
    assert.equal(diagram.version, 1)
  })

  test('defaults the first diagram to a C4 context view', async ({ client }) => {
    const user = await makeUser('arch-default@example.com')

    const response = await client
      .post('/architectures')
      .headers(json)
      .loginAs(user)
      .json({ title: 'Shop' })

    response.assertStatus(201)
    response.assertBodyContains({ architecture: { diagrams: [{ kind: 'c4', title: 'Context' }] } })
  })

  test('rejects a missing or too long title with 422', async ({ client }) => {
    const user = await makeUser('arch-invalid@example.com')

    const missing = await client.post('/architectures').headers(json).loginAs(user).json({})
    missing.assertStatus(422)
    const long = await client
      .post('/architectures')
      .headers(json)
      .loginAs(user)
      .json({ title: 'x'.repeat(121) })
    long.assertStatus(422)
  })

  test('requires a session', async ({ client }) => {
    const response = await client.get('/architectures').headers(json)
    response.assertStatus(401)
  })

  test('lists only the caller architectures, with search and visibility filters', async ({
    client,
    assert,
  }) => {
    const user = await makeUser('arch-list@example.com')
    const other = await makeUser('arch-list-other@example.com')
    await Architecture.createMany([
      { userId: user.id, title: 'Payments 100%', visibility: 'public' },
      { userId: user.id, title: 'Search', visibility: 'private' },
      { userId: other.id, title: 'Payments elsewhere', visibility: 'public' },
    ])

    const all = await client.get('/architectures').headers(json).loginAs(user)
    all.assertStatus(200)
    assert.equal(all.body().meta.total, 2)

    const search = await client.get('/architectures?search=100%25').headers(json).loginAs(user)
    assert.deepEqual(
      search.body().data.map((a: { title: string }) => a.title),
      ['Payments 100%'],
    )

    const visibility = await client
      .get('/architectures?visibility=private')
      .headers(json)
      .loginAs(user)
    assert.deepEqual(
      visibility.body().data.map((a: { title: string }) => a.title),
      ['Search'],
    )
  })

  test('gives each row a diagram count and its first diagram as cover', async ({ client }) => {
    const user = await makeUser('arch-cover@example.com')
    const created = await client
      .post('/architectures')
      .headers(json)
      .loginAs(user)
      .json({ title: 'A' })
    const id = created.body().architecture.id
    await client
      .post(`/architectures/${id}/diagrams`)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Classes', kind: 'class' })

    const list = await client.get('/architectures').headers(json).loginAs(user)
    list.assertBodyContains({
      data: [{ id, diagramCount: 2, cover: { kind: 'c4', content: null } }],
    })
  })

  test('hides another user architecture behind a 404', async ({ client }) => {
    const owner = await makeUser('arch-owner@example.com')
    const intruder = await makeUser('arch-intruder@example.com')
    const architecture = await Architecture.create({
      userId: owner.id,
      title: 'Secret',
      visibility: 'private',
    })

    for (const request of [
      client.get(`/architectures/${architecture.id}`),
      client.patch(`/architectures/${architecture.id}`).json({ title: 'Mine now' }),
      client.delete(`/architectures/${architecture.id}`),
      client.post(`/architectures/${architecture.id}/duplicate`),
    ]) {
      const response = await request.headers(json).loginAs(intruder)
      response.assertStatus(404)
    }
  })

  test('renames, describes and deletes an architecture with its diagrams', async ({
    client,
    assert,
  }) => {
    const user = await makeUser('arch-update@example.com')
    const created = await client
      .post('/architectures')
      .headers(json)
      .loginAs(user)
      .json({ title: 'Old' })
    const id = created.body().architecture.id

    const updated = await client
      .patch(`/architectures/${id}`)
      .headers(json)
      .loginAs(user)
      .json({ title: 'New', description: null })
    updated.assertStatus(200)
    updated.assertBodyContains({ architecture: { title: 'New', description: null } })

    const deleted = await client.delete(`/architectures/${id}`).headers(json).loginAs(user)
    deleted.assertStatus(204)
    assert.isNull(await Architecture.find(id))
  })

  test('duplicates an architecture as a private copy with the same diagrams', async ({
    client,
    assert,
  }) => {
    const user = await makeUser('arch-dup@example.com')
    const created = await client
      .post('/architectures')
      .headers(json)
      .loginAs(user)
      .json({ title: 'Origin' })
    const source = created.body().architecture
    await client
      .patch(`/architectures/${source.id}/diagrams/${source.diagrams[0].id}`)
      .headers(json)
      .loginAs(user)
      .json({ content: { kind: 'c4', level: 'context', elements: [], relations: [] }, version: 1 })
    await Architecture.query()
      .where('id', source.id)
      .update({ visibility: 'public', share_token: 'token' })

    const copy = await client
      .post(`/architectures/${source.id}/duplicate`)
      .headers(json)
      .loginAs(user)

    copy.assertStatus(201)
    copy.assertBodyContains({
      architecture: {
        title: 'Origin (copy)',
        visibility: 'private',
        diagrams: [
          {
            kind: 'c4',
            content: { kind: 'c4', level: 'context', elements: [], relations: [] },
            version: 1,
          },
        ],
      },
    })
    const stored = await Architecture.findOrFail(copy.body().architecture.id)
    assert.isNull(stored.shareToken)
  })
})
