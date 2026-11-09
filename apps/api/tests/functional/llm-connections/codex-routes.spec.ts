import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import redis from '@adonisjs/redis/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LlmConnection from '#app/llm-connections/models/llm-connection'
import { attemptKey } from '#app/llm-connections/services/codex-attempts'
import CodexOAuth from '#app/llm-connections/services/codex-oauth'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'
import { codexJwt, fakeCodexOAuth } from './fakes.js'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const ACCESS = codexJwt('acct-1', 'access-fixture-never-shown')
const REFRESH = 'rt-fixture-never-shown'
const ATTEMPTS = '/llm/connections/openai-codex/attempts'

function makeUser() {
  return User.create({
    email: `codex-routes-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

async function enableChatgpt(user: User) {
  await updateFlag(FeatureFlagKey.LlmSubscriptionChatgpt, ON, user)
}

/** Lets the next poll reach the fake server at once, whatever the poll interval. */
async function allowPoll(attemptId: string) {
  await redis.del(`${attemptKey(attemptId)}:lock`)
}

test.group('ChatGPT subscription - device code', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(CodexOAuth))

  test('connects after the user enters the code, and says so again on the next poll', async ({
    client,
    assert,
    cleanup,
  }) => {
    const user = await makeUser()
    await enableChatgpt(user)
    fakeCodexOAuth({})
    const logs = captureLogs()
    cleanup(logs.restore)
    const started = await client.post(ATTEMPTS).headers(json).loginAs(user)
    started.assertStatus(201)
    const attempt = started.body()
    assert.containsSubset(attempt, {
      verificationUrl: 'https://auth.openai.com/codex/device',
      userCode: 'ABCD-1234',
      interval: 5,
    })

    const pending = await client.get(`${ATTEMPTS}/${attempt.attemptId}`).headers(json).loginAs(user)
    pending.assertBody({ status: 'pending' })

    await allowPoll(attempt.attemptId)
    fakeCodexOAuth({
      pollStatus: 200,
      refresh: { access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 },
    })
    const connected = await client
      .get(`${ATTEMPTS}/${attempt.attemptId}`)
      .headers(json)
      .loginAs(user)
    connected.assertBody({ status: 'connected' })
    assert.isNotNull(await LlmConnection.query().where('user_id', user.id).first())

    const again = await client.get(`${ATTEMPTS}/${attempt.attemptId}`).headers(json).loginAs(user)
    again.assertBody({ status: 'connected' })

    const providers = await client.get('/llm/providers').headers(json).loginAs(user)
    const codex = providers
      .body()
      .providers.find((p: { kind: string }) => p.kind === 'openai-codex')
    assert.containsSubset(codex, { auth: 'subscription', connected: true, requiresApiKey: false })

    const database = await dumpDatabase()
    const bodies = [started.body(), pending.body(), connected.body(), providers.body()]
    for (const place of [
      ...bodies.map((body) => JSON.stringify(body)),
      logs.lines.join('\n'),
      database,
    ]) {
      assert.notInclude(place, ACCESS)
      assert.notInclude(place, REFRESH)
    }
  })

  test('reports a refused and an expired attempt', async ({ client }) => {
    const user = await makeUser()
    await enableChatgpt(user)
    fakeCodexOAuth({ pollStatus: 400 })
    const denied = (await client.post(ATTEMPTS).headers(json).loginAs(user)).body()
    ;(await client.get(`${ATTEMPTS}/${denied.attemptId}`).headers(json).loginAs(user)).assertBody({
      status: 'denied',
    })

    const expired = (await client.post(ATTEMPTS).headers(json).loginAs(user)).body()
    const stored = JSON.parse((await redis.get(attemptKey(expired.attemptId))) ?? '{}')
    await redis.set(
      attemptKey(expired.attemptId),
      JSON.stringify({ ...stored, expiresAt: new Date(Date.now() - 1000).toISOString() }),
      'EX',
      60,
    )
    ;(await client.get(`${ATTEMPTS}/${expired.attemptId}`).headers(json).loginAs(user)).assertBody({
      status: 'expired',
    })
  })

  test('a failed exchange does not undo a connection another poll made', async ({ client }) => {
    const user = await makeUser()
    await enableChatgpt(user)
    fakeCodexOAuth({})
    const attempt = (await client.post(ATTEMPTS).headers(json).loginAs(user)).body()
    await allowPoll(attempt.attemptId)
    // While this poll exchanges the code, another one has already connected the account.
    const fake = fakeCodexOAuth({ pollStatus: 200, refreshStatus: 400, refresh: { error: 'x' } })
    fake.beforeToken = async () => {
      const stored = JSON.parse((await redis.get(attemptKey(attempt.attemptId))) ?? '{}')
      await redis.set(
        attemptKey(attempt.attemptId),
        JSON.stringify({ ...stored, status: 'connected' }),
        'EX',
        60,
      )
    }
    ;(await client.get(`${ATTEMPTS}/${attempt.attemptId}`).headers(json).loginAs(user)).assertBody({
      status: 'connected',
    })
  })

  test("another account's attempt, or an unknown one, is not found", async ({ client }) => {
    const owner = await makeUser()
    const other = await makeUser()
    await enableChatgpt(owner)
    fakeCodexOAuth({})
    const attempt = (await client.post(ATTEMPTS).headers(json).loginAs(owner)).body()
    ;(
      await client.get(`${ATTEMPTS}/${attempt.attemptId}`).headers(json).loginAs(other)
    ).assertStatus(404)
    ;(
      await client
        .get(`${ATTEMPTS}/00000000-0000-4000-8000-000000000000`)
        .headers(json)
        .loginAs(owner)
    ).assertStatus(404)
  })

  test('disconnecting removes the tokens', async ({ client, assert }) => {
    const user = await makeUser()
    await enableChatgpt(user)
    await LlmConnection.create({
      userId: user.id,
      kind: 'openai-codex',
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: (await import('luxon')).DateTime.now().plus({ hours: 1 }),
      accountId: 'acct-1',
    })
    ;(
      await client.delete('/llm/connections/openai-codex').headers(json).loginAs(user)
    ).assertStatus(204)
    assert.isNull(await LlmConnection.query().where('user_id', user.id).first())
    const raw = JSON.stringify(await db.from('llm_connections').select('*'))
    assert.notInclude(raw, REFRESH)
  })

  test('is not found while the flag is off, and missing from the providers', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    fakeCodexOAuth({})
    ;(await client.post(ATTEMPTS).headers(json).loginAs(user)).assertStatus(404)
    ;(
      await client.delete('/llm/connections/openai-codex').headers(json).loginAs(user)
    ).assertStatus(404)
    const providers = await client.get('/llm/providers').headers(json).loginAs(user)
    assert.notInclude(
      providers.body().providers.map((p: { kind: string }) => p.kind),
      'openai-codex',
    )
  })

  test('needs a session', async ({ client }) => {
    ;(await client.post(ATTEMPTS).headers(json)).assertStatus(401)
  })
})
