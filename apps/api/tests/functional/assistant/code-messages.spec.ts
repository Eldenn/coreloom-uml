import { readFileSync } from 'node:fs'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { LanguageModel } from '@coreloom-uml/llm'
import {
  APICallError,
  answeringModel,
  failingModel,
  MockLanguageModelV4,
} from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import Architecture from '#app/architectures/models/architecture'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import type { AskAssistantOutput } from '#app/assistant/validators/assistant-output'
import CodeMap from '#app/code-maps/models/code-map'
import DiagramCodeLink from '#app/code-maps/models/diagram-code-link'
import type { CodeMapOutput } from '#app/code-maps/validators/code-maps-output'
import Diagram from '#app/diagrams/models/diagram'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'
import { saveTestLlmKey } from '#tests/helpers/llm-key'

type Client = TestContext['client']

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
/** The fixture key: it must never show up in a response, a log line or the database. */
const KEY = 'sk-fixture-4d2a8e10-never-stored'
const provider = { kind: 'mistral', model: 'mistral-small-latest' }
const APP = 'apps/api/app'
const UPDATE = `${APP}/architectures/controllers/architectures-controller.ts#ArchitecturesController.update`
const MESSAGE = 'A sequence diagram of updating an architecture'

const GRAPH = readFileSync(app.makePath('../../packages/codemap/fixtures/adonis-graph.json'))

/** In the outline of the fixture, s1 is the update route of architectures. */
const TARGET = {
  reply: '',
  target: {
    kind: 'sequence',
    title: 'Update an architecture',
    reason: 'The route and what it calls.',
    focus: ['s1'],
  },
}

const DRAWING = JSON.stringify({
  title: 'Update an architecture',
  summary: 'The update route, drawn from the code map.',
  diagram: JSON.stringify({
    kind: 'sequence',
    participants: [
      { id: 'client', kind: 'actor', label: 'Client' },
      { id: 'controller', label: 'ArchitecturesController' },
    ],
    steps: [{ type: 'message', from: 'client', to: 'controller', text: 'update()', arrow: 'sync' }],
  }),
  links: [{ element: 'controller', nodes: ['n1'] }],
})

const UNAUTHORIZED = new APICallError({
  message: 'no',
  url: 'x',
  requestBodyValues: {},
  statusCode: 401,
})

function useModel(model: LanguageModel) {
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
}

/** A model that gives these answers in turn; an `Error` is thrown instead. */
function answersInTurn(...answers: (string | Error)[]) {
  let call = 0
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const answer = answers[call]
      call += 1
      if (answer === undefined) throw new Error('the model was called once too often')
      if (answer instanceof Error) throw answer
      return {
        content: [{ type: 'text', text: answer }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 10, text: 10, reasoning: undefined },
        },
        warnings: [],
      }
    },
  })
}

