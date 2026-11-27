import app from '@adonisjs/core/services/app'
import redis from '@adonisjs/redis/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { LanguageModel } from '@coreloom-uml/llm'
import { streaming, toolCallingModel } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import Architecture from '#app/architectures/models/architecture'
import type { ActionContext, ToolActivity } from '#app/assistant/actions/action'
import { actionTools } from '#app/assistant/actions/registry'
import { SEARCH_WEB } from '#app/assistant/actions/web-search-actions'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import { RepositorySession } from '#app/assistant/services/repository-session'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import { WEB_SEARCH_LIMITS } from '#app/web-search/constants/web-search'
import { searchCountKey } from '#app/web-search/services/search-for'
import WebSearch from '#app/web-search/services/web-search'
import { deleteWebSearch, saveWebSearch } from '#app/web-search/services/web-search-settings'
import { FakeWebSearch } from '#tests/helpers/fake-web-search'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'
import { saveTestLlmKey } from '#tests/helpers/llm-key'

/**
 * The workspace assistant searches the web through the instance's service. The search client is
 * a fake: no service is ever reached. The query and the results are never stored or logged.
 */

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const KEY = 'sk-fixture-web-search-actions-never-stored'
const provider = { kind: 'mistral', model: 'mistral-small-latest' }
/** Only this spec uses these: a row or a log line holding one leaked it. */
const QUERY = 'zebrafinch-websearch-query-7f3a'
const SNIPPET = 'quokka-websearch-snippet-91bd'
const RESULT = {
  title: 'Queues in AdonisJS',
  url: 'https://example.com/queues',
  snippet: SNIPPET,
  publishedAt: null,
}

function useModel(model: LanguageModel) {
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
}

const toolResults = (model: ReturnType<typeof toolCallingModel>) =>
  JSON.stringify(
    model.doGenerateCalls.flatMap((call) => call.prompt.filter((m) => m.role === 'tool')),
  )

const users: User[] = []

