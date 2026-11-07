import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import User from '#app/users/models/user'

const json = { accept: 'application/json' }

async function setup(client: TestContext['client']) {
  const user = await User.create({
    email: `diagrams-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  const created = await client
    .post('/architectures')
    .headers(json)
    .loginAs(user)
    .json({ title: 'A' })
  const architecture = created.body().architecture
  return { user, architecture, firstId: architecture.diagrams[0].id as number }
}

const CLASSES = { kind: 'class', classes: [{ id: 'Order' }], relations: [] }

test.group('Architectures - diagrams', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('adds a diagram after the last one', async ({ client }) => {
    const { user, architecture } = await setup(client)

    const response = await client
      .post(`/architectures/${architecture.id}/diagrams`)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Order flow', kind: 'sequence' })

    response.assertStatus(201)
    response.assertBodyContains({ diagram: { title: 'Order flow', kind: 'sequence', position: 1 } })
  })

  test('accepts component and package diagrams', async ({ client, assert }) => {
    const { user, architecture } = await setup(client)

    for (const kind of ['component', 'package']) {
      const response = await client
        .post(`/architectures/${architecture.id}/diagrams`)
        .headers(json)
        .loginAs(user)
        .json({ title: kind, kind })

      response.assertStatus(201)
      assert.equal(response.body().diagram.kind, kind)
    }
  })

  test('rejects an unknown kind', async ({ client }) => {
    const { user, architecture } = await setup(client)

    const response = await client
      .post(`/architectures/${architecture.id}/diagrams`)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Gantt', kind: 'gantt' })

    response.assertStatus(422)
  })

  test('saves content, takes its kind and bumps the version', async ({ client }) => {
    const { user, architecture, firstId } = await setup(client)

    const response = await client
      .patch(`/architectures/${architecture.id}/diagrams/${firstId}`)
      .headers(json)
      .loginAs(user)
      .json({ content: CLASSES, version: 1, format: 'plantuml', title: 'Domain' })

    response.assertStatus(200)
    response.assertBodyContains({
      diagram: { kind: 'class', content: CLASSES, version: 2, format: 'plantuml', title: 'Domain' },
    })
  })

  test('needs the version when saving content', async ({ client }) => {
    const { user, architecture, firstId } = await setup(client)

    const response = await client
      .patch(`/architectures/${architecture.id}/diagrams/${firstId}`)
      .headers(json)
      .loginAs(user)
      .json({ content: CLASSES })

    response.assertStatus(422)
  })

  test('refuses a save based on a stale version unless forced', async ({ client }) => {
    const { user, architecture, firstId } = await setup(client)
    const url = `/architectures/${architecture.id}/diagrams/${firstId}`
    await client.patch(url).headers(json).loginAs(user).json({ content: CLASSES, version: 1 })

    const stale = await client
      .patch(url)
      .headers(json)
      .loginAs(user)
      .json({ content: { ...CLASSES, classes: [] }, version: 1 })
    stale.assertStatus(409)
    stale.assertBodyContains({ diagram: { version: 2, content: CLASSES } })

    const forced = await client
      .patch(url)
      .headers(json)
      .loginAs(user)
      .json({ content: { ...CLASSES, classes: [] }, version: 1, force: true })
    forced.assertStatus(200)
    forced.assertBodyContains({ diagram: { version: 3 } })
  })

  test('refuses content over 1 MB', async ({ client }) => {
    const { user, architecture, firstId } = await setup(client)

    const response = await client
      .patch(`/architectures/${architecture.id}/diagrams/${firstId}`)
      .headers(json)
      .loginAs(user)
      .json({
        content: { kind: 'class', classes: [{ id: 'x'.repeat(1_000_001) }], relations: [] },
        version: 1,
      })

    response.assertStatus(422)
    response.assertBodyContains({ error: { problems: [{ severity: 'error' }] } })
  })

  test('refuses content the UML schema does not accept, with its problems', async ({
    client,
    assert,
  }) => {
    const { user, architecture, firstId } = await setup(client)

    const response = await client
      .patch(`/architectures/${architecture.id}/diagrams/${firstId}`)
      .headers(json)
      .loginAs(user)
      .json({ content: { kind: 'class', classes: [{ name: 'Order' }] }, version: 1 })

    response.assertStatus(422)
    const { problems } = response.body().error
    assert.isAbove(problems.length, 0)
    assert.isTrue(problems.every((p: { code: string }) => p.code === 'schema'))
    assert.isTrue(problems.some((p: { text: string }) => p.text.startsWith('relations')))
  })

  test('creates a diagram from Mermaid text', async ({ client, assert }) => {
    const { user, architecture } = await setup(client)

    const response = await client
      .post(`/architectures/${architecture.id}/diagrams`)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Domain', source: 'classDiagram\n  Order --> Customer : places\n' })

    response.assertStatus(201)
    response.assertBodyContains({
      diagram: {
        title: 'Domain',
        kind: 'class',
        format: 'mermaid',
        version: 1,
        content: {
          kind: 'class',
          classes: [{ id: 'Order' }, { id: 'Customer' }],
          relations: [{ from: 'Order', to: 'Customer', label: 'places' }],
        },
      },
      problems: [],
    })
    assert.equal(response.body().diagram.position, 1)
  })

  test('creates a diagram from PlantUML text in the format it is given', async ({ client }) => {
    const { user, architecture } = await setup(client)

    const response = await client
      .post(`/architectures/${architecture.id}/diagrams`)
      .headers(json)
      .loginAs(user)
      .json({
        title: 'Flow',
        kind: 'sequence',
        format: 'plantuml',
        source: '@startuml\nAlice -> Bob : hello\n@enduml\n',
      })

    response.assertStatus(201)
    response.assertBodyContains({ diagram: { kind: 'sequence', format: 'plantuml' } })
  })

  test('refuses text it cannot read, a kind that does not match, or no kind', async ({
    client,
  }) => {
    const { user, architecture } = await setup(client)
    const url = `/architectures/${architecture.id}/diagrams`

    const unreadable = await client
      .post(url)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Broken', source: 'classDiagram\n  class A\n  ??? nope\n' })
    unreadable.assertStatus(422)
    unreadable.assertBodyContains({ error: { problems: [{ line: 3, severity: 'error' }] } })

    const unknown = await client
      .post(url)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Prose', source: 'just some words' })
    unknown.assertStatus(422)
    unknown.assertBodyContains({ error: { problems: [{ code: 'header' }] } })

    const mismatch = await client
      .post(url)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Mismatch', kind: 'er', source: 'classDiagram\n  class A\n' })
    mismatch.assertStatus(422)

    const neither = await client.post(url).headers(json).loginAs(user).json({ title: 'Nothing' })
    neither.assertStatus(422)
  })

  test('reorders the diagrams, and only with the full list', async ({ client }) => {
    const { user, architecture, firstId } = await setup(client)
    const added = await client
      .post(`/architectures/${architecture.id}/diagrams`)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Second', kind: 'er' })
    const secondId = added.body().diagram.id
    const url = `/architectures/${architecture.id}/diagrams/order`

    const partial = await client
      .put(url)
      .headers(json)
      .loginAs(user)
      .json({ ids: [secondId] })
    partial.assertStatus(422)

    const response = await client
      .put(url)
      .headers(json)
      .loginAs(user)
      .json({ ids: [secondId, firstId] })
    response.assertStatus(200)

    const show = await client.get(`/architectures/${architecture.id}`).headers(json).loginAs(user)
    show.assertBodyContains({
      architecture: {
        diagrams: [
          { id: secondId, position: 0 },
          { id: firstId, position: 1 },
        ],
      },
    })
  })

  test('deletes a diagram but never the last one', async ({ client }) => {
    const { user, architecture, firstId } = await setup(client)
    const added = await client
      .post(`/architectures/${architecture.id}/diagrams`)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Second', kind: 'er' })

    const deleted = await client
      .delete(`/architectures/${architecture.id}/diagrams/${added.body().diagram.id}`)
      .headers(json)
      .loginAs(user)
    deleted.assertStatus(204)

    const last = await client
      .delete(`/architectures/${architecture.id}/diagrams/${firstId}`)
      .headers(json)
      .loginAs(user)
    last.assertStatus(409)
  })

  test('answers 404 for a diagram of another architecture', async ({ client }) => {
    const a = await setup(client)
    const b = await setup(client)

    const response = await client
      .patch(`/architectures/${a.architecture.id}/diagrams/${b.firstId}`)
      .headers(json)
      .loginAs(a.user)
      .json({ title: 'Nope' })

    response.assertStatus(404)
  })
})