async function setup({ codeMaps = true, inProject = true } = {}) {
  const user = await User.create({
    email: `code-messages-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  await saveTestLlmKey(user)
  if (codeMaps) await updateFlag(FeatureFlagKey.CodeMaps, ON, user)
  await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
  const project = await Project.create({ userId: user.id, name: 'Shop', description: null })
  const architecture = await Architecture.create({
    userId: user.id,
    projectId: inProject ? project.id : null,
    title: 'API',
  })
  await Diagram.create({
    architectureId: architecture.id,
    title: 'Overview',
    kind: 'component',
    format: 'json',
    content: { kind: 'component', elements: [{ id: 'api', kind: 'component' }], relations: [] },
    position: 0,
    version: 1,
  })
  const conversation = await AssistantConversation.create({
    userId: user.id,
    title: '',
  })
  return { user, project, architecture, conversation }
}

/** A ready map of the project, uploaded through the route so that it is stored as the app does. */
async function uploadMap(client: Client, user: User, projectId: number) {
  await updateFlag(FeatureFlagKey.CodeMaps, ON, user)
  const response = await client
    .post(`/projects/${projectId}/code-maps`)
    .headers(json)
    .loginAs(user)
    .file('file', GRAPH, { filename: 'graph.json' })
  response.assertStatus(201)
  return (response.body() as { codeMap: CodeMapOutput }).codeMap
}

function ask(
  client: Client,
  user: User,
  path: { architectureId: number; conversationId: number },
  body: Record<string, unknown>,
) {
  return client
    .post(
      `/architectures/${path.architectureId}/assistant/conversations/${path.conversationId}/messages`,
    )
    .headers(json)
    .loginAs(user)
    .json({
      provider,
      apiKey: KEY,
      message: MESSAGE,
      currentDiagramId: null,
      locale: 'en',
      ...body,
    })
}

const stored = (conversationId: number) =>
  AssistantMessage.query().where('conversationId', conversationId).orderBy('id', 'asc')

test.group('Assistant - messages drawn from the code map', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => {
    drive.fake()
    return () => drive.restore()
  })
  group.each.teardown(() => {
    app.container.restore(LanguageModels)
  })

  test('answers 404 while the code maps flag is off', async ({ client, assert }) => {
    const { user, project, architecture, conversation } = await setup()
    const map = await uploadMap(client, user, project.id)
    await updateFlag(FeatureFlagKey.CodeMaps, { ...ON, enabled: false }, user)
    const model = answersInTurn()
    useModel(model)
    const response = await ask(
      client,
      user,
      { architectureId: architecture.id, conversationId: conversation.id },
      { codeMapId: map.id },
    )
    response.assertStatus(404)
    assert.lengthOf(model.doGenerateCalls, 0)
  })

  test('answers 404 for a stranger’s map, another project’s map, or an architecture outside any project', async ({
    client,
    assert,
  }) => {
    const { user, architecture, conversation } = await setup()
    const path = { architectureId: architecture.id, conversationId: conversation.id }
    const model = answersInTurn()
    useModel(model)

    const stranger = await setup()
    const theirs = await uploadMap(client, stranger.user, stranger.project.id)
    ;(await ask(client, user, path, { codeMapId: theirs.id })).assertStatus(404)

    const other = await Project.create({ userId: user.id, name: 'Other', description: null })
    const elsewhere = await uploadMap(client, user, other.id)
    ;(await ask(client, user, path, { codeMapId: elsewhere.id })).assertStatus(404)

    const outside = await setup({ inProject: false })
    const map = await uploadMap(client, outside.user, outside.project.id)
    const response = await ask(
      client,
      outside.user,
      { architectureId: outside.architecture.id, conversationId: outside.conversation.id },
      { codeMapId: map.id },
    )
    response.assertStatus(404)

    assert.lengthOf(model.doGenerateCalls, 0)
    assert.lengthOf(await stored(conversation.id), 0)
  })

  test('answers 409 while the map is not ready', async ({ client, assert }) => {
    const { user, project, architecture, conversation } = await setup()
    const map = await uploadMap(client, user, project.id)
    await CodeMap.query().where('id', map.id).update({ status: 'pending' })
    const model = answersInTurn()
    useModel(model)
    const response = await ask(
      client,
      user,
      { architectureId: architecture.id, conversationId: conversation.id },
      { codeMapId: map.id },
    )
    response.assertStatus(409)
    assert.lengthOf(model.doGenerateCalls, 0)
  })

  test('draws the requested view as a pending change with its links to the code', async ({
    client,
    assert,
  }) => {
    const { user, project, architecture, conversation } = await setup()
    const path = { architectureId: architecture.id, conversationId: conversation.id }
    const map = await uploadMap(client, user, project.id)
    const model = answersInTurn(JSON.stringify(TARGET), DRAWING)
    useModel(model)
    const logs = captureLogs()
    let response: Awaited<ReturnType<typeof ask>>
    try {
      response = await ask(client, user, path, { codeMapId: map.id })
    } finally {
      logs.restore()
    }
    response.assertStatus(200)
    const body = response.body() as AskAssistantOutput
    assert.lengthOf(model.doGenerateCalls, 2)
    assert.deepEqual(
      body.messages.map((message) => [message.role, message.content]),
      [
        ['user', MESSAGE],
        [
          'assistant',
          // An uploaded map names no repository: nothing of the source is read.
          'The update route, drawn from the code map.\n\nSource code not read: this map names no GitHub repository. Drawn from the structure only.',
        ],
      ],
    )
    assert.deepEqual(body.skipped, [])
    const change = body.messages[1]?.changes?.[0]
    assert.deepInclude(change, { op: 'create', kind: 'sequence', status: 'pending' })
    assert.deepEqual(change?.codeLinks, [{ elementId: 'controller', codeKey: UPDATE }])

    // The first call read the outline and the request, the second the calls from the route.
    const first = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    assert.include(first, `<request>${MESSAGE}</request>`)
    assert.include(first, 's1 | route | ArchitecturesController.update')
    assert.include(first, '- component: Overview')
    assert.include(JSON.stringify(model.doGenerateCalls[1]?.prompt), 'Entry point: n1 (route)')

    // Stored as the conversation's messages, titled after the request.
    const messages = await stored(conversation.id)
    assert.deepEqual(
      messages.map((message) => message.id),
      body.messages.map((message) => message.id),
    )
    assert.equal((await AssistantConversation.findOrFail(conversation.id)).title, MESSAGE)

    assert.notInclude(JSON.stringify(body), KEY)
    assert.notInclude(logs.lines.join('\n'), KEY)
    assert.notInclude(logs.lines.join('\n'), MESSAGE)
    assert.notInclude(await dumpDatabase(), KEY)

    // Accepted like any other change: the view exists, linked to the code.
    const accepted = await client
      .post(
        `/architectures/${architecture.id}/assistant/conversations/${conversation.id}/messages/${String(body.messages[1]?.id)}/changes/0/accept`,
      )
      .headers(json)
      .loginAs(user)
    accepted.assertStatus(200)
    const diagramId = (accepted.body() as { diagram: { id: number } }).diagram.id
    const links = await DiagramCodeLink.query().where('diagramId', diagramId)
    assert.deepEqual(
      links.map((link) => [link.elementId, link.codeKey, link.status]),
      [['controller', UPDATE, 'confirmed']],
    )
  })

  test('sends the conversation so far with the next request', async ({ client, assert }) => {
    const { user, project, architecture, conversation } = await setup()
    const path = { architectureId: architecture.id, conversationId: conversation.id }
    const map = await uploadMap(client, user, project.id)
    const model = answersInTurn(
      JSON.stringify(TARGET),
      DRAWING,
      JSON.stringify({ reply: 'Which one?', target: null }),
    )
    useModel(model)
    ;(await ask(client, user, path, { codeMapId: map.id })).assertStatus(200)
    const second = await ask(client, user, path, { codeMapId: map.id, message: 'The same one' })
    second.assertStatus(200)
    const prompt = JSON.stringify(model.doGenerateCalls[2]?.prompt)
    assert.include(prompt, `user: ${MESSAGE}`)
    assert.include(prompt, 'assistant: The update route, drawn from the code map.')
    assert.include(prompt, '<request>The same one</request>')
    assert.lengthOf(await stored(conversation.id), 4)
  })

  test('a follow-up that names nothing still reads the code the earlier request named', async ({
    client,
    assert,
  }) => {
    const { user, project, architecture, conversation } = await setup()
    const path = { architectureId: architecture.id, conversationId: conversation.id }
    const map = await uploadMap(client, user, project.id)
    const nothing = JSON.stringify({ reply: 'Which one?', target: null })
    const model = answersInTurn(nothing, nothing)
    useModel(model)
    // `assertOwner` is called by other code: the outline lists it only when a request names it.
    const first = await ask(client, user, path, {
      codeMapId: map.id,
      message: 'A sequence diagram of assertOwner',
    })
    first.assertStatus(200)
    const second = await ask(client, user, path, {
      codeMapId: map.id,
      message: 'The same as an activity diagram',
    })
    second.assertStatus(200)
    assert.include(JSON.stringify(model.doGenerateCalls[0]?.prompt), '| function | assertOwner |')
    assert.include(JSON.stringify(model.doGenerateCalls[1]?.prompt), '| function | assertOwner |')
  })

  test('answers in text, with one model call, when the model gives no target', async ({
    client,
    assert,
  }) => {
    const { user, project, architecture, conversation } = await setup()
    const map = await uploadMap(client, user, project.id)
    const model = answersInTurn(JSON.stringify({ reply: 'Name a class.', target: null }))
    useModel(model)
    const response = await ask(
      client,
      user,
      { architectureId: architecture.id, conversationId: conversation.id },
      { codeMapId: map.id },
    )
    response.assertStatus(200)
    const body = response.body() as AskAssistantOutput
    assert.equal(body.messages[1]?.content, 'Name a class.')
    assert.isNull(body.messages[1]?.changes)
    assert.lengthOf(model.doGenerateCalls, 1)
  })

  test('answers with the fixed sentence when the model cites nothing usable', async ({
    client,
    assert,
  }) => {
    const { user, project, architecture, conversation } = await setup()
    const path = { architectureId: architecture.id, conversationId: conversation.id }
    const map = await uploadMap(client, user, project.id)
    const unusable = JSON.stringify({ reply: '', target: { ...TARGET.target, focus: ['s99'] } })
    const model = answersInTurn(unusable, unusable)
    useModel(model)

    const english = (
      await ask(client, user, path, { codeMapId: map.id })
    ).body() as AskAssistantOutput
    assert.equal(
      english.messages[1]?.content,
      'I found nothing in the code map that matches this request. Name a folder, a class, a function or a route.',
    )
    assert.isNull(english.messages[1]?.changes)

    const french = (
      await ask(client, user, path, { codeMapId: map.id, locale: 'fr' })
    ).body() as AskAssistantOutput
    assert.equal(
      french.messages[1]?.content,
      'Je n’ai rien trouvé dans la carte du code qui corresponde à cette demande. Nommez un dossier, une classe, une fonction ou une route.',
    )
    assert.lengthOf(model.doGenerateCalls, 2)
  })

  test('a message without a usable word still answers', async ({ client, assert }) => {
    const { user, project, architecture, conversation } = await setup()
    const map = await uploadMap(client, user, project.id)
    useModel(answeringModel(JSON.stringify({ reply: 'Name a class.', target: null })))
    const response = await ask(
      client,
      user,
      { architectureId: architecture.id, conversationId: conversation.id },
      { codeMapId: map.id, message: 'ok' },
    )
    response.assertStatus(200)
    assert.equal((response.body() as AskAssistantOutput).messages[0]?.content, 'ok')
  })

  test('answers 502 and stores nothing when either call fails', async ({ client, assert }) => {
    const { user, project, architecture, conversation } = await setup()
    const path = { architectureId: architecture.id, conversationId: conversation.id }
    const map = await uploadMap(client, user, project.id)

    useModel(failingModel(UNAUTHORIZED))
    const first = await ask(client, user, path, { codeMapId: map.id })
    first.assertStatus(502)
    assert.equal((first.body() as { reason: string }).reason, 'unauthorized')

    useModel(answersInTurn(JSON.stringify(TARGET), UNAUTHORIZED))
    ;(await ask(client, user, path, { codeMapId: map.id })).assertStatus(502)

    assert.lengthOf(await stored(conversation.id), 0)
    assert.equal((await AssistantConversation.findOrFail(conversation.id)).title, '')
  })

  test('without codeMapId the route answers as before', async ({ client, assert }) => {
    const { user, architecture, conversation } = await setup({ codeMaps: false })
    const model = answeringModel(JSON.stringify({ reply: 'Nothing to change.', changes: [] }))
    useModel(model)
    const response = await ask(
      client,
      user,
      { architectureId: architecture.id, conversationId: conversation.id },
      {},
    )
    response.assertStatus(200)
    const body = response.body() as AskAssistantOutput
    assert.equal(body.messages[1]?.content, 'Nothing to change.')
    assert.lengthOf(model.doGenerateCalls, 1)
    // The assistant's own prompt: the views, no outline of the code.
    assert.notInclude(JSON.stringify(model.doGenerateCalls[0]?.prompt), '<request>')
  })
})
