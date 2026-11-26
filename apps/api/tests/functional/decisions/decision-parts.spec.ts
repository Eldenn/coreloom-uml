import app from '@adonisjs/core/services/app'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { answeringModel } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import type { CreatedApiTokenOutput } from '#app/api-tokens/validators/api-tokens-output'
import Architecture from '#app/architectures/models/architecture'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import Decision from '#app/decisions/models/decision'
import DecisionPart from '#app/decisions/models/decision-part'
import Diagram from '#app/diagrams/models/diagram'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import { McpTool } from '#app/mcp/constants/mcp'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { saveTestLlmKey } from '#tests/helpers/llm-key'

type Client = TestContext['client']

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }

async function setup(email: string) {
  const user = await User.create({ email, password: 'a-very-strong-passphrase' })
  await saveTestLlmKey(user)
  await updateFlag(FeatureFlagKey.DesignRecords, ON, user)
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
    content: {
      kind: 'class',
      classes: [{ id: 'Order' }, { id: 'Payment' }],
      relations: [{ from: 'Order', to: 'Payment', kind: 'association', label: 'pays' }],
    },
    position: 0,
    version: 1,
  })
  return { user, project, architecture, diagram }
}

const order = (diagramId: number) => ({ diagramId, type: 'element', label: 'Order' })
const pays = (diagramId: number) => ({
  diagramId,
  type: 'relation',
  label: 'Order → Payment: pays',
})

function create(client: Client, user: User, projectId: number, extra: Record<string, unknown>) {
  return client
    .post(`/projects/${projectId}/decisions`)
    .headers(json)
    .loginAs(user)
    .json({ title: 'How orders are paid', options: [{ name: 'Queue' }], ...extra })
}

const patch = (client: Client, user: User, id: number, body: Record<string, unknown>) =>
  client.patch(`/decisions/${id}`).headers(json).loginAs(user).json(body)

