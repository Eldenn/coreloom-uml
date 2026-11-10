import { setTimeout as sleep } from 'node:timers/promises'
import db from '@adonisjs/lucid/services/db'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { UmlSpec } from '@coreloom-uml/uml'
import { test } from '@japa/runner'
import Architecture from '#app/architectures/models/architecture'
import { AssistantRole, ChangeStatus, type StoredChange } from '#app/assistant/constants/assistant'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import Diagram from '#app/diagrams/models/diagram'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }

const BEFORE: UmlSpec = { kind: 'class', classes: [{ id: 'A' }, { id: 'B' }], relations: [] }
const AFTER: UmlSpec = { kind: 'class', classes: [{ id: 'A' }, { id: 'C' }], relations: [] }
const USECASE: UmlSpec = {
  kind: 'usecase',
  elements: [{ id: 'buy', kind: 'usecase', label: 'Buy' }],
  relations: [],
}

async function setup(email: string) {
  const user = await User.create({ email, password: 'a-very-strong-passphrase' })
  await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
  const architecture = await Architecture.create({
    userId: user.id,
    title: 'Shop',
    visibility: 'private',
  })
  const diagram = await Diagram.create({
    architectureId: architecture.id,
    title: 'Domain',
    kind: 'class',
    format: 'mermaid',
    content: BEFORE,
    position: 0,
    version: 3,
  })
  const other = await Diagram.create({
    architectureId: architecture.id,
    title: 'Context',
    kind: 'c4',
    format: 'mermaid',
    content: null,
    position: 1,
    version: 1,
  })
  const conversation = await AssistantConversation.create({
    architectureId: architecture.id,
    userId: user.id,
    title: '',
  })

  /** Stores an assistant message proposing these changes; returns its route prefix. */
  async function propose(changes: Partial<StoredChange>[]) {
    const message = await AssistantMessage.create({
      conversationId: conversation.id,
      role: AssistantRole.Assistant,
      content: 'Done.',
      changes: changes.map((change) => ({
        op: 'update',
        diagramId: null,
        kind: 'class',
        title: '',
        format: null,
        before: null,
        after: null,
        baseVersion: null,
        baseTitle: null,
        baseFormat: null,
        relayout: false,
        placed: 0,
        status: ChangeStatus.Pending,
        appliedVersion: null,
        problems: [],
        ...change,
      })),
    })
    const prefix = `/architectures/${architecture.id}/assistant/conversations/${conversation.id}/messages/${message.id}/changes`
    return { message, prefix }
  }

  const updateOf = (target: Diagram, extra: Partial<StoredChange> = {}) => ({
    op: 'update' as const,
    diagramId: target.id,
    kind: 'class' as const,
    title: target.title,
    format: target.format,
    before: target.content,
    after: AFTER,
    baseVersion: target.version,
    baseTitle: target.title,
    baseFormat: target.format,
    ...extra,
  })
  const deleteOf = (target: Diagram) => ({
    op: 'delete' as const,
    diagramId: target.id,
    kind: target.kind,
    title: target.title,
    format: target.format,
    before: target.content,
    baseVersion: target.version,
    baseTitle: target.title,
    baseFormat: target.format,
  })

  return { user, architecture, diagram, other, propose, updateOf, deleteOf }
}

const views = (architectureId: number) =>
  Diagram.query().where('architectureId', architectureId).orderBy('position', 'asc')

