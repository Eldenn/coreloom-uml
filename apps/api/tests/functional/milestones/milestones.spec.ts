import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import { MILESTONES_PER_ARCHITECTURE_MAX } from '#app/milestones/constants/milestone'
import Milestone from '#app/milestones/models/milestone'
import User from '#app/users/models/user'

const json = { accept: 'application/json' }

function makeUser() {
  return User.create({
    email: `milestones-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

const ORDER = { kind: 'class', classes: [{ id: 'Order' }], relations: [] }
const INVOICE = { kind: 'class', classes: [{ id: 'Invoice' }], relations: [] }

/** An architecture whose first view holds `ORDER`. */
async function setup(client: TestContext['client']) {
  const user = await makeUser()
  const created = await client
    .post('/architectures')
    .headers(json)
    .loginAs(user)
    .json({ title: 'A' })
  const architecture = created.body().architecture
  const firstId = architecture.diagrams[0].id as number
  const base = `/architectures/${architecture.id}`
  const saved = await client
    .patch(`${base}/diagrams/${firstId}`)
    .headers(json)
    .loginAs(user)
    .json({ content: ORDER, version: 1 })
  saved.assertStatus(200)
  const keep = async (name: string) => {
    const response = await client
      .post(`${base}/milestones`)
      .headers(json)
      .loginAs(user)
      .json({ name })
    response.assertStatus(201)
    return response.body().milestone
  }
  return { user, base, firstId, keep }
}

test.group('Milestones', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('keeps the views as they are and lists the newest first, without content', async ({
    client,
    assert,
  }) => {
    const { user, base, firstId, keep } = await setup(client)

    const first = await keep('In production')
    assert.equal(first.diagramCount, 1)
    await keep('Target')

    const list = await client.get(`${base}/milestones`).headers(json).loginAs(user)
    list.assertStatus(200)
    assert.deepEqual(
      list.body().data.map((m: { name: string }) => m.name),
      ['Target', 'In production'],
    )
    assert.notProperty(list.body().data[0], 'diagrams')
    assert.equal(list.body().meta.total, 2)

    const shown = await client.get(`${base}/milestones/${first.id}`).headers(json).loginAs(user)
    shown.assertStatus(200)
    const [kept] = shown.body().milestone.diagrams
    assert.equal(kept.diagramId, firstId)
    assert.deepEqual(kept.content.classes, [{ id: 'Order' }])
  })

  test('a milestone does not move when its architecture changes', async ({ client, assert }) => {
    const { user, base, firstId, keep } = await setup(client)
    const milestone = await keep('v1')

    await client
      .patch(`${base}/diagrams/${firstId}`)
      .headers(json)
      .loginAs(user)
      .json({ content: INVOICE, version: 2 })

    const shown = await client.get(`${base}/milestones/${milestone.id}`).headers(json).loginAs(user)
    assert.deepEqual(shown.body().milestone.diagrams[0].content.classes, [{ id: 'Order' }])
  })

  test('restores changed, deleted and added views', async ({ client, assert }) => {
    const { user, base, firstId, keep } = await setup(client)
    const second = await client
      .post(`${base}/diagrams`)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Flow', kind: 'sequence' })
    const secondId = second.body().diagram.id as number
    const milestone = await keep('v1')

    // Since the milestone: the first view changed, the second was deleted, a third was added.
    await client
      .patch(`${base}/diagrams/${firstId}`)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Renamed', content: INVOICE, version: 2 })
    await client.delete(`${base}/diagrams/${secondId}`).headers(json).loginAs(user)
    await client
      .post(`${base}/diagrams`)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Later', kind: 'state' })

    const response = await client
      .post(`${base}/milestones/${milestone.id}/restore`)
      .headers(json)
      .loginAs(user)

    response.assertStatus(200)
    const diagrams = response.body().architecture.diagrams
    assert.deepEqual(
      diagrams.map((d: { title: string }) => d.title),
      ['Context', 'Flow'],
    )
    // The view that was still there keeps its id and takes a new version.
    assert.equal(diagrams[0].id, firstId)
    assert.equal(diagrams[0].version, 4)
    assert.deepEqual(diagrams[0].content.classes, [{ id: 'Order' }])
    assert.notEqual(diagrams[1].id, secondId)
    assert.equal(diagrams[1].kind, 'sequence')
  })

  test('refuses to restore content that no longer reads, and writes nothing', async ({
    client,
    assert,
  }) => {
    const { user, base, keep } = await setup(client)
    const milestone = await keep('v1')
    const row = await Milestone.findOrFail(milestone.id)
    row.diagrams = row.diagrams.map((d) => ({ ...d, content: { kind: 'nope' } as never }))
    await row.save()

    const response = await client
      .post(`${base}/milestones/${milestone.id}/restore`)
      .headers(json)
      .loginAs(user)

    response.assertStatus(422)
    const shown = await client.get(base).headers(json).loginAs(user)
    assert.deepEqual(shown.body().architecture.diagrams[0].content.classes, [{ id: 'Order' }])
  })

  test('rejects an empty or too long name with 422', async ({ client }) => {
    const { user, base } = await setup(client)

    for (const name of ['  ', 'x'.repeat(121)]) {
      const response = await client
        .post(`${base}/milestones`)
        .headers(json)
        .loginAs(user)
        .json({ name })
      response.assertStatus(422)
    }
  })

  test('answers 409 once the architecture holds the maximum', async ({ client }) => {
    const { user, base, keep } = await setup(client)
    const { id, architectureId } = await keep('first')
    const first = await Milestone.findOrFail(id)
    await Milestone.createMany(
      Array.from({ length: MILESTONES_PER_ARCHITECTURE_MAX - 1 }, (_, i) => ({
        architectureId,
        userId: user.id,
        name: `m${i}`,
        diagrams: first.diagrams,
        diagramCount: first.diagramCount,
      })),
    )

    const response = await client
      .post(`${base}/milestones`)
      .headers(json)
      .loginAs(user)
      .json({ name: 'one too many' })

    response.assertStatus(409)
  })

  test('deletes a milestone', async ({ client }) => {
    const { user, base, keep } = await setup(client)
    const milestone = await keep('v1')

    const response = await client
      .delete(`${base}/milestones/${milestone.id}`)
      .headers(json)
      .loginAs(user)
    response.assertStatus(204)

    const shown = await client.get(`${base}/milestones/${milestone.id}`).headers(json).loginAs(user)
    shown.assertStatus(404)
  })

  test("answers 404 on someone else's architecture and on another architecture's milestone", async ({
    client,
  }) => {
    const mine = await setup(client)
    const theirs = await setup(client)
    const milestone = await theirs.keep('theirs')

    const routes = [
      ['get', `${theirs.base}/milestones`],
      ['post', `${theirs.base}/milestones`],
      ['get', `${theirs.base}/milestones/${milestone.id}`],
      ['delete', `${theirs.base}/milestones/${milestone.id}`],
      ['post', `${theirs.base}/milestones/${milestone.id}/restore`],
      // Their milestone through my architecture.
      ['get', `${mine.base}/milestones/${milestone.id}`],
      ['post', `${mine.base}/milestones/${milestone.id}/restore`],
    ] as const
    for (const [method, url] of routes) {
      const response = await client[method](url)
        .headers(json)
        .loginAs(mine.user)
        .json({ name: 'x' })
      response.assertStatus(404)
    }
  })
})
