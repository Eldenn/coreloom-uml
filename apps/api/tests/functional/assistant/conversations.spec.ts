import app from '@adonisjs/core/services/app'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { LanguageModel } from '@coreloom-uml/llm'
import { APICallError, failingModel, MockLanguageModelV4 } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import Architecture from '#app/architectures/models/architecture'
import { AssistantRole } from '#app/assistant/constants/assistant'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import Diagram from '#app/diagrams/models/diagram'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const OFF = { enabled: false, rollout: 0, rules: [] }
const KEY = 'sk-fixture-continue-never-stored'
const summarize = {
  provider: { kind: 'mistral', model: 'mistral-small-latest' },
  apiKey: KEY,
  locale: 'en',
}

function useModel(model: LanguageModel) {
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
}

/** A model answering `text`, keeping every prompt it was sent. */
function recordingModel(text: string) {
  const prompts: string[] = []
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      prompts.push(JSON.stringify(options.prompt))
      return {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 10, text: 10, reasoning: undefined },
        },
        warnings: [],
      }
    },
  })
  return { model, prompts }
}

/** A conversation too long for another message, about an architecture with one view. */
async function longConversation(email: string) {
  const { user, architecture, base } = await setup(email)
  const diagram = await Diagram.create({
    architectureId: architecture.id,
    title: 'Domain',
    kind: 'class',
    format: 'mermaid',
    content: { kind: 'class', classes: [{ id: 'ViewOnlyMarker' }], relations: [] },
    position: 0,
    version: 1,
  })
  const conversation = await AssistantConversation.create({
    architectureId: architecture.id,
    userId: user.id,
    title: 'Plan',
  })
  await AssistantMessage.createMany([
    { conversationId: conversation.id, role: AssistantRole.User, content: 'x'.repeat(130_000) },
    { conversationId: conversation.id, role: AssistantRole.Assistant, content: 'Noted.' },
  ])
  return { user, architecture, diagram, conversation, base }
}

function makeUser(email: string) {
  return User.create({ email, password: 'a-very-strong-passphrase' })
}

async function setup(email: string) {
  const user = await makeUser(email)
  await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
  const architecture = await Architecture.create({
    userId: user.id,
    title: 'Shop',
    visibility: 'private',
  })
  return { user, architecture, base: `/architectures/${architecture.id}/assistant/conversations` }
}

