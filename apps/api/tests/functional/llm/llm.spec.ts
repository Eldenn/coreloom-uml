import app from '@adonisjs/core/services/app'
import type { LanguageModel, LlmCredential, ProviderSettings } from '@coreloom-uml/llm'
import { APICallError, answeringModel, failingModel } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import { LLM_REQUESTS_PER_MINUTE } from '#app/llm/constants/llm'
import LanguageModels from '#app/llm/services/language-models'
import User from '#app/users/models/user'
import llmConfig from '#config/llm'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

const json = { accept: 'application/json' }
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
  const built: { provider: ProviderSettings; apiKey: LlmCredential }[] = []
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

/** A project with a configuration (`configId`) that holds two ready-made rules. */
async function configuredProject(client: Client, user: User) {
  const project = await createProject(client, user)
  const created = await client
    .post('/agent-configs')
    .headers(json)
    .loginAs(user)
    .json({ name: 'Storefront', projectId: project.id, targets: ['generic'] })
  created.assertStatus(201)
  const configId = created.body().config.id as number
  for (const [slot, rule] of [
    ['typescript.any', 'agree'],
    ['react.styling', 'tailwind'],
  ]) {
    ;(
      await client
        .put(`/agent-configs/${configId}/ready-rules/${slot}`)
        .headers(json)
        .loginAs(user)
        .json({ rules: [{ rule }] })
    ).assertStatus(200)
  }
  return { ...project, configId }
}

/** Reads pasted feedback unless the body says otherwise. */
function propose(client: Client, user: User, configId: number, body: Record<string, unknown>) {
  return client
    .post(`/agent-configs/${configId}/proposals`)
    .headers(json)
    .loginAs(user)
    .json({ from: 'feedback', feedback: 'No raw fetch in a component.', ...body })
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
      basedOn: 'feedback',
    },
    { section: 'Nowhere', text: 'Never log secrets.', basedOn: 'feedback' },
    {
      section: 'TypeScript',
      text: 'Never use `any`; prefer `unknown` with narrowing or an explicit type.',
      basedOn: 'feedback',
    },
  ],
})

/** An architecture of this project holding one class diagram written as Mermaid. */
async function projectDiagram(client: Client, user: User, projectId: number) {
  const architecture = await client
    .post('/architectures')
    .headers(json)
    .loginAs(user)
    .json({ title: 'Orders', projectId })
  architecture.assertStatus(201)
  const diagram = await client
    .post(`/architectures/${architecture.body().architecture.id}/diagrams`)
    .headers(json)
    .loginAs(user)
    .json({
      title: 'Order model',
      source: 'classDiagram\n  class Order\n  class Customer\n  Customer --> Order : places\n',
    })
  diagram.assertStatus(201)
  return diagram.body().diagram as { id: number }
}

