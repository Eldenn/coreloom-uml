import { readFileSync } from 'node:fs'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { LanguageModel } from '@coreloom-uml/llm'
import { APICallError, answeringModel, failingModel } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import Architecture from '#app/architectures/models/architecture'
import CodeMap from '#app/code-maps/models/code-map'
import DiagramCodeLink from '#app/code-maps/models/diagram-code-link'
import type {
  CodeMapOutput,
  CodeMapSuggestionOutput,
  CodeMapSuggestionsOutput,
  DraftSuggestionOutput,
} from '#app/code-maps/validators/code-maps-output'
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
const KEY = 'sk-fixture-9c1f3b77-never-stored'
const provider = { kind: 'mistral', model: 'mistral-small-latest' }
const APP = 'apps/api/app'
const CONTROLLER = `${APP}/architectures/controllers/architectures-controller.ts#ArchitecturesController`
const UPDATE = `${CONTROLLER}.update`

const GRAPH = readFileSync(app.makePath('../../packages/codemap/fixtures/adonis-graph.json'))

/** In the outline of the fixture: f2 is `apps/api/app/`, s1 the update route, c1 its class. */
const SUGGESTIONS = {
  suggestions: [
    { kind: 'package', title: 'Main parts', reason: 'The domains of the API.', focus: ['f2'] },
    {
      kind: 'sequence',
      title: 'Update an architecture',
      reason: 'The busiest route.',
      focus: ['s1'],
    },
    { kind: 'class', title: 'Architectures', reason: 'The core classes.', focus: ['c1', 'c99'] },
    { kind: 'state', title: 'Dropped', reason: 'Unknown kind.', focus: ['f1'] },
  ],
}

const PACKAGE = {
  kind: 'package',
  elements: [
    { id: 'architectures', kind: 'package', label: 'architectures' },
    { id: 'projects', kind: 'package', label: 'projects' },
  ],
  relations: [{ from: 'architectures', to: 'projects', kind: 'dependency' }],
}

const SEQUENCE = {
  kind: 'sequence',
  participants: [
    { id: 'client', kind: 'actor', label: 'Client' },
    { id: 'controller', label: 'ArchitecturesController' },
  ],
  steps: [{ type: 'message', from: 'client', to: 'controller', text: 'update()', arrow: 'sync' }],
}

