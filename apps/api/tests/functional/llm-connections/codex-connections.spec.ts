import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import LlmConnection from '#app/llm-connections/models/llm-connection'
import {
  codexCredential,
  disconnectCodex,
  saveCodexTokens,
} from '#app/llm-connections/services/codex-connections'
import CodexOAuth from '#app/llm-connections/services/codex-oauth'
import User from '#app/users/models/user'
import { codexJwt, fakeCodexOAuth } from './fakes.js'

const ACCESS = codexJwt('acct-1', 'old')
const NEW_ACCESS = codexJwt('acct-1', 'new')
const REFRESH = 'rt-fixture-never-shown'

function makeUser() {
  return User.create({
    email: `codex-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

function tokens(expiresInMs: number) {
  return {
    accessToken: ACCESS,
    refreshToken: REFRESH,
    expiresAt: new Date(Date.now() + expiresInMs),
    accountId: 'acct-1',
  }
}

test.group('ChatGPT subscription tokens', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => app.container.restore(CodexOAuth))

  test('stores the tokens encrypted and reads them back', async ({ assert }) => {
    const user = await makeUser()
    await saveCodexTokens(user, tokens(3600_000))
    const raw = await db.from('llm_connections').where('user_id', user.id).firstOrFail()
    assert.notInclude(raw.access_token, ACCESS)
    assert.notInclude(raw.refresh_token, REFRESH)
    assert.deepEqual(await codexCredential(user), {
      kind: 'openai-codex',
      accessToken: ACCESS,
      accountId: 'acct-1',
    })
  })

  test('refreshes a token about to expire', async ({ assert }) => {
    const user = await makeUser()
    const oauth = fakeCodexOAuth({ refresh: { access_token: NEW_ACCESS, expires_in: 3600 } })
    await saveCodexTokens(user, tokens(30_000))
    const credential = await codexCredential(user)
    assert.equal(credential?.accessToken, NEW_ACCESS)
    assert.lengthOf(oauth.calls('/oauth/token'), 1)
    const row = await LlmConnection.query().where('user_id', user.id).firstOrFail()
    assert.equal(row.accessToken, NEW_ACCESS)
    assert.equal(row.refreshToken, REFRESH)
    assert.isTrue(row.expiresAt > DateTime.now().plus({ minutes: 50 }))
  })

  test('a dead grant removes the connection and reports an expired subscription', async ({
    assert,
  }) => {
    const user = await makeUser()
    fakeCodexOAuth({ refreshStatus: 400, refresh: { error: 'invalid_grant' } })
    await saveCodexTokens(user, tokens(10_000))
    const error = await codexCredential(user).catch((caught: unknown) => caught)
    assert.equal((error as { reason?: string }).reason, 'subscription_expired')
    assert.isNull(await LlmConnection.query().where('user_id', user.id).first())
  })

  test('a row the current APP_KEY cannot read counts as not connected, and goes', async ({
    assert,
  }) => {
    const user = await makeUser()
    await saveCodexTokens(user, tokens(3600_000))
    await db
      .from('llm_connections')
      .where('user_id', user.id)
      .update({ access_token: 'sealed-with-another-key', refresh_token: 'sealed-too' })
    assert.isNull(await codexCredential(user))
    assert.isNull(await LlmConnection.query().where('user_id', user.id).first())
  })

  test('disconnecting removes the tokens', async ({ assert }) => {
    const user = await makeUser()
    await saveCodexTokens(user, tokens(3600_000))
    await disconnectCodex(user)
    assert.isNull(await codexCredential(user))
  })
})

test.group('ChatGPT subscription tokens, concurrent refresh', (group) => {
  group.each.teardown(() => app.container.restore(CodexOAuth))

  test('two calls with an expiring token refresh it once', async ({ assert, cleanup }) => {
    const user = await makeUser()
    cleanup(() => user.delete())
    const oauth = fakeCodexOAuth({
      refresh: { access_token: NEW_ACCESS, refresh_token: 'rt-2', expires_in: 3600 },
      delayMs: 50,
    })
    await saveCodexTokens(user, tokens(10_000))
    const [first, second] = await Promise.all([codexCredential(user), codexCredential(user)])
    assert.equal(first?.accessToken, NEW_ACCESS)
    assert.equal(second?.accessToken, NEW_ACCESS)
    assert.lengthOf(oauth.calls('/oauth/token'), 1)
  })
})
