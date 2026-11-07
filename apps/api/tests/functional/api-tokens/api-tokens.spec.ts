import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import { DateTime } from 'luxon'
import {
  API_TOKEN_PREFIX,
  API_TOKEN_REQUESTS_PER_MINUTE,
  API_TOKENS_PER_USER_MAX,
} from '#app/api-tokens/constants/api-token'
import ApiToken from '#app/api-tokens/models/api-token'
import type { CreatedApiTokenOutput } from '#app/api-tokens/validators/api-tokens-output'
import User from '#app/users/models/user'

const json = { accept: 'application/json' }

function makeUser() {
  return User.create({
    email: `tokens-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

async function createToken(
  client: TestContext['client'],
  user: User,
  body: Record<string, unknown> = {},
) {
  const response = await client
    .post('/account/api-tokens')
    .headers(json)
    .loginAs(user)
    .json({ name: 'CI', abilities: ['read', 'write'], expiresInDays: 30, ...body })
  response.assertStatus(201)
  return response.body() as CreatedApiTokenOutput
}

function bearer(secret: string) {
  return { ...json, authorization: `Bearer ${secret}` }
}

test.group('API tokens - management', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates a token and shows its secret once', async ({ client, assert }) => {
    const user = await makeUser()

    const { token, secret } = await createToken(client, user, { abilities: ['read'] })

    assert.isTrue(secret.startsWith(API_TOKEN_PREFIX))
    assert.containsSubset(token, {
      name: 'CI',
      prefix: API_TOKEN_PREFIX,
      hint: secret.slice(-4),
      abilities: ['read'],
      lastUsedAt: null,
    })
    const list = await client.get('/account/api-tokens').headers(json).loginAs(user)
    list.assertStatus(200)
    assert.lengthOf(list.body().data, 1)
    assert.notProperty(list.body().data[0], 'secret')
    assert.notInclude(JSON.stringify(list.body()), secret)
  })

  test('sets the expiry, or none', async ({ client, assert }) => {
    const user = await makeUser()

    const { token } = await createToken(client, user, { expiresInDays: 30 })
    const never = await createToken(client, user, { expiresInDays: null })

    const expiresAt = DateTime.fromISO(token.expiresAt ?? '')
    assert.closeTo(expiresAt.diffNow('days').days, 30, 0.01)
    assert.isNull(never.token.expiresAt)
  })

  test('rejects a missing name, no ability or an unknown one', async ({ client }) => {
    const user = await makeUser()

    for (const body of [
      { name: '', abilities: ['read'], expiresInDays: 30 },
      { name: 'x', abilities: [], expiresInDays: 30 },
      { name: 'x', abilities: ['admin'], expiresInDays: 30 },
      { name: 'x', abilities: ['read'], expiresInDays: 400 },
    ]) {
      const response = await client
        .post('/account/api-tokens')
        .headers(json)
        .loginAs(user)
        .json(body)
      response.assertStatus(422)
    }
  })

  test('caps the number of tokens per account', async ({ client }) => {
    const user = await makeUser()
    for (let i = 0; i < API_TOKENS_PER_USER_MAX; i++) {
      await User.accessTokens.create(user, ['read'], { name: `t${i}` })
    }

    const response = await client
      .post('/account/api-tokens')
      .headers(json)
      .loginAs(user)
      .json({ name: 'one more', abilities: ['read'], expiresInDays: 30 })

    response.assertStatus(422)
  })

  test('revokes a token, which then stops working', async ({ client, assert }) => {
    const user = await makeUser()
    const { token, secret } = await createToken(client, user)

    const revoked = await client
      .delete(`/account/api-tokens/${token.id}`)
      .headers(json)
      .loginAs(user)

    revoked.assertStatus(204)
    assert.isNull(await ApiToken.find(token.id))
    const after = await client.get('/architectures').headers(bearer(secret))
    after.assertStatus(401)
  })

  test("reads someone else's token as 404", async ({ client, assert }) => {
    const owner = await makeUser()
    const other = await makeUser()
    const { token } = await createToken(client, owner)

    const response = await client
      .delete(`/account/api-tokens/${token.id}`)
      .headers(json)
      .loginAs(other)

    response.assertStatus(404)
    assert.isNotNull(await ApiToken.find(token.id))
  })

  test('cannot be managed with a token', async ({ client }) => {
    const user = await makeUser()
    const { secret } = await createToken(client, user)

    const list = await client.get('/account/api-tokens').headers(bearer(secret))
    list.assertStatus(401)
    const create = await client
      .post('/account/api-tokens')
      .headers(bearer(secret))
      .json({ name: 'x', abilities: ['read'], expiresInDays: 30 })
    create.assertStatus(401)
  })
})

test.group('API tokens - architectures API', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('reads and writes architectures with a token', async ({ client, assert }) => {
    const user = await makeUser()
    const { token, secret } = await createToken(client, user)

    const created = await client.post('/architectures').headers(bearer(secret)).json({ title: 'A' })
    created.assertStatus(201)
    const list = await client.get('/architectures').headers(bearer(secret))
    list.assertStatus(200)
    assert.equal(list.body().meta.total, 1)

    const row = await ApiToken.findOrFail(token.id)
    assert.isNotNull(row.lastUsedAt)
  })

  test('only sees the owner architectures', async ({ client }) => {
    const owner = await makeUser()
    const other = await makeUser()
    const created = await client
      .post('/architectures')
      .headers(json)
      .loginAs(owner)
      .json({ title: 'Private' })
    const { secret } = await createToken(client, other)

    const response = await client
      .get(`/architectures/${created.body().architecture.id}`)
      .headers(bearer(secret))

    response.assertStatus(404)
  })

  test('a read token cannot write', async ({ client }) => {
    const user = await makeUser()
    const { secret } = await createToken(client, user, { abilities: ['read'] })

    const read = await client.get('/architectures').headers(bearer(secret))
    read.assertStatus(200)
    const write = await client.post('/architectures').headers(bearer(secret)).json({ title: 'A' })
    write.assertStatus(403)
  })

  test('a write-only token cannot read', async ({ client }) => {
    const user = await makeUser()
    const { secret } = await createToken(client, user, { abilities: ['write'] })

    const read = await client.get('/architectures').headers(bearer(secret))
    read.assertStatus(403)
  })

  test('refuses an expired or malformed token', async ({ client }) => {
    const user = await makeUser()
    const { token, secret } = await createToken(client, user)
    await ApiToken.query()
      .where('id', token.id)
      .update({ expiresAt: DateTime.now().minus({ minutes: 1 }).toJSDate() })

    const expired = await client.get('/architectures').headers(bearer(secret))
    expired.assertStatus(401)
    const malformed = await client.get('/architectures').headers(bearer('clu_nope'))
    malformed.assertStatus(401)
  })

  test('refuses force on a save made with a token', async ({ client }) => {
    const user = await makeUser()
    const { secret } = await createToken(client, user)
    const created = await client.post('/architectures').headers(bearer(secret)).json({ title: 'A' })
    const architecture = created.body().architecture
    const diagramId = architecture.diagrams[0].id
    const content = { kind: 'class', classes: [], relations: [] }

    const forced = await client
      .patch(`/architectures/${architecture.id}/diagrams/${diagramId}`)
      .headers(bearer(secret))
      .json({ content, version: 1, force: true })
    forced.assertStatus(403)

    const saved = await client
      .patch(`/architectures/${architecture.id}/diagrams/${diagramId}`)
      .headers(bearer(secret))
      .json({ content, version: 1, force: false })
    saved.assertStatus(200)
    const stale = await client
      .patch(`/architectures/${architecture.id}/diagrams/${diagramId}`)
      .headers(bearer(secret))
      .json({ content, version: 1 })
    stale.assertStatus(409)
  })

  test('throttles each token on its own', async ({ client }) => {
    const user = await makeUser()
    const first = await createToken(client, user, { name: 'first' })
    const second = await createToken(client, user, { name: 'second' })

    for (let i = 0; i < API_TOKEN_REQUESTS_PER_MINUTE; i++) {
      const ok = await client.get('/architectures').headers(bearer(first.secret))
      ok.assertStatus(200)
    }
    const limited = await client.get('/architectures').headers(bearer(first.secret))
    limited.assertStatus(429)
    const other = await client.get('/architectures').headers(bearer(second.secret))
    other.assertStatus(200)
    const session = await client.get('/architectures').headers(json).loginAs(user)
    session.assertStatus(200)
  })
})
