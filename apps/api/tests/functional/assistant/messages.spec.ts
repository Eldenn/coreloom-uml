import app from '@adonisjs/core/services/app'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { LanguageModel } from '@coreloom-uml/llm'
import {
  APICallError,
  answeringModel,
  failingModel,
  MockLanguageModelV4,
} from '@coreloom-uml/llm/testing'
import type { UmlSpec } from '@coreloom-uml/uml'
import { test } from '@japa/runner'
import Architecture from '#app/architectures/models/architecture'
import { AssistantRole } from '#app/assistant/constants/assistant'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import Diagram from '#app/diagrams/models/diagram'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import { LLM_REQUESTS_PER_MINUTE } from '#app/llm/constants/llm'
import LanguageModels from '#app/llm/services/language-models'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
/** The fixture key: it must never show up in a response, a log line or the database. */
const KEY = 'sk-fixture-7d2e0a41-never-stored'
const hosted = { kind: 'mistral', model: 'mistral-small-latest' }

const BEFORE: UmlSpec = {
  kind: 'class',
  classes: [{ id: 'A' }, { id: 'B' }],
  relations: [],
  layout: { A: { x: 10, y: 20 }, B: { x: 200, y: 20 } },
}
const AFTER = { kind: 'class', classes: [{ id: 'A' }, { id: 'C' }], relations: [] }

function useModel(model: LanguageModel) {
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
}

/** A model answering each call with the next text of the list, counting the calls. */
function sequenceModel(texts: string[]) {
  const calls = { count: 0 }
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: texts[Math.min(calls.count++, texts.length - 1)] ?? '' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 10, text: 10, reasoning: undefined },
      },
      warnings: [],
    }),
  })
  return { model, calls }
}

function answer(changes: Record<string, unknown>[], reply = 'Done.') {
  return JSON.stringify({
    reply,
    changes: changes.map((change) => ({
      op: 'update',
      diagramId: null,
      kind: null,
      title: null,
      diagram: null,
      relayout: false,
      ...change,
    })),
  })
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
  const base = `/architectures/${architecture.id}/assistant/conversations/${conversation.id}`
  return { user, architecture, diagram, other, conversation, base }
}

function ask(diagramId: number, extra: Record<string, unknown> = {}) {
  return {
    provider: hosted,
    apiKey: KEY,
    message: 'Replace B with C in the domain view.',
    currentDiagramId: diagramId,
    locale: 'en',
    ...extra,
  }
}

const storedMessages = (conversationId: number) =>
  AssistantMessage.query().where('conversationId', conversationId).orderBy('id', 'asc')

