import app from '@adonisjs/core/services/app'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { answeringModel } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import Architecture from '#app/architectures/models/architecture'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import Decision from '#app/decisions/models/decision'
import Diagram from '#app/diagrams/models/diagram'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import Project from '#app/projects/models/project'
import Requirement from '#app/requirements/models/requirement'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

type Client = TestContext['client']

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const OFF = { enabled: false, rollout: 0, rules: [] }

async function setup(email: string, enabled = true) {
  const user = await User.create({ email, password: 'a-very-strong-passphrase' })
  if (enabled) await updateFlag(FeatureFlagKey.DesignRecords, ON, user)
  const project = await Project.create({ userId: user.id, name: 'Shop', description: null })
  const architecture = await Architecture.create({
    userId: user.id,
    projectId: project.id,
    title: 'Shop',
    visibility: 'private',
  })
  const diagram = await Diagram.create({
    architectureId: architecture.id,
    title: 'Domain',
    kind: 'class',
    format: 'mermaid',
    content: { kind: 'class', classes: [{ id: 'Order' }], relations: [] },
    position: 0,
    version: 1,
  })
  const requirement = await Requirement.create({
    projectId: project.id,
    userId: user.id,
    category: 'availability',
    priority: 'must',
    statement: 'Checkout stays up when the mail provider is down.',
    measure: null,
  })
  return { user, project, architecture, diagram, requirement }
}

const options = [
  { name: 'Queue', pros: 'Mail failures do not reach checkout.', cons: 'One more thing to run.' },
  { name: 'Direct call', pros: 'Simple.' },
]

function create(client: Client, user: User, projectId: number, extra: Record<string, unknown>) {
  return client
    .post(`/projects/${projectId}/decisions`)
    .headers(json)
    .loginAs(user)
    .json({ title: 'How mails are sent', options, ...extra })
}

