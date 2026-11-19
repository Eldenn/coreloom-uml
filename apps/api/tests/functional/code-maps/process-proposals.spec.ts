import { readFileSync } from 'node:fs'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { LanguageModel } from '@coreloom-uml/llm'
import { APICallError, answeringModel, failingModel } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import Architecture from '#app/architectures/models/architecture'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import DiagramCodeLink from '#app/code-maps/models/diagram-code-link'
import type {
  CodeMapOutput,
  CodeMapProcessesOutput,
  ProposeProcessOutput,
} from '#app/code-maps/validators/code-maps-output'
import Diagram from '#app/diagrams/models/diagram'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

type Client = TestContext['client']

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
/** The fixture key: it must never show up in a response, a log line or the database. */
const KEY = 'sk-fixture-5d2e8a41-never-stored'
const provider = { kind: 'mistral', model: 'mistral-small-latest' }
const APP = 'apps/api/app'
const CONTROLLER = `${APP}/architectures/controllers/architectures-controller.ts#ArchitecturesController`
const ENTRY = `${CONTROLLER}.update`
const FIND = `${APP}/architectures/services/owned-architecture.ts#findOwnedArchitecture`

const GRAPH = readFileSync(app.makePath('../../packages/codemap/fixtures/adonis-graph.json'))

const SEQUENCE = {
  kind: 'sequence',
  participants: [
    { id: 'client', kind: 'actor', label: 'Client' },
    { id: 'controller', label: 'ArchitecturesController' },
    { id: 'owned', label: 'owned-architecture' },
  ],
  steps: [
    {
      type: 'message',
      from: 'client',
      to: 'controller',
      text: 'PATCH /architectures/:id',
      arrow: 'sync',
    },
    {
      type: 'message',
      from: 'controller',
      to: 'owned',
      text: 'findOwnedArchitecture()',
      arrow: 'sync',
    },
    { type: 'message', from: 'controller', to: 'client', text: '200', arrow: 'reply' },
  ],
}

function answer(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    title: 'Update an architecture',
    summary: 'The route loads the architecture, checks its owner and saves it.',
    diagram: JSON.stringify(SEQUENCE),
    links: [
      { element: 'controller', nodes: ['n1'] },
      { element: 'owned', nodes: [FIND, 'src/ghost.ts#Ghost'] },
      { element: 'ghost', nodes: ['n2'] },
    ],
    ...overrides,
  })
}

function useModel(model: LanguageModel) {
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
}

