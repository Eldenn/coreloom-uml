import app from '@adonisjs/core/services/app'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { LanguageModel } from '@coreloom-uml/llm'
import { answeringModel } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import { AssistantRole, type StoredProposals } from '#app/assistant/constants/assistant'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import { conversationHistory } from '#app/assistant/services/assistant-context'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { dumpDatabase } from '#tests/helpers/leaks'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const OFF = { enabled: false, rollout: 0, rules: [] }
const KEY = 'sk-fixture-proposals-never-stored'
const hosted = { kind: 'mistral', model: 'mistral-small-latest' }
const FINDINGS = 'Findings: codename Quasar uses pnpm (https://docs.example/conventions).'
const SOURCES = [
  { url: 'https://docs.example/conventions', title: 'Conventions' },
  { url: 'http://docs.example/other', title: null },
]
const PROPOSED = JSON.stringify({
  ready: [{ slot: 'testing.levels', rule: 'unit', value: null, evidence: 'Write unit tests.' }],
  rules: [{ section: 'Workflow', text: 'Never push to main.' }],
})

type Client = TestContext['client']

function useModel(model: LanguageModel) {
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
}

async function setup(email: string, client: Client) {
  const user = await User.create({ email, password: 'a-very-strong-passphrase' })
  await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
  const created = await client
    .post('/agent-configs')
    .headers(json)
    .loginAs(user)
    .json({ name: 'Storefront', targets: ['generic'] })
  created.assertStatus(201)
  const conversation = await AssistantConversation.create({ userId: user.id, title: '' })
  return { user, configId: created.body().config.id as number, conversation }
}

function importInto(
  client: Client,
  user: User,
  configId: number,
  body: Record<string, unknown> = {},
) {
  return client
    .post(`/agent-configs/${configId}/imports`)
    .headers(json)
    .loginAs(user)
    .json({ provider: hosted, apiKey: KEY, content: FINDINGS, origin: 'research', ...body })
}

const target = (conversationId: number, extra: Record<string, unknown> = {}) => ({
  id: conversationId,
  request: '  Conventions of https://docs.example/conventions  ',
  sources: SOURCES,
  ...extra,
})