async function setup(flags: { webSearch: boolean } = { webSearch: true }) {
  const user = await User.create({
    email: `web-search-actions-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  users.push(user)
  await saveTestLlmKey(user)
  for (const key of [FeatureFlagKey.DiagramAssistant, FeatureFlagKey.AssistantActions]) {
    await updateFlag(key, ON, user)
  }
  if (flags.webSearch) await updateFlag(FeatureFlagKey.WebSearch, ON, user)
  const conversation = await AssistantConversation.create({ userId: user.id, title: '' })
  return { user, conversation, path: `/assistant/conversations/${conversation.id}` }
}

async function offered(user: User, conversationId: number): Promise<string[]> {
  const context: ActionContext = {
    conversationId,
    read: async () => '',
    repository: new RepositorySession(user, conversationId),
    web: { searches: 0 },
  }
  return (await actionTools(user, [], context)).map((tool) => tool.name)
}

let fake: FakeWebSearch

test.group('Assistant web search', (group) => {
  group.each.setup(async () => {
    const rollback = await withDefaultFlags()
    fake = new FakeWebSearch()
    fake.results = [RESULT]
    app.container.swap(WebSearch, () => fake)
    return async () => {
      app.container.restore(WebSearch)
      app.container.restore(LanguageModels)
      await deleteWebSearch()
      if (users.length > 0) await redis.del(...users.map((user) => searchCountKey(user.id)))
      users.length = 0
      await rollback()
    }
  })

  test('is offered only with the flag on and a service saved', async ({ assert }) => {
    const off = await setup({ webSearch: false })
    await saveWebSearch('linkup', 'linkup-key-0123456789-abcd')
    assert.notInclude(await offered(off.user, off.conversation.id), SEARCH_WEB)

    const on = await setup()
    await deleteWebSearch()
    assert.notInclude(await offered(on.user, on.conversation.id), SEARCH_WEB)
    await saveWebSearch('linkup', 'linkup-key-0123456789-abcd')
    assert.include(await offered(on.user, on.conversation.id), SEARCH_WEB)
  })

  test('a search shows its query live, answers the results and stores only a count', async ({
    client,
    assert,
  }) => {
    await saveWebSearch('linkup', 'linkup-key-0123456789-abcd')
    const f = await setup()
    const model = toolCallingModel([
      { calls: [{ tool: SEARCH_WEB, input: { query: `  ${QUERY}   one ` } }] },
      { calls: [{ tool: SEARCH_WEB, input: { query: `${QUERY} two` } }] },
      { text: 'Queues are covered at https://example.com/queues.' },
    ])
    useModel(streaming(model))

    const logs = captureLogs()
    const response = await client
      .post(`${f.path}/messages`)
      .headers({ ...json, accept: 'text/event-stream' })
      .loginAs(f.user)
      .json({ provider, apiKey: KEY, message: 'What is new?', locale: 'en', auto: true })
    logs.restore()
    response.assertStatus(200)

    assert.deepEqual(fake.queries, [`${QUERY} one`, `${QUERY} two`])
    assert.include(toolResults(model), SNIPPET)
    const activity = response
      .text()
      .split('\n\n')
      .map((frame) => frame.replace(/^data: /, ''))
      .filter((data) => data.startsWith('{'))
      .map((data) => JSON.parse(data) as { type: string; data?: ToolActivity })
      .filter((chunk) => chunk.type === 'data-activity')
      .map((chunk) => chunk.data as ToolActivity)
    assert.deepInclude(activity.at(-1), {
      tool: SEARCH_WEB,
      status: 'done',
      detail: `${QUERY} two`,
    })
    assert.isTrue(activity.some((step) => step.detail === `${QUERY} one`))
    // A result is never shown: only the query is.
    assert.notInclude(JSON.stringify(activity), SNIPPET)

    const stored = await AssistantMessage.query()
      .where('conversationId', f.conversation.id)
      .orderBy('id', 'asc')
    assert.isTrue(stored[1]?.content.endsWith('_Web searches: 2_'))
    const logged = logs.lines.join('\n')
    const database = await dumpDatabase()
    for (const secret of [QUERY, SNIPPET, KEY]) {
      assert.notInclude(logged, secret)
      assert.notInclude(database, secret)
    }
  })

  test('past the daily limit it answers the limit sentence', async ({ client, assert }) => {
    await saveWebSearch('linkup', 'linkup-key-0123456789-abcd')
    const f = await setup()
    await redis.set(searchCountKey(f.user.id), String(WEB_SEARCH_LIMITS.perAccountPerDay))
    const model = toolCallingModel([
      { calls: [{ tool: SEARCH_WEB, input: { query: 'adonis queues' } }] },
      { text: 'I could not search.' },
    ])
    useModel(model)
    const response = await client
      .post(`${f.path}/messages`)
      .headers(json)
      .loginAs(f.user)
      .json({ provider, apiKey: KEY, message: 'Search', locale: 'fr', auto: true })
    response.assertStatus(200)
    assert.include(toolResults(model), 'The daily limit of web searches is reached.')
    assert.lengthOf(fake.queries, 0)
    // Counted even when refused: the model asked for it.
    assert.include(response.body().messages[1].content, '_Recherches web : 1_')
  })

  test('the reading before a drawing never searches the web', async ({ client, assert }) => {
    await saveWebSearch('linkup', 'linkup-key-0123456789-abcd')
    const f = await setup()
    const project = await Project.create({ userId: f.user.id, name: 'Shop' })
    const architecture = await Architecture.create({
      userId: f.user.id,
      projectId: project.id,
      title: 'Shop API',
      visibility: 'private',
    })
    const reading = toolCallingModel([{ text: 'Nothing to add.' }])
    useModel(reading)
    const read = await client
      .post(
        `/architectures/${architecture.id}/assistant/conversations/${f.conversation.id}/readings`,
      )
      .headers(json)
      .loginAs(f.user)
      .json({ provider, apiKey: KEY, message: 'Draw the shop', locale: 'en' })
    read.assertStatus(200)
    const tools = reading.doGenerateCalls[0]?.tools?.map((tool) => tool.name) ?? []
    assert.include(tools, 'list_projects')
    assert.notInclude(tools, SEARCH_WEB)
  })
})