function drawing(diagram: object, links: { element: string; nodes: string[] }[]) {
  return JSON.stringify({
    title: 'Drawn view',
    summary: 'Drawn from the code map.',
    diagram: JSON.stringify(diagram),
    links,
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
    email: `diagram-suggestions-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  await saveTestLlmKey(user)
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
    kind: 'component',
    format: 'json',
    content: { kind: 'component', elements: [{ id: 'api', kind: 'component' }], relations: [] },
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

function suggest(client: Client, user: User, codeMapId: number) {
  return client
    .post(`/code-maps/${codeMapId}/suggestions`)
    .headers(json)
    .loginAs(user)
    .json({ provider, apiKey: KEY, locale: 'en' })
}

async function list(client: Client, user: User, codeMapId: number) {
  const response = await client
    .get(`/code-maps/${codeMapId}/suggestions`)
    .headers(json)
    .loginAs(user)
  response.assertStatus(200)
  return response.body() as CodeMapSuggestionsOutput
}

function draft(
  client: Client,
  user: User,
  suggestionId: number,
  body: Record<string, unknown> = {},
) {
  return client
    .post(`/code-map-suggestions/${suggestionId}/draft`)
    .headers(json)
    .loginAs(user)
    .json({ provider, apiKey: KEY, locale: 'en', ...body })
}

function byTitle(suggestions: CodeMapSuggestionOutput[], title: string) {
  const found = suggestions.find((suggestion) => suggestion.title === title)
  if (!found) throw new Error(`no proposal named ${title}`)
  return found
}

test.group('Code maps - diagram suggestions', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => {
    drive.fake()
    return () => drive.restore()
  })
  group.each.teardown(() => {
    app.container.restore(LanguageModels)
  })

  test('answers 404 while the code maps flag is off', async ({ client }) => {
    const { user } = await setup({ codeMaps: false })
    ;(await client.get('/code-maps/1/suggestions').headers(json).loginAs(user)).assertStatus(404)
    ;(await suggest(client, user, 1)).assertStatus(404)
  })

  test('proposes diagrams from the outline of the map, without the key', async ({
    client,
    assert,
  }) => {
    const { user, project } = await setup()
    const map = await uploadMap(client, user, project.id)
    assert.deepEqual(await list(client, user, map.id), {
      codeMapId: map.id,
      suggestedAt: null,
      suggestions: [],
    })

    const model = answeringModel(JSON.stringify(SUGGESTIONS))
    useModel(model)
    const logs = captureLogs()
    let response: Awaited<ReturnType<typeof suggest>>
    try {
      response = await suggest(client, user, map.id)
    } finally {
      logs.restore()
    }
    response.assertStatus(201)
    const body = response.body() as CodeMapSuggestionsOutput
    assert.isString(body.suggestedAt)
    assert.deepEqual(
      body.suggestions.map(({ kind, title, focus, status }) => ({ kind, title, focus, status })),
      [
        { kind: 'package', title: 'Main parts', focus: [`${APP}/`], status: 'open' },
        { kind: 'sequence', title: 'Update an architecture', focus: [UPDATE], status: 'open' },
        { kind: 'class', title: 'Architectures', focus: [CONTROLLER], status: 'open' },
      ],
    )
    assert.deepEqual(await list(client, user, map.id), body)

    // The outline holds folders, classes, starts and the project's existing views.
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    assert.include(prompt, `f2 | ${APP} |`)
    assert.include(prompt, 's1 | route | ArchitecturesController.update')
    assert.include(prompt, '- component: Overview')
    assert.notInclude(JSON.stringify(body), KEY)
    assert.notInclude(logs.lines.join('\n'), KEY)
    assert.notInclude(await dumpDatabase(), KEY)
  })

  test('a new list replaces the proposals not drawn yet', async ({ client, assert }) => {
    const { user, project, architecture } = await setup()
    const map = await uploadMap(client, user, project.id)
    useModel(answeringModel(JSON.stringify(SUGGESTIONS)))
    const first = (await suggest(client, user, map.id)).body() as CodeMapSuggestionsOutput

    const parts = byTitle(first.suggestions, 'Main parts')
    const dismissed = await client
      .patch(`/code-map-suggestions/${byTitle(first.suggestions, 'Architectures').id}`)
      .headers(json)
      .loginAs(user)
      .json({ status: 'dismissed' })
    dismissed.assertStatus(200)
    assert.equal((dismissed.body() as CodeMapSuggestionOutput).status, 'dismissed')

    useModel(answeringModel(drawing(PACKAGE, [{ element: 'architectures', nodes: ['n1'] }])))
    ;(await draft(client, user, parts.id, { architectureId: architecture.id })).assertStatus(201)

    useModel(
      answeringModel(
        JSON.stringify({
          suggestions: [{ kind: 'component', title: 'Components', reason: 'r', focus: ['f3'] }],
        }),
      ),
    )
    const second = (await suggest(client, user, map.id)).body() as CodeMapSuggestionsOutput
    assert.deepEqual(
      second.suggestions.map((suggestion) => [suggestion.title, suggestion.status]),
      [
        ['Main parts', 'drafted'],
        ['Components', 'open'],
      ],
    )
    // A drawn proposal stays as it is.
    ;(
      await client
        .patch(`/code-map-suggestions/${parts.id}`)
        .headers(json)
        .loginAs(user)
        .json({ status: 'dismissed' })
    ).assertStatus(409)
  })

  test('draws a structure as a new view, accepted with its links to the code', async ({
    client,
    assert,
  }) => {
    const { user, project, architecture } = await setup()
    const map = await uploadMap(client, user, project.id)
    useModel(answeringModel(JSON.stringify(SUGGESTIONS)))
    const listed = (await suggest(client, user, map.id)).body() as CodeMapSuggestionsOutput
    const parts = byTitle(listed.suggestions, 'Main parts')

    const model = answeringModel(
      drawing(PACKAGE, [
        { element: 'architectures', nodes: ['n1'] },
        { element: 'projects', nodes: [`${APP}/projects/`] },
      ]),
    )
    useModel(model)
    const response = await draft(client, user, parts.id, { architectureId: architecture.id })
    response.assertStatus(201)
    const body = response.body() as DraftSuggestionOutput
    assert.deepInclude(body.suggestion, {
      status: 'drafted',
      architectureId: architecture.id,
      conversationId: body.conversation.id,
    })
    assert.equal(
      body.messages[0]?.content,
      'Draw the proposed view “Main parts” as a package diagram.',
    )
    const change = body.messages[1]?.changes?.[0]
    assert.deepInclude(change, { op: 'create', kind: 'package', status: 'pending' })
    assert.deepEqual(change?.codeLinks, [
      { elementId: 'architectures', codeKey: `${APP}/architectures/` },
      { elementId: 'projects', codeKey: `${APP}/projects/` },
    ])
    // The model read the folders of `apps/api/app/` and the request.
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    assert.include(prompt, `n1 | folder | architectures | ${APP}/architectures`)
    assert.include(prompt, '<request>Main parts: The domains of the API.</request>')

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
        ['architectures', `${APP}/architectures/`, 'confirmed'],
        ['projects', `${APP}/projects/`, 'confirmed'],
      ],
    )
  })

  test('draws a process from its start', async ({ client, assert }) => {
    const { user, project, architecture } = await setup()
    const map = await uploadMap(client, user, project.id)
    useModel(answeringModel(JSON.stringify(SUGGESTIONS)))
    const listed = (await suggest(client, user, map.id)).body() as CodeMapSuggestionsOutput
    const flow = byTitle(listed.suggestions, 'Update an architecture')

    const model = answeringModel(drawing(SEQUENCE, [{ element: 'controller', nodes: ['n1'] }]))
    useModel(model)
    const response = await draft(client, user, flow.id, {
      architectureId: architecture.id,
      locale: 'fr',
    })
    response.assertStatus(201)
    const body = response.body() as DraftSuggestionOutput
    assert.equal(
      body.messages[0]?.content,
      'Dessiner la vue proposée « Update an architecture » en diagramme de séquence.',
    )
    assert.deepEqual(body.messages[1]?.changes?.[0]?.codeLinks, [
      { elementId: 'controller', codeKey: UPDATE },
    ])
    assert.include(JSON.stringify(model.doGenerateCalls[0]?.prompt), 'Entry point: n1 (route)')
  })

  test('answers 502 when the call fails, and keeps the map unsuggested', async ({
    client,
    assert,
  }) => {
    const { user, project } = await setup()
    const map = await uploadMap(client, user, project.id)
    useModel(
      failingModel(
        new APICallError({ message: 'no', url: 'x', requestBodyValues: {}, statusCode: 401 }),
      ),
    )
    ;(await suggest(client, user, map.id)).assertStatus(502)
    const stored = await CodeMap.findOrFail(map.id)
    assert.isNull(stored.suggestedAt)
    assert.lengthOf((await list(client, user, map.id)).suggestions, 0)
  })

  test('refuses a stranger, another project’s architecture, or drafting without the assistant', async ({
    client,
  }) => {
    const { user, project, architecture } = await setup()
    const map = await uploadMap(client, user, project.id)
    useModel(answeringModel(JSON.stringify(SUGGESTIONS)))
    const listed = (await suggest(client, user, map.id)).body() as CodeMapSuggestionsOutput
    const [first] = listed.suggestions
    if (!first) throw new Error('expected a proposal')

    const stranger = await setup()
    ;(await suggest(client, stranger.user, map.id)).assertStatus(404)
    ;(
      await client.get(`/code-maps/${map.id}/suggestions`).headers(json).loginAs(stranger.user)
    ).assertStatus(404)
    ;(
      await client
        .patch(`/code-map-suggestions/${first.id}`)
        .headers(json)
        .loginAs(stranger.user)
        .json({ status: 'dismissed' })
    ).assertStatus(404)
    ;(
      await draft(client, stranger.user, first.id, { architectureId: stranger.architecture.id })
    ).assertStatus(404)
    ;(
      await draft(client, user, first.id, { architectureId: stranger.architecture.id })
    ).assertStatus(404)
    ;(
      await client
        .patch(`/code-map-suggestions/${first.id}`)
        .headers(json)
        .loginAs(user)
        .json({ status: 'drafted' })
    ).assertStatus(422)

    await updateFlag(FeatureFlagKey.DiagramAssistant, { ...ON, enabled: false }, user)
    ;(await draft(client, user, first.id, { architectureId: architecture.id })).assertStatus(404)
  })
})