test.group('LLM - providers', (group) => {
  group.each.setup(() => withDefaultFlags())

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
  group.each.setup(() => withDefaultFlags())
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
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('needs to be told what the model reads', async ({ client, assert }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    const model = answeringModel(THREE_PROPOSALS)
    useModel(model)

    for (const from of [undefined, 'answers']) {
      const response = await client
        .post(`/agent-configs/${project.configId}/proposals`)
        .headers(json)
        .loginAs(user)
        .json({ provider: hosted, apiKey: KEY, from, feedback: 'Anything.' })
      response.assertStatus(422)
    }
    assert.lengthOf(model.doGenerateCalls, 0)
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
      const response = await propose(client, user, project.configId, {
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

    const response = await propose(client, stranger, project.configId, {
      provider: hosted,
      apiKey: KEY,
    })
    response.assertStatus(404)
  })

  test('answers 404 for an unknown configuration', async ({ client }) => {
    const user = await makeUser()
    useModel(answeringModel(THREE_PROPOSALS))
    const response = await propose(client, user, 999_999, { provider: hosted, apiKey: KEY })
    response.assertStatus(404)
  })

  test('refuses an API key', async ({ client }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    const secret = await createToken(client, user)
    useModel(answeringModel(THREE_PROPOSALS))

    const response = await client
      .post(`/agent-configs/${project.configId}/proposals`)
      .headers({ ...json, authorization: `Bearer ${secret}` })
      .json({ provider: hosted, apiKey: KEY, from: 'feedback', feedback: 'Anything.' })
    response.assertStatus(401)
  })

  test('refuses a base URL outside the allowlist', async ({ client }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    const built = useModel(answeringModel(THREE_PROPOSALS))
    const response = await propose(client, user, project.configId, {
      provider: { kind: 'openai-compatible', model: 'x', baseUrl: 'http://10.0.0.1:8080' },
    })
    response.assertStatus(422)
    if (built.length > 0) throw new Error('The model should not have been built')
  })
})

test.group('LLM - rule proposals from diagrams', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('sends the diagrams as PlantUML and links each rule to its diagram', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    const diagram = await projectDiagram(client, user, project.id)
    const model = answeringModel(
      JSON.stringify({
        proposals: [
          {
            section: 'Architecture',
            text: 'An `Order` is always placed by one `Customer`.',
            basedOn: `diagram:${diagram.id}`,
          },
        ],
      }),
    )
    useModel(model)

    const response = await propose(client, user, project.configId, {
      provider: hosted,
      apiKey: KEY,
      from: 'diagrams',
    })
    response.assertStatus(200)
    assert.deepEqual(response.body(), {
      proposals: [
        {
          section: 'Architecture',
          text: 'An `Order` is always placed by one `Customer`.',
          basedOn: `diagram:${diagram.id}`,
        },
      ],
      truncated: false,
      skipped: [],
    })
    const config = await client
      .get(`/agent-configs/${project.configId}`)
      .headers(json)
      .loginAs(user)
    assert.deepEqual(config.body().config.diagrams, [
      { id: diagram.id, title: 'Order model', kind: 'class', architecture: 'Orders' },
    ])

    const prompt = JSON.stringify(model.doGenerateCalls[0])
    assert.include(prompt, '@startuml')
    assert.include(prompt, 'Customer')
    // What the ready-made rules already write is given as present.
    assert.include(prompt, 'Never use `any`; prefer `unknown`')
    assert.notInclude(prompt, KEY)
  })

  test('calls no model when the project has no diagram content', async ({ client, assert }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    const model = answeringModel(JSON.stringify({ proposals: [] }))
    useModel(model)

    const response = await propose(client, user, project.configId, {
      provider: hosted,
      apiKey: KEY,
      from: 'diagrams',
    })
    response.assertStatus(200)
    assert.deepEqual(response.body(), { proposals: [], truncated: false, skipped: [] })
    assert.lengthOf(model.doGenerateCalls, 0)
  })

  test('answers 404 for a diagram outside the project', async ({ client }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    const other = await createProject(client, user)
    const elsewhere = await projectDiagram(client, user, other.id)
    useModel(answeringModel(JSON.stringify({ proposals: [] })))

    const response = await propose(client, user, project.configId, {
      provider: hosted,
      apiKey: KEY,
      from: 'diagrams',
      diagramIds: [elsewhere.id],
    })
    response.assertStatus(404)
  })
})