test.group('Assistant conversations', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('404 while the flag is off, on real conversations and messages', async ({ client }) => {
    const { user, architecture, base } = await setup('assist-off@example.com')
    const conversation = await AssistantConversation.create({
      architectureId: architecture.id,
      userId: user.id,
      title: 'Plan',
    })
    const summary = await AssistantMessage.create({
      conversationId: conversation.id,
      role: AssistantRole.Summary,
      content: 'Earlier on.',
    })
    const path = `${base}/${conversation.id}`
    useModel(recordingModel('The plan so far.').model)
    await updateFlag(FeatureFlagKey.DiagramAssistant, OFF, user)

    for (const response of [
      await client.get(base).headers(json).loginAs(user),
      await client.post(base).headers(json).loginAs(user).json({}),
      await client.get(path).headers(json).loginAs(user),
      await client.patch(path).headers(json).loginAs(user).json({ title: 'x' }),
      await client.delete(path).headers(json).loginAs(user),
      await client.post(`${path}/continue`).headers(json).loginAs(user).json(summarize),
      await client.delete(`${path}/messages/${summary.id}`).headers(json).loginAs(user),
    ])
      response.assertStatus(404)

    // The same ids answer once the flag is back on: the 404s above came from the flag.
    await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
    const show = await client.get(path).headers(json).loginAs(user)
    show.assertStatus(200)
    const removed = await client
      .delete(`${path}/messages/${summary.id}`)
      .headers(json)
      .loginAs(user)
    removed.assertStatus(204)
  })

  test('creates, lists, renames and deletes', async ({ client, assert }) => {
    const { user, base } = await setup('assist-crud@example.com')

    const created = await client.post(base).headers(json).loginAs(user).json({ title: 'First' })
    created.assertStatus(201)
    const { id } = created.body().conversation
    const untitled = await client.post(base).headers(json).loginAs(user).json({})
    untitled.assertStatus(201)
    assert.equal(untitled.body().conversation.title, '')

    const list = await client.get(base).headers(json).loginAs(user)
    list.assertStatus(200)
    assert.lengthOf(list.body().data, 2)
    assert.equal(list.body().data[0].id, untitled.body().conversation.id)
    assert.deepEqual(list.body().meta, { page: 1, perPage: 20, total: 2, lastPage: 1 })

    const second = await client.get(base).qs({ page: 2, perPage: 1 }).headers(json).loginAs(user)
    second.assertStatus(200)
    assert.deepEqual(
      second.body().data.map((conversation: { id: number }) => conversation.id),
      [id],
    )
    assert.deepEqual(second.body().meta, { page: 2, perPage: 1, total: 2, lastPage: 2 })
    const zero = await client.get(base).qs({ perPage: 0 }).headers(json).loginAs(user)
    zero.assertStatus(422)

    const show = await client.get(`${base}/${id}`).headers(json).loginAs(user)
    show.assertStatus(200)
    assert.deepEqual(show.body().messages, [])
    assert.equal(show.body().conversation.title, 'First')

    const renamed = await client
      .patch(`${base}/${id}`)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Renamed' })
    renamed.assertStatus(200)
    assert.equal(renamed.body().conversation.title, 'Renamed')
    const blank = await client
      .patch(`${base}/${id}`)
      .headers(json)
      .loginAs(user)
      .json({ title: '  ' })
    blank.assertStatus(422)

    const removed = await client.delete(`${base}/${id}`).headers(json).loginAs(user)
    removed.assertStatus(204)
    assert.isNull(await AssistantConversation.find(id))
  })

  test("hides another account's architecture and conversation behind 404", async ({ client }) => {
    const { user, base } = await setup('assist-owner@example.com')
    const { user: other } = await setup('assist-other@example.com')
    const created = await client.post(base).headers(json).loginAs(user).json({})
    const path = `${base}/${created.body().conversation.id}`

    for (const response of [
      await client.get(base).headers(json).loginAs(other),
      await client.post(base).headers(json).loginAs(other).json({}),
      await client.get(path).headers(json).loginAs(other),
      await client.patch(path).headers(json).loginAs(other).json({ title: 'x' }),
      await client.delete(path).headers(json).loginAs(other),
    ])
      response.assertStatus(404)
  })

  test("reads a conversation through another architecture's path as 404", async ({ client }) => {
    const { user, base } = await setup('assist-mismatch@example.com')
    const second = await Architecture.create({
      userId: user.id,
      title: 'Other',
      visibility: 'private',
    })
    const created = await client.post(base).headers(json).loginAs(user).json({})
    const response = await client
      .get(`/architectures/${second.id}/assistant/conversations/${created.body().conversation.id}`)
      .headers(json)
      .loginAs(user)
    response.assertStatus(404)
  })

  test('refuses an API token (401)', async ({ client }) => {
    const { user, base } = await setup('assist-token@example.com')
    const token = await User.accessTokens.create(user, ['read', 'write'], { name: 'ci' })
    const response = await client
      .get(base)
      .headers({ ...json, authorization: `Bearer ${token.value?.release()}` })
    response.assertStatus(401)
  })

  test('deleting the architecture deletes its conversations and messages', async ({
    client,
    assert,
  }) => {
    const { user, architecture, base } = await setup('assist-cascade@example.com')
    const created = await client.post(base).headers(json).loginAs(user).json({})
    const message = await AssistantMessage.create({
      conversationId: created.body().conversation.id,
      role: AssistantRole.User,
      content: 'Hello',
    })
    const removed = await client
      .delete(`/architectures/${architecture.id}`)
      .headers(json)
      .loginAs(user)
    removed.assertStatus(204)
    assert.isNull(await AssistantConversation.find(created.body().conversation.id))
    assert.isNull(await AssistantMessage.find(message.id))
  })

  test('continues a conversation that is over the budget, with its summary first', async ({
    client,
    assert,
  }) => {
    const { user, diagram, conversation, base } = await longConversation(
      'assist-continue@example.com',
    )
    const { model, prompts } = recordingModel('  The plan so far.  ')
    useModel(model)

    const full = await client
      .post(`${base}/${conversation.id}/messages`)
      .headers(json)
      .loginAs(user)
      .json({ ...summarize, message: 'And now?', currentDiagramId: diagram.id })
    full.assertStatus(422)
    assert.equal(full.body().error.code, 'context_full')

    const response = await client
      .post(`${base}/${conversation.id}/continue`)
      .headers(json)
      .loginAs(user)
      .json(summarize)

    response.assertStatus(201)
    assert.lengthOf(prompts, 1)
    assert.notInclude(prompts[0], 'ViewOnlyMarker')
    assert.include(prompts[0], 'Noted.')
    const created = response.body().conversation
    assert.notEqual(created.id, conversation.id)
    assert.equal(created.title, 'Plan (2)')
    assert.deepEqual(
      response
        .body()
        .messages.map((message: { role: string; content: string }) => [
          message.role,
          message.content,
        ]),
      [['summary', 'The plan so far.']],
    )
    assert.equal(response.body().budget.max, 32_000)
    assert.isBelow(response.body().budget.history, 1000)
    assert.notInclude(JSON.stringify(response.body()), KEY)

    const old = await AssistantMessage.query().where('conversationId', conversation.id)
    assert.lengthOf(old, 2)
    await conversation.refresh()
    assert.equal(conversation.title, 'Plan')
  })

  test('continue: 502 stores nothing', async ({ client, assert }) => {
    const { user, architecture, conversation, base } = await longConversation(
      'assist-continue-502@example.com',
    )
    useModel(
      failingModel(
        new APICallError({
          message: 'unauthorized',
          url: 'https://api.mistral.ai/v1/chat/completions',
          requestBodyValues: {},
          statusCode: 401,
        }),
      ),
    )

    const response = await client
      .post(`${base}/${conversation.id}/continue`)
      .headers(json)
      .loginAs(user)
      .json(summarize)

    response.assertStatus(502)
    assert.equal(response.body().reason, 'unauthorized')
    const conversations = await AssistantConversation.query().where(
      'architectureId',
      architecture.id,
    )
    assert.lengthOf(conversations, 1)
  })

  test('continue: 409 on a conversation with no messages, without a model call', async ({
    client,
    assert,
  }) => {
    const { user, architecture, base } = await setup('assist-continue-blank@example.com')
    const conversation = await AssistantConversation.create({
      architectureId: architecture.id,
      userId: user.id,
      title: 'Plan',
    })
    const { model, prompts } = recordingModel('The plan so far.')
    useModel(model)

    const response = await client
      .post(`${base}/${conversation.id}/continue`)
      .headers(json)
      .loginAs(user)
      .json(summarize)

    response.assertStatus(409)
    assert.equal(response.body().error.code, 'nothing_to_summarize')
    assert.lengthOf(prompts, 0)
    const conversations = await AssistantConversation.query().where(
      'architectureId',
      architecture.id,
    )
    assert.lengthOf(conversations, 1)
  })

  test('continue: an empty summary is a 502 that stores nothing', async ({ client, assert }) => {
    const { user, architecture, conversation, base } = await longConversation(
      'assist-continue-empty@example.com',
    )
    useModel(recordingModel('   ').model)

    const response = await client
      .post(`${base}/${conversation.id}/continue`)
      .headers(json)
      .loginAs(user)
      .json(summarize)

    response.assertStatus(502)
    assert.equal(response.body().reason, 'unknown')
    const conversations = await AssistantConversation.query().where(
      'architectureId',
      architecture.id,
    )
    assert.lengthOf(conversations, 1)
  })

  test('deletes the summary but not another message', async ({ client, assert }) => {
    const { user, base } = await setup('assist-drop-summary@example.com')
    const { user: other } = await setup('assist-drop-summary-other@example.com')
    const created = await client.post(base).headers(json).loginAs(user).json({})
    const conversationId = created.body().conversation.id
    const [summary, asked] = await AssistantMessage.createMany([
      { conversationId, role: AssistantRole.Summary, content: 'Earlier on.' },
      { conversationId, role: AssistantRole.User, content: 'Go on.' },
    ])
    const path = (id: number) => `${base}/${conversationId}/messages/${id}`

    const refused = await client.delete(path(asked.id)).headers(json).loginAs(user)
    refused.assertStatus(409)
    const hidden = await client.delete(path(summary.id)).headers(json).loginAs(other)
    hidden.assertStatus(404)
    const removed = await client.delete(path(summary.id)).headers(json).loginAs(user)
    removed.assertStatus(204)
    const missing = await client.delete(path(summary.id)).headers(json).loginAs(user)
    missing.assertStatus(404)

    const left = await AssistantMessage.query().where('conversationId', conversationId)
    assert.deepEqual(
      left.map((message) => message.id),
      [asked.id],
    )
  })
})
