import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import type { LanguageModel, ProviderSettings } from '@coreloom-uml/llm'
import { APICallError, answeringModel, failingModel } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import { LLM_REQUESTS_PER_MINUTE } from '#app/llm/constants/llm'
import LanguageModels from '#app/llm/services/language-models'
import User from '#app/users/models/user'
import llmConfig from '#config/llm'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

const json = { accept: 'application/json' }
const Q = 'frontend-react'
/** The fixture key: it must never show up in a response, a log line or the database. */
const KEY = 'sk-fixture-4f1c2b9e-never-stored'
const OLLAMA = 'http://localhost:11434'

type Client = TestContext['client']

function makeUser() {
  return User.create({
    email: `llm-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

/** Every model the API builds during a test is this one; records what it was built with. */
function useModel(model: LanguageModel) {
  const built: { provider: ProviderSettings; apiKey: string }[] = []
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = (provider, apiKey) => {
      built.push({ provider, apiKey })
      return model
    }
    return fake
  })
  return built
}

function providerError(statusCode: number) {
  return new APICallError({
    message: `Provider refused key ${KEY}`,
    url: 'https://api.mistral.ai/v1/chat/completions',
    requestBodyValues: { apiKey: KEY },
    statusCode,
    responseHeaders: { 'x-api-key': KEY },
    responseBody: JSON.stringify({ error: { message: `invalid x-api-key ${KEY}` } }),
  })
}

const hosted = { kind: 'mistral', model: 'mistral-small-latest' }

async function createProject(client: Client, user: User) {
  const response = await client
    .post('/projects')
    .headers(json)
    .loginAs(user)
    .json({ name: 'Storefront', description: 'The online shop' })
  response.assertStatus(201)
  return response.body().project as { id: number }
}

/** A project with a frontend-react configuration and two answers, one with French notes. */
async function configuredProject(client: Client, user: User) {
  const project = await createProject(client, user)
  ;(
    await client
      .put(`/projects/${project.id}/agent-config`)
      .headers(json)
      .loginAs(user)
      .json({ questionnaires: [Q], targets: ['generic'] })
  ).assertStatus(201)
  ;(
    await client
      .put(`/projects/${project.id}/agent-config/answers`)
      .headers(json)
      .loginAs(user)
      .json({
        answers: [
          {
            questionnaireId: Q,
            questionId: 'ts-any',
            value: 5,
            details: 'Sauf dans les tests, où any est toléré pour les mocks.',
          },
          { questionnaireId: Q, questionId: 'styling', value: 'tailwind' },
        ],
      })
  ).assertStatus(200)
  return project
}

function propose(client: Client, user: User, projectId: number, body: Record<string, unknown>) {
  return client
    .post(`/projects/${projectId}/agent-config/proposals`)
    .headers(json)
    .loginAs(user)
    .json(body)
}

async function createToken(client: Client, user: User) {
  const response = await client
    .post('/account/api-tokens')
    .headers(json)
    .loginAs(user)
    .json({ name: 'CLI', abilities: ['read', 'write'], expiresInDays: 30 })
  response.assertStatus(201)
  return response.body().secret as string
}

const THREE_PROPOSALS = JSON.stringify({
  proposals: [
    {
      section: 'TypeScript',
      text: '`any` is tolerated in test mocks only.',
      basedOn: `${Q}/ts-any`,
    },
    { section: 'Security', text: 'Never log secrets.', basedOn: `${Q}/ts-any` },
    {
      section: 'TypeScript',
      text: 'Never use `any`; prefer `unknown` with narrowing or an explicit type.',
      basedOn: `${Q}/ts-any`,
    },
  ],
})

test.group('LLM - providers', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('lists every kind with its needs, model suggestions and the allowed origins', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const configured = llmConfig.allowedOrigins.splice(0, Infinity, OLLAMA)
    try {
      const response = await client.get('/llm/providers').headers(json).loginAs(user)

      response.assertStatus(200)
      const { providers, allowedBaseUrls } = response.body()
      assert.deepEqual(allowedBaseUrls, [OLLAMA])
      assert.deepEqual(
        providers.map((p: { kind: string }) => p.kind),
        ['anthropic', 'openai', 'mistral', 'ollama', 'openai-compatible'],
      )
      const byKind = new Map(providers.map((p: { kind: string }) => [p.kind, p]))
      assert.containsSubset(byKind.get('anthropic'), { requiresApiKey: true, takesBaseUrl: false })
      assert.containsSubset(byKind.get('ollama'), { requiresApiKey: false, takesBaseUrl: true })
      assert.isNotEmpty((byKind.get('mistral') as { models: string[] }).models)
      assert.deepEqual((byKind.get('openai-compatible') as { models: string[] }).models, [])
    } finally {
      llmConfig.allowedOrigins.splice(0, Infinity, ...configured)
    }
  })

  test('needs a session', async ({ client }) => {
    const response = await client.get('/llm/providers').headers(json)
    response.assertStatus(401)
  })
})

test.group('LLM - connection test', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('answers ok with the latency, and passes the key to the provider client only', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const built = useModel(answeringModel('OK'))

    const response = await client
      .post('/llm/test')
      .headers(json)
      .loginAs(user)
      .json({ provider: hosted, apiKey: KEY })

    response.assertStatus(200)
    assert.isTrue(response.body().ok)
    assert.isNumber(response.body().latencyMs)
    assert.deepEqual(built, [{ provider: { ...hosted }, apiKey: KEY }])
  })

  test('an invalid key gives unauthorized, without leaking it', async ({ client, assert }) => {
    const user = await makeUser()
    useModel(failingModel(providerError(401)))
    const logs = captureLogs()

    const response = await client
      .post('/llm/test')
      .headers(json)
      .loginAs(user)
      .json({ provider: hosted, apiKey: KEY })
    logs.restore()

    response.assertStatus(200)
    assert.deepEqual(response.body(), { ok: false, reason: 'unauthorized' })
    assert.notInclude(logs.lines.join('\n'), KEY)
    assert.isNotEmpty(logs.lines)
  })

  test('refuses a base URL outside the allowlist, or on a provider with a fixed URL', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const built = useModel(answeringModel('OK'))
    const send = (provider: Record<string, unknown>) =>
      client.post('/llm/test').headers(json).loginAs(user).json({ provider, apiKey: KEY })

    const empty = await send({ kind: 'ollama', model: 'qwen3', baseUrl: OLLAMA })
    empty.assertStatus(422)
    assert.match(empty.body().error.message, /allowlist/)

    const fixed = await send({ ...hosted, baseUrl: 'https://api.mistral.ai' })
    fixed.assertStatus(422)
    assert.match(fixed.body().error.message, /takes no base URL/)

    llmConfig.allowedOrigins.push(OLLAMA)
    try {
      ;(await send({ kind: 'ollama', model: 'qwen3', baseUrl: `${OLLAMA}/` })).assertStatus(200)
      ;(
        await send({ kind: 'ollama', model: 'qwen3', baseUrl: 'http://169.254.169.254' })
      ).assertStatus(422)
      ;(await send({ kind: 'openai-compatible', model: 'x' })).assertStatus(422)
    } finally {
      llmConfig.allowedOrigins.splice(0)
    }
    assert.lengthOf(built, 1)
  })

  test('a hosted provider needs a key; a local server does not', async ({ client }) => {
    const user = await makeUser()
    useModel(answeringModel('OK'))

    const withoutKey = await client
      .post('/llm/test')
      .headers(json)
      .loginAs(user)
      .json({ provider: hosted })
    withoutKey.assertStatus(422)

    llmConfig.allowedOrigins.push(OLLAMA)
    try {
      const local = await client
        .post('/llm/test')
        .headers(json)
        .loginAs(user)
        .json({ provider: { kind: 'ollama', model: 'qwen3', baseUrl: OLLAMA } })
      local.assertStatus(200)
    } finally {
      llmConfig.allowedOrigins.splice(0)
    }
  })

  test('validates the provider', async ({ client }) => {
    const user = await makeUser()
    const response = await client
      .post('/llm/test')
      .headers(json)
      .loginAs(user)
      .json({ provider: { kind: 'gemini', model: '' }, apiKey: KEY })
    response.assertStatus(422)
  })

  test('refuses an API key and an anonymous call', async ({ client }) => {
    const user = await makeUser()
    useModel(answeringModel('OK'))
    const secret = await createToken(client, user)

    const withToken = await client
      .post('/llm/test')
      .headers({ ...json, authorization: `Bearer ${secret}` })
      .json({ provider: hosted, apiKey: KEY })
    withToken.assertStatus(401)

    const anonymous = await client
      .post('/llm/test')
      .headers(json)
      .json({ provider: hosted, apiKey: KEY })
    anonymous.assertStatus(401)
  })

  test('allows 10 calls a minute per user', async ({ client }) => {
    const user = await makeUser()
    useModel(answeringModel('OK'))
    for (let call = 0; call < LLM_REQUESTS_PER_MINUTE; call++) {
      ;(
        await client
          .post('/llm/test')
          .headers(json)
          .loginAs(user)
          .json({ provider: hosted, apiKey: KEY })
      ).assertStatus(200)
    }
    const over = await client
      .post('/llm/test')
      .headers(json)
      .loginAs(user)
      .json({ provider: hosted, apiKey: KEY })
    over.assertStatus(429)

    const other = await makeUser()
    ;(
      await client
        .post('/llm/test')
        .headers(json)
        .loginAs(other)
        .json({ provider: hosted, apiKey: KEY })
    ).assertStatus(200)
  })
})

test.group('LLM - rule proposals', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('keeps the one valid proposal; accepting it adds an llm rule to the next generation', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    useModel(answeringModel(THREE_PROPOSALS))

    const response = await propose(client, user, project.id, { provider: hosted, apiKey: KEY })
    response.assertStatus(200)
    assert.deepEqual(response.body(), {
      proposals: [
        {
          section: 'TypeScript',
          text: '`any` is tolerated in test mocks only.',
          basedOn: `${Q}/ts-any`,
        },
      ],
      truncated: false,
    })

    // Nothing stored by the proposal itself.
    const config = await client
      .get(`/projects/${project.id}/agent-config`)
      .headers(json)
      .loginAs(user)
    assert.lengthOf(config.body().config.rules, 0)

    const [proposal] = response.body().proposals
    const accepted = await client
      .post(`/projects/${project.id}/agent-config/rules`)
      .headers(json)
      .loginAs(user)
      .json({ section: proposal.section, text: proposal.text, source: 'llm' })
    accepted.assertStatus(201)
    assert.equal(accepted.body().rule.source, 'llm')

    const generation = await client
      .post(`/projects/${project.id}/agent-config/generations`)
      .headers(json)
      .loginAs(user)
    generation.assertStatus(201)
    const agents = generation
      .body()
      .generation.files.find((file: { path: string }) => file.path === 'AGENTS.md')
    assert.include(agents.content, 'tolerated in test mocks only')
    assert.notInclude(agents.content, 'Sauf dans les tests')
  })

  test('sends the notes, never the key, to the model', async ({ client, assert }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    const model = answeringModel(JSON.stringify({ proposals: [] }))
    useModel(model)

    ;(await propose(client, user, project.id, { provider: hosted, apiKey: KEY })).assertStatus(200)

    assert.lengthOf(model.doGenerateCalls, 1)
    const prompt = JSON.stringify(model.doGenerateCalls[0])
    assert.include(prompt, 'Sauf dans les tests')
    assert.notInclude(prompt, KEY)
  })

  test('a provider failure answers 502 with its reason only, and the key is nowhere', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)

    for (const [status, reason] of [
      [401, 'unauthorized'],
      [500, 'unknown'],
    ] as const) {
      useModel(failingModel(providerError(status)))
      const logs = captureLogs()
      const response = await propose(client, user, project.id, {
        provider: hosted,
        apiKey: KEY,
      })
      logs.restore()

      response.assertStatus(502)
      assert.equal(response.body().reason, reason)
      assert.notInclude(JSON.stringify(response.body()), KEY)
      assert.notInclude(JSON.stringify(response.headers()), KEY)
      assert.notInclude(logs.lines.join('\n'), KEY)
      assert.isTrue(logs.lines.some((line) => line.includes(reason)))
    }

    assert.notInclude(await dumpDatabase(), KEY)
  })

  test('another account cannot ask for proposals on a project', async ({ client }) => {
    const owner = await makeUser()
    const project = await configuredProject(client, owner)
    const stranger = await makeUser()
    useModel(answeringModel(THREE_PROPOSALS))

    const response = await propose(client, stranger, project.id, {
      provider: hosted,
      apiKey: KEY,
    })
    response.assertStatus(404)
  })

  test('answers 404 when the project has no configuration', async ({ client }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    useModel(answeringModel(THREE_PROPOSALS))
    const response = await propose(client, user, project.id, { provider: hosted, apiKey: KEY })
    response.assertStatus(404)
  })

  test('refuses an API key', async ({ client }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    const secret = await createToken(client, user)
    useModel(answeringModel(THREE_PROPOSALS))

    const response = await client
      .post(`/projects/${project.id}/agent-config/proposals`)
      .headers({ ...json, authorization: `Bearer ${secret}` })
      .json({ provider: hosted, apiKey: KEY })
    response.assertStatus(401)
  })

  test('refuses a base URL outside the allowlist', async ({ client }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    const built = useModel(answeringModel(THREE_PROPOSALS))
    const response = await propose(client, user, project.id, {
      provider: { kind: 'openai-compatible', model: 'x', baseUrl: 'http://10.0.0.1:8080' },
    })
    response.assertStatus(422)
    if (built.length > 0) throw new Error('The model should not have been built')
  })
})
