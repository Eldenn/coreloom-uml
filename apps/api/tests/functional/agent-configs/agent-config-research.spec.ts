import app from '@adonisjs/core/services/app'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import {
  type LanguageModel,
  LlmCallError,
  type ResearchPage,
  type ResearchTools,
} from '@coreloom-uml/llm'
import { type ModelStep, toolCallingModel } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import type { ResearchConfig } from '#app/research/services/research-config'
import { acquireResearch, releaseResearch } from '#app/research/services/research-lock'
import ResearchSandbox from '#app/research/services/research-sandbox'
import User from '#app/users/models/user'
import env from '#start/env'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

const json = { accept: 'application/json' }
/** Fixture secrets: neither may show up in a response, a log line or the database. */
const KEY = 'sk-fixture-7a2d-never-stored'
const E2B_KEY = 'e2b_fixture_never_logged'
const hosted = { kind: 'mistral', model: 'mistral-small-latest' }
const PAGE_URL = 'https://docs.example/conventions'
const PAGE: ResearchPage = { title: 'Conventions', text: 'Codename Zephyr: use pnpm.', links: [] }

type Client = TestContext['client']

function makeUser() {
  return User.create({
    email: `research-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

function useModel(model: LanguageModel) {
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
}

/** Every sandbox opened during a test is this one; records what happened to it. */
function useSandbox(options: { fails?: boolean; breaks?: boolean } = {}) {
  const seen = { opened: [] as ResearchConfig[], closed: 0, read: [] as string[] }
  const tools: ResearchTools = {
    async readPage(url) {
      seen.read.push(url)
      return url === PAGE_URL ? PAGE : null
    },
    async run() {
      return { exitCode: 0, output: '' }
    },
  }
  app.container.swap(ResearchSandbox, () => {
    const fake = new ResearchSandbox()
    fake.open = async (config) => {
      seen.opened.push(config)
      if (options.fails) throw new LlmCallError('sandbox_unavailable')
      if (options.breaks) throw new TypeError('A bug, not a provider failure')
      return {
        tools,
        async close() {
          seen.closed++
        },
      }
    }
    return fake
  })
  return seen
}

const READS_THE_PAGE: ModelStep[] = [
  { calls: [{ tool: 'read_page', input: { url: PAGE_URL } }] },
  { text: `Use pnpm (${PAGE_URL}).` },
]

async function makeConfig(client: Client, user: User) {
  const created = await client
    .post('/agent-configs')
    .headers(json)
    .loginAs(user)
    .json({ name: 'Storefront', targets: ['generic'] })
  created.assertStatus(201)
  return created.body().config.id as number
}

async function turnOn(user: User) {
  await updateFlag(FeatureFlagKey.WebResearch, { enabled: true, rollout: 100, rules: [] }, user)
  env.set('E2B_API_KEY' as never, E2B_KEY as never)
}

function research(
  client: Client,
  user: User,
  configId: number,
  body: Record<string, unknown> = {},
) {
  return client
    .post(`/agent-configs/${configId}/research`)
    .headers(json)
    .loginAs(user)
    .json({ provider: hosted, apiKey: KEY, request: `Conventions of ${PAGE_URL}`, ...body })
}

test.group('Agent configs - web research', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => {
    app.container.restore(LanguageModels)
    app.container.restore(ResearchSandbox)
    env.set('E2B_API_KEY' as never, '' as never)
    env.set('E2B_API_URL' as never, '' as never)
    env.set('E2B_SANDBOX_URL' as never, '' as never)
  })

  test('answers the findings and the pages read, and closes the sandbox', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const configId = await makeConfig(client, user)
    await turnOn(user)
    env.set('E2B_API_URL' as never, 'http://localhost:3000' as never)
    env.set('E2B_SANDBOX_URL' as never, 'http://localhost:3002' as never)
    useModel(toolCallingModel(READS_THE_PAGE))
    const sandbox = useSandbox()

    const response = await research(client, user, configId)

    response.assertStatus(200)
    assert.deepEqual(response.body(), {
      findings: `Use pnpm (${PAGE_URL}).`,
      sources: [{ url: PAGE_URL, title: 'Conventions' }],
    })
    assert.deepEqual(sandbox.opened, [
      {
        e2bApiKey: E2B_KEY,
        e2bApiUrl: 'http://localhost:3000',
        e2bSandboxUrl: 'http://localhost:3002',
      },
    ])
    assert.equal(sandbox.closed, 1)
    // The slot is free again.
    assert.isTrue(await acquireResearch(user.id))
    await releaseResearch(user.id)
  })

  test('stores and logs nothing of the request, the pages or the keys', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const configId = await makeConfig(client, user)
    await turnOn(user)
    useModel(toolCallingModel(READS_THE_PAGE))
    useSandbox()
    const logs = captureLogs()

    ;(await research(client, user, configId)).assertStatus(200)
    logs.restore()

    const lines = logs.lines.join('\n')
    assert.include(lines, '"sources":1')
    for (const secret of [KEY, E2B_KEY, 'Zephyr', 'docs.example', 'Use pnpm']) {
      assert.notInclude(lines, secret)
    }
    const database = await dumpDatabase()
    for (const secret of [KEY, E2B_KEY, 'Zephyr', 'docs.example']) {
      assert.notInclude(database, secret)
    }
  })

  test('answers 404 while the flag is off', async ({ client, assert }) => {
    const user = await makeUser()
    const configId = await makeConfig(client, user)
    env.set('E2B_API_KEY' as never, E2B_KEY as never)
    const sandbox = useSandbox()

    ;(await research(client, user, configId)).assertStatus(404)
    assert.lengthOf(sandbox.opened, 0)
  })

  test('answers 404 without an E2B key on the server', async ({ client, assert }) => {
    const user = await makeUser()
    const configId = await makeConfig(client, user)
    await turnOn(user)
    env.set('E2B_API_KEY' as never, '' as never)
    const sandbox = useSandbox()

    ;(await research(client, user, configId)).assertStatus(404)
    assert.lengthOf(sandbox.opened, 0)
  })

  test("answers 404 for another account's configuration", async ({ client, assert }) => {
    const owner = await makeUser()
    const configId = await makeConfig(client, owner)
    const stranger = await makeUser()
    await turnOn(stranger)
    const sandbox = useSandbox()

    ;(await research(client, stranger, configId)).assertStatus(404)
    assert.lengthOf(sandbox.opened, 0)
  })

  test('refuses an API token', async ({ client }) => {
    const user = await makeUser()
    const configId = await makeConfig(client, user)
    await turnOn(user)
    const token = await client
      .post('/account/api-tokens')
      .headers(json)
      .loginAs(user)
      .json({ name: 'CLI', abilities: ['read', 'write'], expiresInDays: 30 })
    token.assertStatus(201)

    const response = await client
      .post(`/agent-configs/${configId}/research`)
      .headers({ ...json, authorization: `Bearer ${token.body().secret}` })
      .json({ provider: hosted, apiKey: KEY, request: 'Anything.' })
    response.assertStatus(401)
  })

  test('refuses the Claude subscription, which cannot call tools', async ({ client, assert }) => {
    const user = await makeUser()
    const configId = await makeConfig(client, user)
    await turnOn(user)
    const sandbox = useSandbox()

    const response = await research(client, user, configId, {
      provider: { kind: 'claude-code', model: 'sonnet' },
      apiKey: null,
    })

    response.assertStatus(422)
    assert.include(response.body().error.message, 'API key')
    assert.lengthOf(sandbox.opened, 0)
  })

  test('refuses the ChatGPT subscription until it is known to call tools', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const configId = await makeConfig(client, user)
    await turnOn(user)
    const sandbox = useSandbox()

    const response = await research(client, user, configId, {
      provider: { kind: 'openai-codex', model: 'gpt-5' },
      apiKey: null,
    })

    response.assertStatus(422)
    assert.include(response.body().error.message, 'API key')
    assert.lengthOf(sandbox.opened, 0)
  })

  test('an unexpected failure still frees the slot', async ({ client, assert }) => {
    const user = await makeUser()
    const configId = await makeConfig(client, user)
    await turnOn(user)
    useModel(toolCallingModel(READS_THE_PAGE))
    const sandbox = useSandbox({ breaks: true })

    const response = await research(client, user, configId)

    response.assertStatus(500)
    assert.lengthOf(sandbox.opened, 1)
    assert.isTrue(await acquireResearch(user.id))
    await releaseResearch(user.id)
  })

  test('validates the request', async ({ client }) => {
    const user = await makeUser()
    const configId = await makeConfig(client, user)
    await turnOn(user)
    useSandbox()

    ;(await research(client, user, configId, { request: 'x'.repeat(2001) })).assertStatus(422)
    ;(await research(client, user, configId, { request: '   ' })).assertStatus(422)
  })

  test('answers 409 while a research of the account is running', async ({ client, assert }) => {
    const user = await makeUser()
    const configId = await makeConfig(client, user)
    await turnOn(user)
    useModel(toolCallingModel(READS_THE_PAGE))
    const sandbox = useSandbox()
    assert.isTrue(await acquireResearch(user.id))

    const response = await research(client, user, configId)
    // Released here, not by the refused call: the running research still holds its slot.
    const stillHeld = !(await acquireResearch(user.id))
    await releaseResearch(user.id)

    response.assertStatus(409)
    assert.isTrue(stillHeld)
    assert.lengthOf(sandbox.opened, 0)
  })

  test('a sandbox that cannot start answers 502 and frees the slot', async ({ client, assert }) => {
    const user = await makeUser()
    const configId = await makeConfig(client, user)
    await turnOn(user)
    useModel(toolCallingModel(READS_THE_PAGE))
    useSandbox({ fails: true })

    const response = await research(client, user, configId)

    response.assertStatus(502)
    assert.equal(response.body().reason, 'sandbox_unavailable')
    assert.isTrue(await acquireResearch(user.id))
    await releaseResearch(user.id)
  })

  test('a model that reads nothing answers 502, closes the sandbox and frees the slot', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const configId = await makeConfig(client, user)
    await turnOn(user)
    useModel(toolCallingModel([{ text: 'From memory: write tests.' }]))
    const sandbox = useSandbox()

    const response = await research(client, user, configId, { request: 'Good practices?' })

    response.assertStatus(502)
    assert.equal(response.body().reason, 'tools_unused')
    assert.equal(sandbox.closed, 1)
    assert.isTrue(await acquireResearch(user.id))
    await releaseResearch(user.id)
  })
})