test.group('LLM - rule proposals from review feedback', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  const FEEDBACK = 'Third time: no raw fetch in a component, go through the query hooks.'

  test('turns pasted feedback into new rules, accepted like any proposal', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    const rules = `/agent-configs/${project.configId}/rules`
    ;(
      await client
        .post(rules)
        .headers(json)
        .loginAs(user)
        .json({ section: 'Testing', text: 'Write a test for every bug fix.' })
    ).assertStatus(201)
    const model = answeringModel(
      JSON.stringify({
        proposals: [
          { section: 'Workflow', text: 'Never call `fetch` in a component.' },
          { section: 'Testing', text: 'write a test for every bug fix' },
          {
            section: 'TypeScript',
            text: 'Never use `any`; prefer `unknown` with narrowing or an explicit type.',
          },
          { section: 'Nowhere', text: 'Dropped.' },
        ],
      }),
    )
    useModel(model)
    const logs = captureLogs()

    const response = await propose(client, user, project.configId, {
      provider: hosted,
      apiKey: KEY,
      from: 'feedback',
      feedback: FEEDBACK,
    })
    logs.restore()
    response.assertStatus(200)
    assert.deepEqual(response.body(), {
      proposals: [
        { section: 'Workflow', text: 'Never call `fetch` in a component.', basedOn: null },
      ],
      truncated: false,
      skipped: [],
    })
    const prompt = JSON.stringify(model.doGenerateCalls[0])
    assert.include(prompt, FEEDBACK)
    assert.include(prompt, 'Write a test for every bug fix.')
    assert.include(prompt, 'Never use `any`; prefer `unknown`')
    assert.notInclude(prompt, KEY)
    // The pasted text is read once: neither logged nor stored.
    assert.notInclude(logs.lines.join('\n'), 'raw fetch')
    assert.notInclude(await dumpDatabase(), 'raw fetch')

    const before = (
      await client.get(`/agent-configs/${project.configId}`).headers(json).loginAs(user)
    ).body().config.revision as number
    const accepted = await client
      .post(rules)
      .headers(json)
      .loginAs(user)
      .json({ ...response.body().proposals[0], source: 'llm' })
    accepted.assertStatus(201)
    const after = (
      await client.get(`/agent-configs/${project.configId}`).headers(json).loginAs(user)
    ).body().config.revision as number
    assert.equal(after, before + 1)
  })

  test('refuses feedback as a source without any feedback', async ({ client, assert }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    const model = answeringModel(JSON.stringify({ proposals: [] }))
    useModel(model)

    for (const feedback of [undefined, '   ']) {
      const response = await propose(client, user, project.configId, {
        provider: hosted,
        apiKey: KEY,
        from: 'feedback',
        feedback,
      })
      response.assertStatus(422)
    }
    assert.lengthOf(model.doGenerateCalls, 0)
  })
})

function importFile(client: Client, user: User, configId: number, content: string) {
  return client
    .post(`/agent-configs/${configId}/imports`)
    .headers(json)
    .loginAs(user)
    .json({ provider: hosted, apiKey: KEY, content })
}

const picked = (slot: string, rule: string, value: string | null, evidence: string) => ({
  slot,
  rule,
  value,
  evidence,
})

const IMPORTED = JSON.stringify({
  ready: [
    picked('testing.levels', 'unit', null, 'Write unit and e2e tests.'),
    picked('testing.levels', 'e2e', null, 'Write unit and e2e tests.'),
    picked('react.styling', 'tailwind', null, 'Tailwind only: held already.'),
    picked('typescript.any', 'sometimes', null, 'Not a rule of the group.'),
    picked('typescript.any', 'disagree', null, 'any is fine at the edges.'),
    picked('tooling.checks', 'run', 'pnpm lint && pnpm test', 'Run pnpm lint && pnpm test.'),
    picked('tooling.package-manager', 'pnpm', 'pnpm', 'A text on a rule that takes none.'),
    picked('no.such-slot', 'agree', null, 'Unknown group.'),
  ],
  rules: [
    { section: 'Workflow', text: 'Never push to main.' },
    { section: 'Nowhere', text: 'Dropped.' },
    { section: 'Testing', text: 'Add or update unit tests for every change in logic.' },
  ],
})