async function setup({ codeMaps = true, assistant = true } = {}) {
  const user = await User.create({
    email: `process-proposals-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  if (codeMaps) await updateFlag(FeatureFlagKey.CodeMaps, ON, user)
  if (assistant) await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
  const project = await Project.create({ userId: user.id, name: 'Shop', description: null })
  const architecture = await Architecture.create({
    userId: user.id,
    projectId: project.id,
    title: 'API',
  })
  await Diagram.create({
    architectureId: architecture.id,
    title: 'Overview',
    kind: 'package',
    format: 'json',
    content: { kind: 'package', elements: [{ id: 'app', kind: 'package' }], relations: [] },
    position: 0,
    version: 1,
  })
  return { user, project, architecture }
}

async function uploadMap(client: Client, user: User, projectId: number) {
  const response = await client
    .post(`/projects/${projectId}/code-maps`)
    .headers(json)
    .loginAs(user)
    .file('file', GRAPH, { filename: 'graph.json' })
  response.assertStatus(201)
  return (response.body() as { codeMap: CodeMapOutput }).codeMap
}

function propose(
  client: Client,
  user: User,
  codeMapId: number,
  body: Record<string, unknown> = {},
) {
  return client
    .post(`/code-maps/${codeMapId}/processes/propose`)
    .headers(json)
    .loginAs(user)
    .json({ provider, apiKey: KEY, entry: ENTRY, kind: 'sequence', locale: 'en', ...body })
}

async function processEntries(client: Client, user: User, codeMapId: number) {
  const response = await client.get(`/code-maps/${codeMapId}/processes`).headers(json).loginAs(user)
  response.assertStatus(200)
  return (response.body() as CodeMapProcessesOutput).processes.map((process) => process.entry)
}

test.group('Code maps - process proposals', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => {
    drive.fake()
    return () => drive.restore()
  })
  group.each.teardown(() => {
    app.container.restore(LanguageModels)
  })

  test('answers 404 while the code maps flag is off', async ({ client }) => {
    const { user, architecture } = await setup({ codeMaps: false })
    ;(await propose(client, user, 1, { architectureId: architecture.id })).assertStatus(404)
  })

  test('answers 404 while the assistant flag is off', async ({ client }) => {
    const { user, project, architecture } = await setup({ assistant: false })
    const map = await uploadMap(client, user, project.id)
    ;(await propose(client, user, map.id, { architectureId: architecture.id })).assertStatus(404)
  })

  test('proposes the process as a new view, accepted with its links to the code', async ({
    client,
    assert,
  }) => {
    const { user, project, architecture } = await setup()
    const map = await uploadMap(client, user, project.id)
    assert.include(await processEntries(client, user, map.id), ENTRY)

    const model = answeringModel(answer())
    useModel(model)
    const logs = captureLogs()
    let response: Awaited<ReturnType<typeof propose>>
    try {
      response = await propose(client, user, map.id, { architectureId: architecture.id })
    } finally {
      logs.restore()
    }
    response.assertStatus(201)
    const body = response.body() as ProposeProcessOutput
    assert.equal(body.architectureId, architecture.id)
    assert.equal(body.conversation.title, 'Update an architecture')
    assert.deepEqual(
      body.messages.map((message) => [message.role, message.architectureId]),
      [
        ['user', architecture.id],
        ['assistant', architecture.id],
      ],
    )
    assert.include(body.messages[0]?.content, '`ArchitecturesController.update` (route)')
    const change = body.messages[1]?.changes?.[0]
    assert.deepInclude(change, {
      op: 'create',
      kind: 'sequence',
      title: 'Update an architecture',
      status: 'pending',
    })
    // Links to elements not drawn and to places not given are dropped.
    assert.deepEqual(change?.codeLinks, [
      { elementId: 'controller', codeKey: ENTRY },
      { elementId: 'owned', codeKey: FIND },
    ])

    // The prompt holds names, paths and calls of the flow, and the existing titles.
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    assert.include(prompt, 'Entry point: n1 (route)')
    assert.include(prompt, 'n1 calls ')
    assert.include(prompt, '- Overview')
    // The key is never echoed, logged or stored.
    assert.notInclude(JSON.stringify(body), KEY)
    assert.notInclude(logs.lines.join('\n'), KEY)
    assert.notInclude(await dumpDatabase(), KEY)

    // Nothing is drawn until the owner accepts it, in the assistant.
    assert.lengthOf(await Diagram.query().where('architectureId', architecture.id), 1)
    const accepted = await client
      .post(
        `/architectures/${architecture.id}/assistant/conversations/${body.conversation.id}/messages/${body.messages[1]?.id}/changes/0/accept`,
      )
      .headers(json)
      .loginAs(user)
    accepted.assertStatus(200)
    const diagramId = (accepted.body() as { diagram: { id: number } }).diagram.id
    const links = await DiagramCodeLink.query().where('diagramId', diagramId).orderBy('elementId')
    assert.deepEqual(
      links.map((link) => [link.elementId, link.codeKey, link.status]),
      [
        ['controller', ENTRY, 'confirmed'],
        ['owned', FIND, 'confirmed'],
      ],
    )
    // The process is documented now.
    assert.notInclude(await processEntries(client, user, map.id), ENTRY)

    // Undone, the view and its links go.
    ;(
      await client
        .post(
          `/architectures/${architecture.id}/assistant/conversations/${body.conversation.id}/messages/${body.messages[1]?.id}/changes/0/undo`,
        )
        .headers(json)
        .loginAs(user)
    ).assertStatus(200)
    assert.lengthOf(await DiagramCodeLink.query().where('diagramId', diagramId), 0)
  })

  test('stores an invalid diagram as a failed change, in French when asked', async ({
    client,
    assert,
  }) => {
    const { user, project, architecture } = await setup()
    const map = await uploadMap(client, user, project.id)
    useModel(answeringModel(answer({ diagram: '{oops' })))
    const response = await propose(client, user, map.id, {
      architectureId: architecture.id,
      kind: 'activity',
      locale: 'fr',
    })
    response.assertStatus(201)
    const body = response.body() as ProposeProcessOutput
    assert.include(body.messages[0]?.content, 'en diagramme de activité')
    const change = body.messages[1]?.changes?.[0]
    assert.equal(change?.status, 'failed')
    assert.equal(change?.kind, 'activity')
    assert.isUndefined(change?.codeLinks)
  })

  test('answers 502 when the call fails, and stores nothing', async ({ client, assert }) => {
    const { user, project, architecture } = await setup()
    const map = await uploadMap(client, user, project.id)
    useModel(
      failingModel(
        new APICallError({ message: 'no', url: 'x', requestBodyValues: {}, statusCode: 401 }),
      ),
    )
    const response = await propose(client, user, map.id, { architectureId: architecture.id })
    response.assertStatus(502)
    assert.lengthOf(await AssistantMessage.query().where('architectureId', architecture.id), 0)
    assert.lengthOf(await AssistantConversation.query().where('userId', user.id), 0)
  })

  test('refuses an unknown entry point, another project’s architecture or a stranger', async ({
    client,
  }) => {
    const { user, project, architecture } = await setup()
    const map = await uploadMap(client, user, project.id)
    useModel(answeringModel(answer()))
    ;(
      await propose(client, user, map.id, { architectureId: architecture.id, entry: CONTROLLER })
    ).assertStatus(404)

    const elsewhere = await Architecture.create({
      userId: user.id,
      projectId: null,
      title: 'Other',
    })
    ;(await propose(client, user, map.id, { architectureId: elsewhere.id })).assertStatus(404)

    const stranger = await setup()
    ;(
      await propose(client, stranger.user, map.id, { architectureId: stranger.architecture.id })
    ).assertStatus(404)
    ;(
      await propose(client, user, map.id, { architectureId: stranger.architecture.id })
    ).assertStatus(404)

    ;(
      await propose(client, user, map.id, { architectureId: architecture.id, kind: 'class' })
    ).assertStatus(422)
  })
})