test.group('Decisions', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('answers 404 while the flag is off', async ({ client }) => {
    const { user, project } = await setup('dec-off@example.com', false)

    const listed = await client.get(`/projects/${project.id}/decisions`).headers(json).loginAs(user)
    listed.assertStatus(404)
    ;(await create(client, user, project.id, {})).assertStatus(404)
  })

  test('creates a proposed decision, then accepts it with its links', async ({
    client,
    assert,
  }) => {
    const { user, project, diagram, requirement } = await setup('dec-crud@example.com')

    const created = await create(client, user, project.id, { context: 'Mails are slow.' })
    created.assertStatus(201)
    created.assertBodyContains({
      decision: {
        status: 'proposed',
        chosen: null,
        context: 'Mails are slow.',
        options: [options[0], { name: 'Direct call', pros: 'Simple.', cons: null }],
        requirementIds: [],
        diagramIds: [],
      },
    })
    const { id } = created.body().decision

    const accepted = await client
      .patch(`/decisions/${id}`)
      .headers(json)
      .loginAs(user)
      .json({
        status: 'accepted',
        chosen: 'Queue',
        consequences: 'A worker to operate.',
        requirementIds: [requirement.id],
        diagramIds: [diagram.id],
      })
    accepted.assertStatus(200)
    accepted.assertBodyContains({
      decision: {
        id,
        status: 'accepted',
        chosen: 'Queue',
        requirementIds: [requirement.id],
        diagramIds: [diagram.id],
      },
    })

    // Fields left out stay; a link set given empty is emptied.
    const renamed = await client
      .patch(`/decisions/${id}`)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Sending mails', diagramIds: [] })
    renamed.assertBodyContains({
      decision: { title: 'Sending mails', requirementIds: [requirement.id], diagramIds: [] },
    })

    const listed = await client.get(`/projects/${project.id}/decisions`).headers(json).loginAs(user)
    listed.assertStatus(200)
    assert.lengthOf(listed.body().data, 1)
    assert.deepEqual(listed.body().data[0].requirementIds, [requirement.id])

    ;(await client.delete(`/decisions/${id}`).headers(json).loginAs(user)).assertStatus(204)
    assert.isNull(await Decision.find(id))
  })

  test('refuses a decision that does not hold together, and changes nothing', async ({
    client,
    assert,
  }) => {
    const { user, project } = await setup('dec-invalid@example.com')
    const refused = async (extra: Record<string, unknown>, field: string) => {
      const response = await create(client, user, project.id, extra)
      response.assertStatus(422)
      assert.equal(response.body().error.field, field)
    }

    await refused({ options: [options[0], options[0]] }, 'options')
    await refused({ chosen: 'Carrier pigeon' }, 'chosen')
    await refused({ status: 'accepted' }, 'chosen')
    ;(await create(client, user, project.id, { options: [] })).assertStatus(422)

    const created = await create(client, user, project.id, { status: 'accepted', chosen: 'Queue' })
    const { id } = created.body().decision
    const patched = await client
      .patch(`/decisions/${id}`)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Changed', options: [{ name: 'Direct call' }] })
    patched.assertStatus(422)
    assert.equal((await Decision.findOrFail(id)).title, 'How mails are sent')
  })

  test('supersedes a decision by another one of the project only', async ({ client, assert }) => {
    const { user, project } = await setup('dec-supersede@example.com')
    const { project: elsewhere, user: other } = await setup('dec-supersede-other@example.com')
    const old = (await create(client, user, project.id, {})).body().decision
    const next = (await create(client, user, project.id, { title: 'Mails, again' })).body().decision
    const foreign = (await create(client, other, elsewhere.id, {})).body().decision
    const supersede = (supersededById: number, status = 'superseded') =>
      client
        .patch(`/decisions/${old.id}`)
        .headers(json)
        .loginAs(user)
        .json({ status, supersededById })

    ;(await supersede(old.id)).assertStatus(422)
    ;(await supersede(foreign.id)).assertStatus(422)
    ;(await supersede(next.id, 'accepted')).assertStatus(422)
    const done = await supersede(next.id)
    done.assertStatus(200)
    done.assertBodyContains({ decision: { status: 'superseded', supersededById: next.id } })

    // The decision that replaced it goes: this one stays superseded, by none.
    ;(await client.delete(`/decisions/${next.id}`).headers(json).loginAs(user)).assertStatus(204)
    const kept = await Decision.findOrFail(old.id)
    assert.equal(kept.status, 'superseded')
    assert.isNull(kept.supersededById)
  })

  test('links only requirements and diagrams of its own project', async ({ client, assert }) => {
    const { user, project, requirement, diagram } = await setup('dec-links@example.com')
    const stranger = await setup('dec-links-other@example.com')
    const outside = await Architecture.create({
      userId: user.id,
      title: 'Outside any project',
      visibility: 'private',
    })
    const outsideDiagram = await Diagram.create({
      architectureId: outside.id,
      title: 'Loose',
      kind: 'class',
      format: 'mermaid',
      content: null,
      position: 0,
      version: 1,
    })

    const foreignRequirement = await create(client, user, project.id, {
      requirementIds: [requirement.id, stranger.requirement.id],
    })
    foreignRequirement.assertStatus(422)
    assert.equal(foreignRequirement.body().error.field, 'requirementIds')
    for (const id of [stranger.diagram.id, outsideDiagram.id]) {
      const response = await create(client, user, project.id, { diagramIds: [diagram.id, id] })
      response.assertStatus(422)
      assert.equal(response.body().error.field, 'diagramIds')
    }
    assert.lengthOf(await Decision.query().where('projectId', project.id), 0)
  })

  test('drops a link with what it names, and keeps the decision', async ({ client, assert }) => {
    const { user, project, requirement, diagram } = await setup('dec-cascade@example.com')
    const created = await create(client, user, project.id, {
      requirementIds: [requirement.id],
      diagramIds: [diagram.id],
    })
    created.assertStatus(201)

    await requirement.delete()
    await diagram.delete()

    const listed = await client.get(`/projects/${project.id}/decisions`).headers(json).loginAs(user)
    assert.deepEqual(listed.body().data[0].requirementIds, [])
    assert.deepEqual(listed.body().data[0].diagramIds, [])
  })

  test("reads someone else's decision as 404", async ({ client }) => {
    const { user, project } = await setup('dec-owner@example.com')
    const { user: stranger } = await setup('dec-stranger@example.com')
    const { id } = (await create(client, user, project.id, {})).body().decision

    ;(await create(client, stranger, project.id, {})).assertStatus(404)
    const patched = await client
      .patch(`/decisions/${id}`)
      .headers(json)
      .loginAs(stranger)
      .json({ title: 'Mine now' })
    patched.assertStatus(404)
    ;(await client.delete(`/decisions/${id}`).headers(json).loginAs(stranger)).assertStatus(404)
  })

  test('the assistant reads the requirements and the decisions still standing', async ({
    client,
    assert,
  }) => {
    const { user, project, architecture, diagram } = await setup('dec-prompt@example.com')
    await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
    await create(client, user, project.id, { status: 'accepted', chosen: 'Queue' })
    await create(client, user, project.id, { title: 'Which database' })
    const replaced = (await create(client, user, project.id, { title: 'Mails by hand' })).body()
    await client
      .patch(`/decisions/${replaced.decision.id}`)
      .headers(json)
      .loginAs(user)
      .json({ status: 'superseded' })
    const conversation = await AssistantConversation.create({ userId: user.id, title: '' })
    const model = answeringModel(JSON.stringify({ reply: 'Done.', changes: [] }))
    app.container.swap(LanguageModels, () => {
      const fake = new LanguageModels()
      fake.create = () => model
      return fake
    })
    const ask = () =>
      client
        .post(
          `/architectures/${architecture.id}/assistant/conversations/${conversation.id}/messages`,
        )
        .headers(json)
        .loginAs(user)
        .json({
          provider: { kind: 'mistral', model: 'mistral-small-latest' },
          apiKey: 'sk-fixture-design-records',
          message: 'Draw how mails are sent.',
          currentDiagramId: diagram.id,
          locale: 'en',
        })

    ;(await ask()).assertStatus(200)
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    assert.include(
      prompt,
      '- [must] (availability) Checkout stays up when the mail provider is down.',
    )
    assert.include(prompt, '- [accepted] How mails are sent (chosen: Queue).')
    assert.include(prompt, '- [proposed] Which database (nothing chosen yet).')
    assert.notInclude(prompt, 'Mails by hand')

    // Off again: the prompt carries neither.
    await updateFlag(FeatureFlagKey.DesignRecords, OFF, user)
    ;(await ask()).assertStatus(200)
    const later = JSON.stringify(model.doGenerateCalls[1]?.prompt)
    assert.notInclude(later, 'Checkout stays up')
    assert.notInclude(later, 'chosen: Queue')
  })
})