test.group('Assistant changes', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('accepts an update and bumps the version', async ({ client, assert }) => {
    const { user, diagram, propose, updateOf } = await setup('assist-chg-update@example.com')
    const { message, prefix } = await propose([updateOf(diagram, { title: 'Model' })])

    const response = await client.post(`${prefix}/0/accept`).headers(json).loginAs(user)

    response.assertStatus(200)
    const { change, diagram: updated } = response.body()
    assert.equal(change.status, 'accepted')
    assert.equal(change.appliedVersion, 4)
    assert.equal(change.index, 0)
    assert.equal(updated.version, 4)
    assert.equal(updated.title, 'Model')
    assert.deepEqual(updated.content, AFTER)
    await diagram.refresh()
    assert.deepEqual(diagram.content, AFTER)
    await message.refresh()
    assert.equal(message.changes?.[0].status, 'accepted')
  })

  for (const [what, edit] of [
    ['content', { version: 4 }],
    ['title', { title: 'Renamed' }],
    ['format', { format: 'plantuml' }],
  ] as const) {
    test(`marks stale when the ${what} changed since`, async ({ client, assert }) => {
      const { user, diagram, propose, updateOf } = await setup(
        `assist-chg-stale-${what}@example.com`,
      )
      const { message, prefix } = await propose([updateOf(diagram)])
      diagram.merge(edit)
      await diagram.save()

      const response = await client.post(`${prefix}/0/accept`).headers(json).loginAs(user)

      response.assertStatus(409)
      assert.equal(response.body().change.status, 'stale')
      assert.exists(response.body().error.message)
      await message.refresh()
      assert.equal(message.changes?.[0].status, 'stale')
      await diagram.refresh()
      assert.deepEqual(diagram.content, BEFORE)
    })
  }

  test('accepts a create and a delete', async ({ client, assert }) => {
    const { user, architecture, other, propose, deleteOf } = await setup(
      'assist-chg-create@example.com',
    )
    const { message, prefix } = await propose([
      { op: 'create', kind: 'class', title: 'Orders', after: AFTER },
      { op: 'create', kind: 'usecase', title: 'Uses', after: USECASE },
      deleteOf(other),
    ])

    const created = await client.post(`${prefix}/0/accept`).headers(json).loginAs(user)
    created.assertStatus(200)
    assert.equal(created.body().diagram.format, 'mermaid')
    assert.equal(created.body().diagram.position, 2)
    assert.equal(created.body().diagram.version, 1)
    assert.equal(created.body().change.diagramId, created.body().diagram.id)
    assert.equal(created.body().change.appliedVersion, 1)

    const usecase = await client.post(`${prefix}/1/accept`).headers(json).loginAs(user)
    usecase.assertStatus(200)
    assert.equal(usecase.body().diagram.format, 'json')
    assert.equal(usecase.body().diagram.position, 3)

    const deleted = await client.post(`${prefix}/2/accept`).headers(json).loginAs(user)
    deleted.assertStatus(200)
    assert.isNull(deleted.body().diagram)
    assert.equal(deleted.body().change.status, 'accepted')

    assert.deepEqual(
      (await views(architecture.id)).map((view) => view.title),
      ['Domain', 'Orders', 'Uses'],
    )
    await message.refresh()
    assert.deepEqual(
      message.changes?.map((change) => change.status),
      ['accepted', 'accepted', 'accepted'],
    )
  })

  test('refuses to delete the last view, change stays pending', async ({ client, assert }) => {
    const { user, architecture, diagram, other, propose, deleteOf } = await setup(
      'assist-chg-last@example.com',
    )
    await other.delete()
    const { message, prefix } = await propose([deleteOf(diagram)])

    const response = await client.post(`${prefix}/0/accept`).headers(json).loginAs(user)

    response.assertStatus(409)
    assert.equal(response.body().error.message, 'An architecture keeps at least one diagram.')
    await message.refresh()
    assert.equal(message.changes?.[0].status, 'pending')
    assert.lengthOf(await views(architecture.id), 1)
  })

  test('undoes an update, a create and a delete', async ({ client, assert }) => {
    const { user, architecture, diagram, other, propose, updateOf, deleteOf } = await setup(
      'assist-chg-undo@example.com',
    )
    const { message, prefix } = await propose([
      updateOf(diagram, { title: 'Model' }),
      { op: 'create', kind: 'class', title: 'Orders', after: AFTER },
      deleteOf(diagram),
    ])
    for (const index of [0, 1]) {
      ;(await client.post(`${prefix}/${index}/accept`).headers(json).loginAs(user)).assertStatus(
        200,
      )
    }

    const update = await client.post(`${prefix}/0/undo`).headers(json).loginAs(user)
    update.assertStatus(200)
    assert.equal(update.body().change.status, 'undone')
    assert.deepEqual(update.body().diagram.content, BEFORE)
    assert.equal(update.body().diagram.title, 'Domain')
    assert.equal(update.body().diagram.version, 5)

    const create = await client.post(`${prefix}/1/undo`).headers(json).loginAs(user)
    create.assertStatus(200)
    assert.isNull(create.body().diagram)
    assert.equal(create.body().change.status, 'undone')

    // The delete was proposed against version 3: re-propose it against the restored view.
    await diagram.refresh()
    const { prefix: again } = await propose([deleteOf(diagram)])
    ;(await client.post(`${again}/0/accept`).headers(json).loginAs(user)).assertStatus(200)
    assert.deepEqual(
      (await views(architecture.id)).map((view) => view.id),
      [other.id],
    )
    const restored = await client.post(`${again}/0/undo`).headers(json).loginAs(user)
    restored.assertStatus(200)
    assert.equal(restored.body().change.status, 'undone')
    assert.equal(restored.body().diagram.title, 'Domain')
    assert.equal(restored.body().diagram.format, 'mermaid')
    assert.deepEqual(restored.body().diagram.content, BEFORE)
    // Back at its old place, in front of the view that followed it.
    assert.deepEqual(
      (await views(architecture.id)).map((view) => [view.title, view.position]),
      [
        ['Domain', 0],
        ['Context', 2],
      ],
    )
    await message.refresh()
    assert.deepEqual(
      message.changes?.map((change) => change.status),
      ['undone', 'undone', 'pending'],
    )
  })

  test('refuses undo after a later edit', async ({ client, assert }) => {
    const { user, diagram, propose, updateOf } = await setup('assist-chg-later@example.com')
    const { message, prefix } = await propose([updateOf(diagram)])
    ;(await client.post(`${prefix}/0/accept`).headers(json).loginAs(user)).assertStatus(200)
    await diagram.refresh()
    diagram.version += 1
    await diagram.save()

    const response = await client.post(`${prefix}/0/undo`).headers(json).loginAs(user)

    response.assertStatus(409)
    assert.exists(response.body().error.message)
    assert.equal(response.body().change.status, 'accepted')
    await message.refresh()
    assert.equal(message.changes?.[0].status, 'accepted')
    await diagram.refresh()
    assert.deepEqual(diagram.content, AFTER)
    assert.equal(diagram.version, 5)
  })

  test('refuses accepting twice', async ({ client, assert }) => {
    const { user, diagram, propose, updateOf } = await setup('assist-chg-twice@example.com')
    const { prefix } = await propose([updateOf(diagram)])
    ;(await client.post(`${prefix}/0/accept`).headers(json).loginAs(user)).assertStatus(200)

    const response = await client.post(`${prefix}/0/accept`).headers(json).loginAs(user)

    response.assertStatus(409)
    assert.equal(response.body().change.status, 'accepted')
    await diagram.refresh()
    assert.equal(diagram.version, 4)
  })

  test('refuses an update the diagram schema no longer accepts', async ({ client, assert }) => {
    const { user, diagram, propose, updateOf } = await setup('assist-chg-invalid@example.com')
    const { message, prefix } = await propose([
      updateOf(diagram, { after: { kind: 'class', classes: 'no' } as unknown as UmlSpec }),
    ])

    const response = await client.post(`${prefix}/0/accept`).headers(json).loginAs(user)

    response.assertStatus(422)
    assert.isNotEmpty(response.body().error.problems)
    await message.refresh()
    assert.equal(message.changes?.[0].status, 'pending')
    await diagram.refresh()
    assert.equal(diagram.version, 3)
    assert.deepEqual(diagram.content, BEFORE)
  })

  test('a plain save waits while the architecture is locked by an apply', async ({
    client,
    assert,
  }) => {
    const { user, architecture, diagram } = await setup('assist-chg-lock@example.com')
    // Holds the lock `applyChange` takes first, as an accept in flight would.
    const trx = await db.transaction()
    await Architecture.query({ client: trx }).where('id', architecture.id).forUpdate().firstOrFail()

    let settled = false
    const save = client
      .patch(`/architectures/${architecture.id}/diagrams/${diagram.id}`)
      .headers(json)
      .loginAs(user)
      .json({ content: AFTER, version: 3 })
      .then((response) => {
        settled = true
        return response
      })
    await sleep(300)
    assert.isFalse(settled)
    await diagram.refresh()
    assert.equal(diagram.version, 3)

    await trx.commit()
    const response = await save
    response.assertStatus(200)
    assert.equal(response.body().diagram.version, 4)
  })

  test('rejects a pending change', async ({ client, assert }) => {
    const { user, diagram, propose, updateOf } = await setup('assist-chg-reject@example.com')
    const { prefix } = await propose([updateOf(diagram)])

    const response = await client.post(`${prefix}/0/reject`).headers(json).loginAs(user)

    response.assertStatus(200)
    assert.equal(response.body().change.status, 'rejected')
    assert.isNull(response.body().diagram)
    await diagram.refresh()
    assert.equal(diagram.version, 3)
  })

  test('404 for another user message', async ({ client }) => {
    const { diagram, propose, updateOf } = await setup('assist-chg-owner@example.com')
    const { prefix } = await propose([updateOf(diagram)])
    const stranger = await User.create({
      email: 'assist-chg-stranger@example.com',
      password: 'a-very-strong-passphrase',
    })
    await updateFlag(FeatureFlagKey.DiagramAssistant, ON, stranger)

    const response = await client.post(`${prefix}/0/accept`).headers(json).loginAs(stranger)

    response.assertStatus(404)
  })

  test('404 for an index outside the message', async ({ client }) => {
    const { user, diagram, propose, updateOf } = await setup('assist-chg-index@example.com')
    const { prefix } = await propose([updateOf(diagram)])

    const response = await client.post(`${prefix}/5/accept`).headers(json).loginAs(user)

    response.assertStatus(404)
  })
})