test.group('Assistant - proposals of a web research', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('stores the request and the proposals in the conversation', async ({ client, assert }) => {
    const { user, configId, conversation } = await setup('prop-store@example.com', client)
    useModel(answeringModel(PROPOSED))

    const response = await importInto(client, user, configId, {
      conversation: target(conversation.id),
    })

    response.assertStatus(200)
    const body = response.body()
    assert.lengthOf(body.ready, 1)
    assert.lengthOf(body.rules, 1)
    const [asked, answered] = body.messages
    assert.deepInclude(asked, {
      role: 'user',
      content: 'Conventions of https://docs.example/conventions',
      architectureId: null,
      proposals: null,
    })
    assert.deepInclude(answered, { role: 'assistant', content: '', architectureId: null })
    assert.deepEqual(answered.proposals, {
      agentConfigId: configId,
      sources: SOURCES,
      ready: body.ready,
      rules: body.rules,
      truncated: false,
      status: 'pending',
      added: null,
    })

    await conversation.refresh()
    assert.equal(conversation.title, 'Conventions of https://docs.example/conventions')
    const stored = await AssistantMessage.query().where('conversationId', conversation.id)
    assert.lengthOf(stored, 2)
    const database = await dumpDatabase()
    assert.notInclude(database, 'Quasar')
    assert.notInclude(database, KEY)
  })

  test('without a conversation, stores nothing and answers no messages', async ({
    client,
    assert,
  }) => {
    const { user, configId, conversation } = await setup('prop-none@example.com', client)
    useModel(answeringModel(PROPOSED))

    const response = await importInto(client, user, configId)

    response.assertStatus(200)
    assert.notProperty(response.body(), 'messages')
    assert.lengthOf(await AssistantMessage.query().where('conversationId', conversation.id), 0)
  })

  test("another account's conversation is a 404 before any model call", async ({
    client,
    assert,
  }) => {
    const { user, configId } = await setup('prop-foreign@example.com', client)
    const { conversation: foreign } = await setup('prop-foreign-other@example.com', client)
    const model = answeringModel(PROPOSED)
    useModel(model)

    const response = await importInto(client, user, configId, {
      conversation: target(foreign.id),
    })

    response.assertStatus(404)
    assert.lengthOf(model.doGenerateCalls, 0)
    assert.lengthOf(await AssistantMessage.query().where('conversationId', foreign.id), 0)
  })

  test('a conversation needs the research origin, the flag and web addresses', async ({
    client,
    assert,
  }) => {
    const { user, configId, conversation } = await setup('prop-refused@example.com', client)
    const model = answeringModel(PROPOSED)
    useModel(model)

    const file = await importInto(client, user, configId, {
      origin: undefined,
      conversation: target(conversation.id),
    })
    file.assertStatus(422)

    for (const sources of [
      [{ url: 'file:///etc/passwd', title: null }],
      [{ url: `https://docs.example/${'a'.repeat(2000)}`, title: null }],
      [{ url: 'https://docs.example', title: 'T'.repeat(301) }],
      Array.from({ length: 51 }, (_, n) => ({ url: `https://docs.example/${n}`, title: null })),
    ]) {
      const response = await importInto(client, user, configId, {
        conversation: target(conversation.id, { sources }),
      })
      response.assertStatus(422)
    }
    const blank = await importInto(client, user, configId, {
      conversation: target(conversation.id, { request: '   ' }),
    })
    blank.assertStatus(422)

    await updateFlag(FeatureFlagKey.DiagramAssistant, OFF, user)
    const off = await importInto(client, user, configId, { conversation: target(conversation.id) })
    off.assertStatus(404)

    assert.lengthOf(model.doGenerateCalls, 0)
    assert.lengthOf(await AssistantMessage.query().where('conversationId', conversation.id), 0)
  })

  test('settles the proposals once', async ({ client, assert }) => {
    const { user, configId, conversation } = await setup('prop-settle@example.com', client)
    const { user: stranger } = await setup('prop-settle-other@example.com', client)
    useModel(answeringModel(PROPOSED))
    const imported = await importInto(client, user, configId, {
      conversation: target(conversation.id),
    })
    const [asked, answered] = imported.body().messages
    const settle = (messageId: number, who: User, body: Record<string, unknown> = { added: 1 }) =>
      client
        .post(`/assistant/conversations/${conversation.id}/messages/${messageId}/proposals/settle`)
        .headers(json)
        .loginAs(who)
        .json(body)

    ;(await settle(answered.id, user, { added: -1 })).assertStatus(422)
    ;(await settle(answered.id, user, { added: 1.5 })).assertStatus(422)
    ;(await settle(answered.id, stranger)).assertStatus(404)
    ;(await settle(asked.id, user)).assertStatus(404)

    const settled = await settle(answered.id, user)
    settled.assertStatus(200)
    assert.equal(settled.body().message.id, answered.id)
    assert.equal(settled.body().message.proposals.status, 'settled')
    assert.equal(settled.body().message.proposals.added, 1)
    assert.deepEqual(settled.body().message.proposals.rules, answered.proposals.rules)

    const again = await settle(answered.id, user, { added: 0 })
    again.assertStatus(409)
    const stored = await AssistantMessage.findOrFail(answered.id)
    assert.equal(stored.proposals?.added, 1)

    await updateFlag(FeatureFlagKey.DiagramAssistant, OFF, user)
    ;(await settle(answered.id, user)).assertStatus(404)
  })

  test('reads in the history as one line, never the rules or the pages', async ({ assert }) => {
    const user = await User.create({
      email: 'prop-history@example.com',
      password: 'a-very-strong-passphrase',
    })
    const conversation = await AssistantConversation.create({ userId: user.id, title: 'Web' })
    const proposals: StoredProposals = {
      agentConfigId: 7,
      sources: SOURCES,
      ready: [{ slot: 'testing.levels', rule: 'unit', value: null, evidence: 'Write unit tests.' }],
      rules: [{ section: 'Workflow', text: 'Never push to main.' }],
      truncated: false,
      status: 'settled',
      added: 1,
    }
    await AssistantMessage.createMany([
      { conversationId: conversation.id, role: AssistantRole.User, content: 'Read the docs.' },
      { conversationId: conversation.id, role: AssistantRole.Assistant, content: '', proposals },
    ])

    const history = await conversationHistory(conversation)

    assert.deepEqual(history[1], {
      role: 'assistant',
      text: 'proposed from a web research (2 pages read): 1 ready-made rules and 1 other rules for agent conventions #7 (settled, 1 added)',
    })
    const text = JSON.stringify(history)
    assert.notInclude(text, 'Never push to main.')
    assert.notInclude(text, 'Write unit tests.')
    assert.notInclude(text, 'docs.example')
  })
})
