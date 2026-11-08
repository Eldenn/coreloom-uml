import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import Diagram from '#app/diagrams/models/diagram'
import User from '#app/users/models/user'

const json = { accept: 'application/json' }

const CLASSES = {
  kind: 'class',
  classes: [{ id: 'Order' }, { id: 'Customer' }],
  relations: [{ from: 'Order', to: 'Customer', kind: 'association', label: 'places' }],
  layout: { Order: { x: 10, y: 20 } },
}

async function setup(client: TestContext['client']) {
  const user = await User.create({
    email: `source-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  const created = await client
    .post('/architectures')
    .headers(json)
    .loginAs(user)
    .json({ title: 'A' })
  const architecture = created.body().architecture
  const id = architecture.diagrams[0].id as number
  return { user, url: `/architectures/${architecture.id}/diagrams/${id}/source`, id, architecture }
}

test.group('Architectures - diagram source', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('gives an empty diagram as empty text', async ({ client }) => {
    const { user, url, id } = await setup(client)

    const response = await client.get(url).headers(json).loginAs(user)

    response.assertStatus(200)
    response.assertBody({ id, kind: 'c4', format: 'mermaid', source: '', version: 1 })
  })

  test('writes the diagram in each format, its layout kept', async ({ client, assert }) => {
    const { user, url, architecture, id } = await setup(client)
    await client
      .patch(`/architectures/${architecture.id}/diagrams/${id}`)
      .headers(json)
      .loginAs(user)
      .json({ content: CLASSES, version: 1 })

    const mermaid = await client.get(url).qs({ format: 'mermaid' }).headers(json).loginAs(user)
    mermaid.assertStatus(200)
    assert.match(mermaid.body().source, /^classDiagram/m)
    assert.include(mermaid.body().source, 'coreloom-layout')
    assert.equal(mermaid.body().version, 2)

    const plantuml = await client.get(url).qs({ format: 'plantuml' }).headers(json).loginAs(user)
    assert.match(plantuml.body().source, /^@startuml/)

    const asJson = await client.get(url).qs({ format: 'json' }).headers(json).loginAs(user)
    assert.deepEqual(JSON.parse(asJson.body().source), CLASSES)

    const unknown = await client.get(url).qs({ format: 'svg' }).headers(json).loginAs(user)
    unknown.assertStatus(422)
  })

  test('replaces the content from text, round trip included', async ({ client, assert }) => {
    const { user, url, architecture, id } = await setup(client)

    const saved = await client
      .put(url)
      .headers(json)
      .loginAs(user)
      .json({ source: '@startuml\nAlice -> Bob : hello\n@enduml\n', version: 1 })

    saved.assertStatus(200)
    saved.assertBodyContains({
      diagram: { id, kind: 'sequence', format: 'plantuml', version: 2 },
      problems: [],
    })
    const stored = await Diagram.findOrFail(id)
    assert.equal(stored.content?.kind, 'sequence')

    const back = await client.get(url).headers(json).loginAs(user)
    const again = await client
      .put(url)
      .headers(json)
      .loginAs(user)
      .json({ source: back.body().source, format: 'plantuml', version: 2 })
    again.assertStatus(200)
    assert.deepEqual(again.body().diagram.content, saved.body().diagram.content)

    const show = await client.get(`/architectures/${architecture.id}`).headers(json).loginAs(user)
    show.assertBodyContains({ architecture: { diagrams: [{ id, kind: 'sequence', version: 3 }] } })
  })

  test('refuses text with errors, listing them, and leaves the diagram alone', async ({
    client,
    assert,
  }) => {
    const { user, url, id } = await setup(client)

    const response = await client
      .put(url)
      .headers(json)
      .loginAs(user)
      .json({ source: 'classDiagram\n  class A\n  ??? nope\n', format: 'mermaid', version: 1 })

    response.assertStatus(422)
    response.assertBodyContains({
      error: { problems: [{ line: 3, severity: 'error', text: '??? nope' }] },
    })
    const stored = await Diagram.findOrFail(id)
    assert.isNull(stored.content)
    assert.equal(stored.version, 1)
  })

  test('needs the version, and refuses a stale one unless forced', async ({ client }) => {
    const { user, url } = await setup(client)
    const source = 'classDiagram\n  class A\n'

    const missing = await client.put(url).headers(json).loginAs(user).json({ source })
    missing.assertStatus(422)

    await client.put(url).headers(json).loginAs(user).json({ source, version: 1 })
    const stale = await client.put(url).headers(json).loginAs(user).json({ source, version: 1 })
    stale.assertStatus(409)
    stale.assertBodyContains({ diagram: { version: 2 } })

    const forced = await client
      .put(url)
      .headers(json)
      .loginAs(user)
      .json({ source, version: 1, force: true })
    forced.assertStatus(200)
    forced.assertBodyContains({ diagram: { version: 3 } })
  })

  test('answers 404 for a diagram the user does not own', async ({ client }) => {
    const a = await setup(client)
    const b = await setup(client)

    const read = await client.get(b.url).headers(json).loginAs(a.user)
    read.assertStatus(404)
    const write = await client
      .put(b.url)
      .headers(json)
      .loginAs(a.user)
      .json({ source: 'classDiagram\n  class A\n', version: 1 })
    write.assertStatus(404)
  })

  test('needs a session', async ({ client }) => {
    const { url } = await setup(client)

    const response = await client.get(url).headers(json)

    response.assertStatus(401)
  })
})
