import app from '@adonisjs/core/services/app'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { LanguageModel } from '@coreloom-uml/llm'
import { APICallError, failingModel, MockLanguageModelV4 } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import { AssistantRole } from '#app/assistant/constants/assistant'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const OFF = { enabled: false, rollout: 0, rules: [] }
/** The fixture key: it must never show up in a response, a log line or the database. */
const KEY = 'sk-fixture-chat-never-stored'
const chat = {
  provider: { kind: 'mistral', model: 'mistral-small-latest' },
  apiKey: KEY,
  message: 'What can you do for me?',
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

async function setup(email: string) {
  const user = await User.create({ email, password: 'a-very-strong-passphrase' })
  await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
  const conversation = await AssistantConversation.create({ userId: user.id, title: '' })
  return { user, conversation, path: `/assistant/conversations/${conversation.id}/messages` }
}

const stored = (conversationId: number) =>
  AssistantMessage.query().where('conversationId', conversationId).orderBy('id', 'asc')

test.group('Assistant - messages about no architecture', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('answers from the history and stores the exchange', async ({ client, assert }) => {
    const { user, conversation, path } = await setup('chat-store@example.com')
    await AssistantMessage.create({
      conversationId: conversation.id,
      role: AssistantRole.Summary,
      content: 'Earlier: the owner works on Zephyr.',
    })
    const { model, prompts } = recordingModel('  Pick an architecture to work on diagrams.  ')
    useModel(model)

    const response = await client.post(path).headers(json).loginAs(user).json(chat)

    response.assertStatus(200)
    assert.deepEqual(
      response
        .body()
        .messages.map((message: { role: string; content: string; architectureId: null }) => [
          message.role,
          message.content,
          message.architectureId,
        ]),
      [
        ['user', 'What can you do for me?', null],
        ['assistant', 'Pick an architecture to work on diagrams.', null],
      ],
    )
    assert.lengthOf(prompts, 1)
    assert.include(prompts[0], 'Zephyr')
    assert.include(prompts[0], 'What can you do for me?')
    assert.notInclude(JSON.stringify(response.body()), KEY)
    assert.lengthOf(await stored(conversation.id), 3)
    await conversation.refresh()
    assert.equal(conversation.title, 'What can you do for me?')
  })

  test('a blank answer is a failed call: nothing is stored', async ({ client, assert }) => {
    const { user, conversation, path } = await setup('chat-blank@example.com')
    useModel(recordingModel('   ').model)

    const response = await client.post(path).headers(json).loginAs(user).json(chat)

    response.assertStatus(502)
    assert.equal(response.body().reason, 'unknown')
    assert.lengthOf(await stored(conversation.id), 0)
  })

  test('a failed call stores nothing and leaks no key', async ({ client, assert }) => {
    const { user, conversation, path } = await setup('chat-502@example.com')
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

    const response = await client.post(path).headers(json).loginAs(user).json(chat)
    logs.restore()

    response.assertStatus(502)
    assert.equal(response.body().reason, 'unauthorized')
    assert.notInclude(JSON.stringify(response.body()), KEY)
    assert.notInclude(logs.lines.join('\n'), KEY)
    assert.lengthOf(await stored(conversation.id), 0)
    await conversation.refresh()
    assert.equal(conversation.title, '')
    assert.notInclude(await dumpDatabase(), KEY)
  })

  test('a history too long is a 422 without a model call', async ({ client, assert }) => {
    const { user, conversation, path } = await setup('chat-full@example.com')
    await AssistantMessage.create({
      conversationId: conversation.id,
      role: AssistantRole.User,
      content: 'x'.repeat(130_000),
    })
    const { model, prompts } = recordingModel('never')
    useModel(model)

    const response = await client.post(path).headers(json).loginAs(user).json(chat)

    response.assertStatus(422)
    assert.equal(response.body().error.code, 'context_full')
    assert.lengthOf(prompts, 0)
    assert.lengthOf(await stored(conversation.id), 1)
  })

  test("404 for another account's conversation, while the flag is off, and 422 on input", async ({
    client,
    assert,
  }) => {
    const { user, path } = await setup('chat-404@example.com')
    const { user: other } = await setup('chat-404-other@example.com')
    const { model, prompts } = recordingModel('never')
    useModel(model)

    ;(await client.post(path).headers(json).loginAs(other).json(chat)).assertStatus(404)
    ;(
      await client
        .post(path)
        .headers(json)
        .loginAs(user)
        .json({ ...chat, message: '  ' })
    ).assertStatus(422)
    ;(
      await client
        .post(path)
        .headers(json)
        .loginAs(user)
        .json({ ...chat, locale: 'de' })
    ).assertStatus(422)
    await updateFlag(FeatureFlagKey.DiagramAssistant, OFF, user)
    ;(await client.post(path).headers(json).loginAs(user).json(chat)).assertStatus(404)
    assert.lengthOf(prompts, 0)
  })

  test('refuses an API token (401)', async ({ client }) => {
    const { user, path } = await setup('chat-token@example.com')
    const token = await User.accessTokens.create(user, ['read', 'write'], { name: 'ci' })
    const response = await client
      .post(path)
      .headers({ ...json, authorization: `Bearer ${token.value?.release()}` })
      .json(chat)
    response.assertStatus(401)
  })
})