test.group('Decisions - parts of views', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('stores the parts it names, each once, and replaces them whole', async ({
    client,
    assert,
  }) => {
    const { user, project, diagram } = await setup('parts-crud@example.com')

    const created = await create(client, user, project.id, {
      diagramIds: [diagram.id],
      parts: [order(diagram.id), pays(diagram.id), order(diagram.id)],
    })
    created.assertStatus(201)
    assert.deepEqual(created.body().decision.parts, [order(diagram.id), pays(diagram.id)])
    const { id } = created.body().decision

    // Left out, they stay; given, they replace the set; given empty, they go.
    const renamed = await patch(client, user, id, { title: 'Paying orders' })
    assert.deepEqual(renamed.body().decision.parts, [order(diagram.id), pays(diagram.id)])
    const replaced = await patch(client, user, id, { parts: [pays(diagram.id)] })
    replaced.assertStatus(200)
    assert.deepEqual(replaced.body().decision.parts, [pays(diagram.id)])

    const listed = await client.get(`/projects/${project.id}/decisions`).headers(json).loginAs(user)
    assert.deepEqual(listed.body().data[0].parts, [pays(diagram.id)])

    const emptied = await patch(client, user, id, { parts: [] })
    assert.deepEqual(emptied.body().decision.parts, [])

    // A label its view does not have (yet, or any more) is stored: the review says it.
    const unknown = await patch(client, user, id, {
      parts: [{ diagramId: diagram.id, type: 'member', label: 'Order.total' }],
    })
    unknown.assertStatus(200)
  })

  test('refuses a part of a diagram outside the project, and changes nothing', async ({
    client,
    assert,
  }) => {
    const { user, project, diagram } = await setup('parts-outside@example.com')
    const stranger = await setup('parts-outside-other@example.com')
    const loose = await Architecture.create({
      userId: user.id,
      title: 'Outside any project',
      visibility: 'private',
    })
    const looseDiagram = await Diagram.create({
      architectureId: loose.id,
      title: 'Loose',
      kind: 'class',
      format: 'mermaid',
      content: null,
      position: 0,
      version: 1,
    })

    for (const outside of [stranger.diagram.id, looseDiagram.id]) {
      const response = await create(client, user, project.id, {
        parts: [order(diagram.id), order(outside)],
      })
      response.assertStatus(422)
      assert.deepEqual(response.body().error, {
        field: 'parts',
        message: 'These are not all parts of diagrams of the project.',
      })
    }
    assert.lengthOf(await Decision.query().where('projectId', project.id), 0)

    const { id } = (await create(client, user, project.id, { parts: [order(diagram.id)] })).body()
      .decision
    ;(await patch(client, user, id, { parts: [order(stranger.diagram.id)] })).assertStatus(422)
    const kept = await DecisionPart.query().where('decisionId', id)
    assert.deepEqual(
      kept.map((part) => part.label),
      ['Order'],
    )

    // Over the bounds of the `pointed` input: refused before anything is read.
    const tooLong = { diagramId: diagram.id, type: 'element', label: 'x'.repeat(201) }
    ;(await create(client, user, project.id, { parts: [tooLong] })).assertStatus(422)
    const badType = { diagramId: diagram.id, type: 'view', label: 'Order' }
    ;(await create(client, user, project.id, { parts: [badType] })).assertStatus(422)
  })

  test('a part goes with its decision and with its diagram', async ({ client, assert }) => {
    const { user, project, architecture, diagram } = await setup('parts-cascade@example.com')
    const other = await Diagram.create({
      architectureId: architecture.id,
      title: 'Flow',
      kind: 'class',
      format: 'mermaid',
      content: { kind: 'class', classes: [{ id: 'Order' }], relations: [] },
      position: 1,
      version: 1,
    })
    const kept = (
      await create(client, user, project.id, { parts: [order(diagram.id), order(other.id)] })
    ).body().decision
    const gone = (await create(client, user, project.id, { parts: [order(diagram.id)] })).body()
      .decision

    await other.delete()
    const listed = await client.get(`/projects/${project.id}/decisions`).headers(json).loginAs(user)
    const byId = new Map(listed.body().data.map((d: { id: number }) => [d.id, d]))
    assert.deepEqual((byId.get(kept.id) as { parts: unknown }).parts, [order(diagram.id)])

    ;(await client.delete(`/decisions/${gone.id}`).headers(json).loginAs(user)).assertStatus(204)
    assert.lengthOf(await DecisionPart.query().where('decisionId', gone.id), 0)
    assert.lengthOf(await DecisionPart.query().where('decisionId', kept.id), 1)
  })

  test('the design review finds a part its view no longer has', async ({ client, assert }) => {
    const { user, project, diagram } = await setup('parts-review@example.com')
    const standing = (
      await create(client, user, project.id, {
        status: 'accepted',
        chosen: 'Queue',
        diagramIds: [diagram.id],
        parts: [order(diagram.id), pays(diagram.id)],
      })
    ).body().decision
    const review = async () =>
      (await client.get(`/projects/${project.id}/design-review`).headers(json).loginAs(user)).body()
        .findings

    assert.deepEqual(await review(), [])

    // The relation is renamed in the view: the decision now names a part it no longer has.
    diagram.content = {
      kind: 'class',
      classes: [{ id: 'Order' }, { id: 'Payment' }],
      relations: [{ from: 'Order', to: 'Payment', kind: 'association', label: 'settles' }],
    }
    await diagram.save()
    assert.deepEqual(await review(), [
      {
        kind: 'stale_part',
        requirementId: null,
        decisionId: standing.id,
        subject: 'How orders are paid',
      },
    ])
  })

  test('coding agents and the diagram assistant read the parts', async ({ client, assert }) => {
    const { user, project, architecture, diagram } = await setup('parts-readers@example.com')
    await create(client, user, project.id, {
      status: 'accepted',
      chosen: 'Queue',
      parts: [pays(diagram.id)],
    })

    await updateFlag(FeatureFlagKey.McpServer, ON, user)
    const token = await client
      .post('/account/api-tokens')
      .headers(json)
      .loginAs(user)
      .json({ name: 'Agent', abilities: ['read'], expiresInDays: 30 })
    const { secret } = token.body() as CreatedApiTokenOutput
    const listed = await client
      .post('/mcp')
      .header('accept', 'application/json, text/event-stream')
      .header('authorization', `Bearer ${secret}`)
      .json({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: McpTool.ListDecisions, arguments: { projectId: project.id } },
      })
    listed.assertStatus(200)
    const decisions = JSON.parse(listed.body().result.content[0].text)
    assert.deepEqual(decisions[0].parts, [pays(diagram.id)])

    await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
    const conversation = await AssistantConversation.create({ userId: user.id, title: '' })
    const model = answeringModel(JSON.stringify({ reply: 'Done.', changes: [] }))
    app.container.swap(LanguageModels, () => {
      const fake = new LanguageModels()
      fake.create = () => model
      return fake
    })
    const asked = await client
      .post(`/architectures/${architecture.id}/assistant/conversations/${conversation.id}/messages`)
      .headers(json)
      .loginAs(user)
      .json({
        provider: { kind: 'mistral', model: 'mistral-small-latest' },
        apiKey: 'sk-fixture-decision-parts',
        message: 'Draw how orders are paid.',
        currentDiagramId: diagram.id,
        locale: 'en',
      })
    asked.assertStatus(200)
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    assert.include(
      prompt,
      `<part view=\\"${diagram.id}\\" type=\\"relation\\">Order → Payment: pays</part>`,
    )
  })
})
