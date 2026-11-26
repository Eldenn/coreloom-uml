import encryption from '@adonisjs/core/services/encryption'
import db from '@adonisjs/lucid/services/db'
import { test } from '@japa/runner'
import { LlmSecretPurpose } from '#app/llm-connections/constants/llm-connections'
import { codexCredential, saveCodexTokens } from '#app/llm-connections/services/codex-connections'
import { saveApiKey, storedApiKey } from '#app/llm-connections/services/llm-api-keys'
import { openLlmSecret } from '#app/llm-connections/services/llm-secrets'
import User from '#app/users/models/user'
import ResealLlmConnections from '#database/migrations/1733800000001_reseal-llm-connections-with-llm-keys'
import BindLlmApiKeys from '#database/migrations/1733800000002_bind-llm-api-keys-to-their-owner'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { codexJwt } from './fakes.js'

const ACCESS = codexJwt('acct-1', 'reseal')
const REFRESH = 'rt-reseal-fixture-never-shown'
const KEY = 'provider-key-reseal-fixture-never-shown'

function makeUser() {
  return User.create({
    email: `reseal-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

function run(
  Migration: typeof ResealLlmConnections | typeof BindLlmApiKeys,
  direction: 'up' | 'down',
) {
  const migration = new Migration(db.connection(), 'reseal', false)
  return direction === 'up' ? migration.execUp() : migration.execDown()
}

async function legacyConnection() {
  const user = await makeUser()
  await saveCodexTokens(user, {
    accessToken: ACCESS,
    refreshToken: REFRESH,
    expiresAt: new Date(Date.now() + 3600_000),
    accountId: 'acct-1',
  })
  // As stored before the move: APP_KEY, no purpose.
  await db
    .from('llm_connections')
    .where('user_id', user.id)
    .update({
      access_token: encryption.encrypt(ACCESS),
      refresh_token: encryption.encrypt(REFRESH),
    })
  return user
}

function connectionOf(user: User) {
  return db.from('llm_connections').where('user_id', user.id).firstOrFail()
}

test.group('Migration - ChatGPT tokens move to llmKeys, bound to their owner', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('up seals APP_KEY tokens for their owner, down puts them back', async ({ assert }) => {
    const user = await legacyConnection()

    await run(ResealLlmConnections, 'up')
    const moved = await connectionOf(user)
    assert.equal(openLlmSecret(moved.refresh_token, LlmSecretPurpose.Connection, user), REFRESH)
    assert.equal(openLlmSecret(moved.access_token, LlmSecretPurpose.Connection, user), ACCESS)
    assert.isNull(encryption.decrypt(moved.refresh_token))
    assert.equal((await codexCredential(user))?.accessToken, ACCESS)

    // Running it again changes nothing.
    await run(ResealLlmConnections, 'up')
    assert.equal((await connectionOf(user)).refresh_token, moved.refresh_token)

    await run(ResealLlmConnections, 'down')
    const back = await connectionOf(user)
    assert.equal(encryption.decrypt(back.refresh_token), REFRESH)
    assert.isNull(openLlmSecret(back.refresh_token, LlmSecretPurpose.Connection, user))
  })

  test('leaves a token neither key can read as it is', async ({ assert }) => {
    const user = await legacyConnection()
    await db
      .from('llm_connections')
      .where('user_id', user.id)
      .update({ access_token: 'sealed-elsewhere', refresh_token: 'sealed-elsewhere-too' })
    await run(ResealLlmConnections, 'up')
    assert.equal((await connectionOf(user)).refresh_token, 'sealed-elsewhere-too')
  })
})

test.group('Migration - saved keys bound to their owner', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('up seals a key of its kind only for its owner, down puts it back', async ({ assert }) => {
    const user = await makeUser()
    await saveApiKey(user, 'mistral', { apiKey: KEY, baseUrl: null })
    // As stored before: llmKeys, bound to the kind alone.
    await db
      .from('llm_api_keys')
      .where('user_id', user.id)
      .update({
        api_key: encryption.use('llmKeys').encrypt(KEY, { purpose: LlmSecretPurpose.ApiKey }),
      })
    assert.equal((await storedApiKey(user, 'mistral'))?.apiKey, '')

    await run(BindLlmApiKeys, 'up')
    assert.equal((await storedApiKey(user, 'mistral'))?.apiKey, KEY)
    const moved = await db.from('llm_api_keys').where('user_id', user.id).firstOrFail()
    await run(BindLlmApiKeys, 'up')
    assert.equal(
      (await db.from('llm_api_keys').where('user_id', user.id).firstOrFail()).api_key,
      moved.api_key,
    )

    await run(BindLlmApiKeys, 'down')
    const back = await db.from('llm_api_keys').where('user_id', user.id).firstOrFail()
    assert.equal(encryption.use('llmKeys').decrypt(back.api_key, LlmSecretPurpose.ApiKey), KEY)
    // The up migration runs for the next tests.
    await run(BindLlmApiKeys, 'up')
  })

  test('a keyless row keeps no key', async ({ assert }) => {
    const user = await makeUser()
    await saveApiKey(user, 'ollama', { apiKey: '', baseUrl: 'http://localhost:11434' })
    await run(BindLlmApiKeys, 'up')
    const row = await db.from('llm_api_keys').where('user_id', user.id).firstOrFail()
    assert.isNull(row.api_key)
  })
})