test.group('Assistant messages', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('stores the exchange and a pending update with the old positions kept', async ({
    client,
    assert,
  }) => {
    const { user, diagram, conversation, base } = await setup('assist-msg-store@example.com')
    const longTitle = 'T'.repeat(300)
    useModel(
      answeringModel(
        answer([
          { diagramId: diagram.id, diagram: JSON.stringify(AFTER) },
          { op: 'create', title: longTitle, diagram: JSON.stringify(AFTER) },
        ]),
      ),
    )

    const response = await client
      .post(`${base}/messages`)
      .headers(json)
      .loginAs(user)
      .json(ask(diagram.id))

    response.assertStatus(200)
    const [asked, answered] = response.body().messages
    assert.equal(asked.role, 'user')
    assert.equal(asked.content, 'Replace B with C in the domain view.')
    assert.equal(answered.role, 'assistant')
    assert.equal(answered.content, 'Done.')
    const [update, create] = answered.changes
    assert.equal(update.op, 'update')
    assert.equal(update.status, 'pending')
    assert.equal(update.diagramId, diagram.id)
    assert.deepEqual(update.after.layout, { A: { x: 10, y: 20 } })
    assert.equal(update.placed, 1)
    assert.equal(update.baseVersion, 3)
    assert.deepEqual(update.before, BEFORE)
    assert.equal(create.op, 'create')
    assert.equal(create.status, 'pending')
    assert.isNull(create.diagramId)
    assert.lengthOf(create.title, 120)
    assert.equal(response.body().budget.max, 32_000)
    assert.isAbove(response.body().budget.history, 0)
    assert.deepEqual(response.body().skipped, [])

    const stored = await storedMessages(conversation.id)
    assert.deepEqual(
      stored.map((message) => message.role),
      [AssistantRole.User, AssistantRole.Assistant],
    )
    assert.equal(stored[1].changes?.[0].baseTitle, 'Domain')
    assert.equal(stored[1].changes?.[0].baseFormat, 'mermaid')
    await conversation.refresh()
    assert.equal(conversation.title, 'Replace B with C in the domain view.')

    const show = await client.get(base).headers(json).loginAs(user)
    show.assertStatus(200)
    assert.lengthOf(show.body().messages, 2)
    assert.equal(show.body().budget.max, 32_000)
    assert.isAbove(show.body().budget.history, 0)
  })

  test('never changes a diagram', async ({ client, assert }) => {
    const { user, architecture, diagram, other, conversation, base } = await setup(
      'assist-msg-never@example.com',
    )
    useModel(
      answeringModel(
        answer([
          { op: 'delete', diagramId: other.id },
          { diagramId: diagram.id, diagram: JSON.stringify(AFTER), title: 'Renamed' },
        ]),
      ),
    )

    const response = await client
      .post(`${base}/messages`)
      .headers(json)
      .loginAs(user)
      .json(ask(diagram.id))

    response.assertStatus(200)
    const [deleted, updated] = response.body().messages[1].changes
    assert.equal(deleted.op, 'delete')
    assert.equal(deleted.status, 'pending')
    assert.equal(updated.title, 'Renamed')
    const diagrams = await Diagram.query()
      .where('architectureId', architecture.id)
      .orderBy('position', 'asc')
    assert.deepEqual(
      diagrams.map((item) => [item.id, item.version, item.title]),
      [
        [diagram.id, 3, 'Domain'],
        [other.id, 1, 'Context'],
      ],
    )
    assert.deepEqual(diagrams[0].content, BEFORE)
    assert.lengthOf(await storedMessages(conversation.id), 2)
  })

  test('stores a failed change after the repair attempt', async ({ client, assert }) => {
    const { user, diagram, base } = await setup('assist-msg-failed@example.com')
    const invalid = answer([{ diagramId: diagram.id, diagram: '{"kind":"class","classes":"no"}' }])
    const { model, calls } = sequenceModel([invalid, invalid])
    useModel(model)

    const response = await client
      .post(`${base}/messages`)
      .headers(json)
      .loginAs(user)
      .json(ask(diagram.id))

    response.assertStatus(200)
    assert.equal(calls.count, 2)
    const [change] = response.body().messages[1].changes
    assert.equal(change.status, 'failed')
    assert.isNull(change.after)
    assert.isNotEmpty(change.problems)
  })

  test('answers 422 context_full and stores nothing', async ({ client, assert }) => {
    const { user, diagram, conversation, base } = await setup('assist-msg-full@example.com')
    await AssistantMessage.create({
      conversationId: conversation.id,
      role: AssistantRole.User,
      content: 'x'.repeat(130_000),
    })
    const { model, calls } = sequenceModel([answer([])])
    useModel(model)

    const response = await client
      .post(`${base}/messages`)
      .headers(json)
      .loginAs(user)
      .json(ask(diagram.id))

    response.assertStatus(422)
    assert.equal(response.body().error.code, 'context_full')
    assert.equal(calls.count, 0)
    assert.lengthOf(await storedMessages(conversation.id), 1)
  })

  test('502 with the reason and stores nothing, and the key is nowhere', async ({
    client,
    assert,
  }) => {
    const { user, diagram, conversation, base } = await setup('assist-msg-502@example.com')
    useModel(
      failingModel(
        new APICallError({
          message: `Provider refused key ${KEY}`,
          url: 'https://api.mistral.ai/v1/chat/completions',
          requestBodyValues: { apiKey: KEY },
          statusCode: 401,
          responseHeaders: { 'x-api-key': KEY },
          responseBody: JSON.stringify({ error: { message: `invalid x-api-key ${KEY}` } }),
        }),
      ),
    )
    const logs = captureLogs()

    const response = await client
      .post(`${base}/messages`)
      .headers(json)
      .loginAs(user)
      .json(ask(diagram.id))
    logs.restore()

    response.assertStatus(502)
    assert.equal(response.body().reason, 'unauthorized')
    assert.notInclude(JSON.stringify(response.body()), KEY)
    assert.notInclude(logs.lines.join('\n'), KEY)
    assert.isTrue(logs.lines.some((line) => line.includes('unauthorized')))
    assert.lengthOf(await storedMessages(conversation.id), 0)
    await conversation.refresh()
    assert.equal(conversation.title, '')
    assert.notInclude(await dumpDatabase(), KEY)
  })

  test('404 for a view of another architecture', async ({ client }) => {
    const { user, diagram, base } = await setup('assist-msg-404@example.com')
    const { diagram: foreign } = await setup('assist-msg-404-other@example.com')
    useModel(answeringModel(answer([])))

    for (const body of [ask(foreign.id), ask(diagram.id, { diagramIds: [foreign.id] })]) {
      const response = await client.post(`${base}/messages`).headers(json).loginAs(user).json(body)
      response.assertStatus(404)
    }
  })

  test('429 past the LLM limit', async ({ client }) => {
    const { user, diagram, base } = await setup('assist-msg-429@example.com')
    useModel(answeringModel(answer([])))
    for (let call = 0; call < LLM_REQUESTS_PER_MINUTE; call++) {
      ;(
        await client.post(`${base}/messages`).headers(json).loginAs(user).json(ask(diagram.id))
      ).assertStatus(200)
    }
    const over = await client
      .post(`${base}/messages`)
      .headers(json)
      .loginAs(user)
      .json(ask(diagram.id))
    over.assertStatus(429)
  })

  test('context endpoint lists skipped views when they do not fit', async ({ client, assert }) => {
    const { user, diagram, other, base } = await setup('assist-msg-context@example.com')
    const classes = Array.from({ length: 10_000 }, (_, index) => ({ id: `Class${index}` }))
    other.kind = 'class'
    other.content = { kind: 'class', classes, relations: [] }
    await other.save()

    const response = await client
      .post(`${base}/context`)
      .headers(json)
      .loginAs(user)
      .json({ currentDiagramId: diagram.id, locale: 'en' })

    response.assertStatus(200)
    assert.deepEqual(response.body().budget.skipped, [other.id])
    assert.equal(response.body().budget.max, 32_000)

    const selected = await client
      .post(`${base}/context`)
      .headers(json)
      .loginAs(user)
      .json({ currentDiagramId: diagram.id, diagramIds: [], locale: 'en', message: 'Hi' })
    selected.assertStatus(200)
    assert.deepEqual(selected.body().budget.skipped, [])
  })
})
