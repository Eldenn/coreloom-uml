import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import type { LanguageModel } from '@coreloom-uml/llm'
import { APICallError, answeringModel, failingModel } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import LanguageModels from '#app/llm/services/language-models'
import { storedApiKey } from '#app/llm-connections/services/llm-api-keys'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

const json = { accept: 'application/json' }
/** The fixture key: it must never show up in a response, a log line or the database. */
const KEY = 'sk-llm-fixture-key-123456'
const hosted = { kind: 'mistral', model: 'mistral-small-latest' }

function makeUser() {
  return User.create({
    email: `keys-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

/** Every model the API builds during a test is this one; records what it was built with. */
function useModel(model: LanguageModel) {
  const built: { provider: unknown; credential: unknown }[] = []
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = (provider, credential) => {
      built.push({ provider, credential })
      return model
    }
    return fake
  })
  return built
}

test.group('LLM - saved api keys', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('saves a key after a successful test call, encrypted, and answers its hint only', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    useModel(answeringModel('OK'))
    const logs = captureLogs()

    const response = await client
      .put('/llm/api-keys/mistral')
      .headers(json)
      .loginAs(user)
      .json({ apiKey: KEY })
    logs.restore()

    response.assertStatus(200)
    const saved = response.body()
    assert.equal(saved.kind, 'mistral')
    assert.equal(saved.keyHint, '3456')
    assert.isNull(saved.baseUrl)
    assert.isString(saved.verifiedAt)
    assert.notInclude(JSON.stringify(saved), KEY)

    const raw = await db.from('llm_api_keys').where('user_id', user.id).firstOrFail()
    assert.notInclude(raw.api_key, KEY)
    assert.equal(raw.key_hint, '3456')
    assert.notInclude(logs.lines.join('\n'), KEY)

    const stored = await storedApiKey(user, 'mistral')
    assert.equal(stored?.apiKey, KEY)
    assert.isNull(stored?.baseUrl)
  })

  test('a key the provider refuses is not saved', async ({ client, assert }) => {
    const user = await makeUser()
    useModel(
      failingModel(
        new APICallError({
          message: 'invalid key',
          url: 'https://api.mistral.ai/v1/chat/completions',
          requestBodyValues: {},
          statusCode: 401,
          responseHeaders: {},
          responseBody: '{}',
        }),
      ),
    )

    const response = await client
      .put('/llm/api-keys/mistral')
      .headers(json)
      .loginAs(user)
      .json({ apiKey: KEY })
    response.assertStatus(502)
    assert.equal(response.body().reason, 'unauthorized')
    assert.isNull(await db.from('llm_api_keys').where('user_id', user.id).first())
  })

  test('refuses a subscription kind and a key that cannot be stored', async ({ client }) => {
    const user = await makeUser()
    useModel(answeringModel('OK'))

    const subscription = await client
      .put('/llm/api-keys/openai-codex')
      .headers(json)
      .loginAs(user)
      .json({ apiKey: KEY })
    subscription.assertStatus(422)

    const multiline = await client
      .put('/llm/api-keys/mistral')
      .headers(json)
      .loginAs(user)
      .json({ apiKey: `short ${'x'.repeat(200)}\nsecond-line` })
    multiline.assertStatus(422)

    const unknown = await client
      .put('/llm/api-keys/gemini')
      .headers(json)
      .loginAs(user)
      .json({ apiKey: KEY })
    unknown.assertStatus(422)
  })

  test('replaces the key of a kind with one saved key per kind', async ({ client, assert }) => {
    const user = await makeUser()
    useModel(answeringModel('OK'))

    await client.put('/llm/api-keys/mistral').headers(json).loginAs(user).json({ apiKey: KEY })
    const response = await client
      .put('/llm/api-keys/mistral')
      .headers(json)
      .loginAs(user)
      .json({ apiKey: `${KEY}-new` })
    response.assertStatus(200)

    const rows = await db.from('llm_api_keys').where('user_id', user.id)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].key_hint, '-new')
  })

  test('deleting drops the key, and one account cannot reach another', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const other = await makeUser()
    useModel(answeringModel('OK'))
    await client.put('/llm/api-keys/mistral').headers(json).loginAs(user).json({ apiKey: KEY })

    const stranger = await client.delete('/llm/api-keys/mistral').headers(json).loginAs(other)
    stranger.assertStatus(204)
    assert.isNotNull(await storedApiKey(user, 'mistral'))

    const owner = await client.delete('/llm/api-keys/mistral').headers(json).loginAs(user)
    owner.assertStatus(204)
    assert.isNull(await storedApiKey(user, 'mistral'))
  })

  test('needs a session', async ({ client }) => {
    useModel(answeringModel('OK'))
    const put = await client.put('/llm/api-keys/mistral').headers(json).json({ apiKey: KEY })
    put.assertStatus(401)
    const remove = await client.delete('/llm/api-keys/mistral').headers(json)
    remove.assertStatus(401)
  })

  test('a call uses the saved key, even with a different key in the body', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const built = useModel(answeringModel('OK'))
    await client.put('/llm/api-keys/mistral').headers(json).loginAs(user).json({ apiKey: KEY })

    const response = await client
      .post('/llm/test')
      .headers(json)
      .loginAs(user)
      .json({ provider: hosted, apiKey: 'sk-other-key-in-the-body' })
    response.assertStatus(200)
    assert.isTrue(response.body().ok)
    assert.equal(built[0]?.credential, KEY)

    // The saved key is nowhere: logs, responses, database.
    assert.notInclude(await dumpDatabase(), KEY)
  })

  test('a saved key lets a call through without one in the body', async ({ client, assert }) => {
    const user = await makeUser()
    const built = useModel(answeringModel('OK'))
    await client.put('/llm/api-keys/mistral').headers(json).loginAs(user).json({ apiKey: KEY })

    const response = await client
      .post('/llm/test')
      .headers(json)
      .loginAs(user)
      .json({ provider: hosted })
    response.assertStatus(200)
    assert.isTrue(response.body().ok)
    assert.equal(built[0]?.credential, KEY)
  })

  test('an undecryptable row reads as no key saved', async ({ client, assert }) => {
    const user = await makeUser()
    useModel(answeringModel('OK'))
    await client.put('/llm/api-keys/mistral').headers(json).loginAs(user).json({ apiKey: KEY })
    await db
      .from('llm_api_keys')
      .where('user_id', user.id)
      .update({ api_key: 'sealed-with-another-key' })

    assert.isNull(await storedApiKey(user, 'mistral'))

    const response = await client
      .post('/llm/test')
      .headers(json)
      .loginAs(user)
      .json({ provider: hosted, apiKey: KEY })
    response.assertStatus(200)
  })

  test('GET /llm/providers answers the hint, origin and date of a saved key', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    useModel(answeringModel('OK'))
    await client.put('/llm/api-keys/mistral').headers(json).loginAs(user).json({ apiKey: KEY })

    const response = await client.get('/llm/providers').headers(json).loginAs(user)
    response.assertStatus(200)
    const byKind = new Map(
      (response.body().providers as { kind: string; verifiedAt: string | null }[]).map((p) => [
        p.kind,
        p,
      ]),
    )
    assert.containsSubset(byKind.get('mistral'), {
      connected: true,
      keyHint: '3456',
      baseUrl: null,
    })
    assert.isNotNull(byKind.get('mistral')?.verifiedAt)
    assert.containsSubset(byKind.get('anthropic'), {
      connected: false,
      keyHint: null,
      verifiedAt: null,
    })
    assert.notInclude(JSON.stringify(response.body()), KEY)
  })
})
