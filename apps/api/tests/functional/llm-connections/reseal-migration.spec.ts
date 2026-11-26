import encryption from '@adonisjs/core/services/encryption'
import db from '@adonisjs/lucid/services/db'
import { test } from '@japa/runner'
import { LlmSecretPurpose } from '#app/llm-connections/constants/llm-connections'
import { codexCredential, saveCodexTokens } from '#app/llm-connections/services/codex-connections'
import { openLegacyAppSecret, openLlmSecret } from '#app/llm-connections/services/llm-secrets'
import User from '#app/users/models/user'
import ResealLlmConnections from '#database/migrations/1733800000001_reseal-llm-connections-with-llm-keys'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { codexJwt } from './fakes.js'

const ACCESS = codexJwt('acct-1', 'reseal')
const REFRESH = 'rt-reseal-fixture-never-shown'

async function legacyConnection() {
  const user = await User.create({
    email: `reseal-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
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

function raw(user: User) {
  return db.from('llm_connections').where('user_id', user.id).firstOrFail()
}

test.group('Migration - ChatGPT tokens move to llmKeys', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('up seals APP_KEY tokens with llmKeys, down puts them back', async ({ assert }) => {
    const user = await legacyConnection()
    const migration = new ResealLlmConnections(db.connection(), 'reseal', false)

    await migration.execUp()
    const moved = await raw(user)
    assert.equal(openLlmSecret(moved.refresh_token, LlmSecretPurpose.Connection), REFRESH)
    assert.equal(openLlmSecret(moved.access_token, LlmSecretPurpose.Connection), ACCESS)
    assert.isNull(openLegacyAppSecret(moved.refresh_token))
    assert.equal((await codexCredential(user))?.accessToken, ACCESS)

    // Running it again changes nothing.
    await new ResealLlmConnections(db.connection(), 'reseal', false).execUp()
    assert.equal((await raw(user)).refresh_token, moved.refresh_token)

    await new ResealLlmConnections(db.connection(), 'reseal', false).execDown()
    const back = await raw(user)
    assert.equal(openLegacyAppSecret(back.refresh_token), REFRESH)
    assert.isNull(openLlmSecret(back.refresh_token, LlmSecretPurpose.Connection))
  })

  test('leaves a token neither key can read as it is', async ({ assert }) => {
    const user = await legacyConnection()
    await db
      .from('llm_connections')
      .where('user_id', user.id)
      .update({ access_token: 'sealed-elsewhere', refresh_token: 'sealed-elsewhere-too' })
    await new ResealLlmConnections(db.connection(), 'reseal', false).execUp()
    assert.equal((await raw(user)).refresh_token, 'sealed-elsewhere-too')
  })
})