test.group('LLM - conventions file import', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('proposes the ready-made rules that fit and the other rules, and stores nothing', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    const model = answeringModel(IMPORTED)
    useModel(model)

    const response = await importFile(client, user, project.configId, '# Rules\n\nTailwind only.')
    response.assertStatus(200)
    assert.deepEqual(response.body(), {
      ready: [
        picked('testing.levels', 'unit', null, 'Write unit and e2e tests.'),
        picked('testing.levels', 'e2e', null, 'Write unit and e2e tests.'),
        picked('typescript.any', 'disagree', null, 'any is fine at the edges.'),
        picked('tooling.checks', 'run', 'pnpm lint && pnpm test', 'Run pnpm lint && pnpm test.'),
      ],
      rules: [{ section: 'Workflow', text: 'Never push to main.' }],
      truncated: false,
    })
    const prompt = JSON.stringify(model.doGenerateCalls[0])
    assert.include(prompt, 'Tailwind only.')
    // Groups and rules of every pack, and what the configuration already writes.
    assert.include(prompt, 'testing.levels (many): ')
    assert.include(prompt, 'git.commit-messages (one): ')
    assert.include(prompt, 'Style with Tailwind utility classes')
    assert.notInclude(prompt, KEY)

    const config = await client
      .get(`/agent-configs/${project.configId}`)
      .headers(json)
      .loginAs(user)
    assert.lengthOf(config.body().config.readyRules, 2)
    assert.lengthOf(config.body().config.rules, 0)
  })

  test('leaves the managed block out of what the model reads', async ({ client, assert }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    const model = answeringModel(JSON.stringify({ ready: [], rules: [] }))
    useModel(model)

    const content = [
      'Hand-written line.',
      '<!-- coreloom-uml:begin · managed block, edits inside it are replaced on the next pull -->',
      'Generated line.',
      '<!-- coreloom-uml:end -->',
    ].join('\n')
    ;(await importFile(client, user, project.configId, content)).assertStatus(200)
    const prompt = JSON.stringify(model.doGenerateCalls[0])
    assert.include(prompt, 'Hand-written line.')
    assert.notInclude(prompt, 'Generated line.')
  })

  test('refuses a file past the limit', async ({ client }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    useModel(answeringModel(IMPORTED))
    ;(await importFile(client, user, project.configId, 'x'.repeat(50_001))).assertStatus(422)
  })

  test('a provider failure answers 502 with its reason, and the file is not logged', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    useModel(failingModel(providerError(401)))
    const logs = captureLogs()
    const response = await importFile(
      client,
      user,
      project.configId,
      'Secret project codename Zephyr.',
    )
    logs.restore()

    response.assertStatus(502)
    assert.equal(response.body().reason, 'unauthorized')
    assert.notInclude(logs.lines.join('\n'), 'Zephyr')
    assert.notInclude(logs.lines.join('\n'), KEY)
  })

  test('logs counts only, never the file or what was proposed', async ({ client, assert }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    useModel(answeringModel(IMPORTED))
    const logs = captureLogs()
    ;(
      await importFile(client, user, project.configId, 'Secret project codename Zephyr.')
    ).assertStatus(200)
    logs.restore()

    const lines = logs.lines.join('\n')
    assert.include(lines, '"ready":4')
    assert.notInclude(lines, 'Zephyr')
    assert.notInclude(lines, 'pnpm lint')
  })

  test('reads the notes of a web research as notes, not as the file', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    const model = answeringModel(IMPORTED)
    useModel(model)

    const response = await client
      .post(`/agent-configs/${project.configId}/imports`)
      .headers(json)
      .loginAs(user)
      .json({ provider: hosted, apiKey: KEY, content: 'Use pnpm (a.example).', origin: 'research' })

    response.assertStatus(200)
    assert.properties(response.body(), ['ready', 'rules', 'truncated'])
    const prompt = JSON.stringify(model.doGenerateCalls[0])
    assert.include(prompt, '<notes>')
    assert.notInclude(prompt, '<file>')
  })

  test('refuses an unknown origin', async ({ client }) => {
    const user = await makeUser()
    const project = await configuredProject(client, user)
    useModel(answeringModel(IMPORTED))

    const response = await client
      .post(`/agent-configs/${project.configId}/imports`)
      .headers(json)
      .loginAs(user)
      .json({ provider: hosted, apiKey: KEY, content: 'Anything.', origin: 'other' })
    response.assertStatus(422)
  })

  test('another account cannot import into a project', async ({ client }) => {
    const owner = await makeUser()
    const project = await configuredProject(client, owner)
    const stranger = await makeUser()
    useModel(answeringModel(IMPORTED))
    ;(await importFile(client, stranger, project.configId, 'Anything.')).assertStatus(404)
  })
})
