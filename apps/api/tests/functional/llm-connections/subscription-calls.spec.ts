import app from '@adonisjs/core/services/app'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { LanguageModel, LlmCredential, ProviderSettings } from '@coreloom-uml/llm'
import { answeringModel } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import { saveCodexTokens } from '#app/llm-connections/services/codex-connections'
import CodexOAuth from '#app/llm-connections/services/codex-oauth'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { codexJwt, fakeCodexOAuth } from './fakes.js'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const ACCESS = codexJwt('acct-1', 'calls')
const codex = { kind: 'openai-codex', model: 'gpt-5.5' }

function makeUser() {
  return User.create({
    email: `sub-calls-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

function useModel(model: LanguageModel) {
  const built: { provider: ProviderSettings; credential: LlmCredential }[] = []
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

async function connectCodex(user: User, expiresInMs = 3600_000) {
  await saveCodexTokens(user, {
    accessToken: ACCESS,
    refreshToken: 'rt-calls',
    expiresAt: new Date(Date.now() + expiresInMs),
    accountId: 'acct-1',
  })
}

test.group('LLM calls with a subscription', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => {
    app.container.restore(LanguageModels)
    app.container.restore(CodexOAuth)
  })

  test('a connected ChatGPT subscription answers the connection test', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    await updateFlag(FeatureFlagKey.LlmSubscriptionChatgpt, ON, user)
    await connectCodex(user)
    const built = useModel(answeringModel('OK'))
    const response = await client
      .post('/llm/test')
      .headers(json)
      .loginAs(user)
      .json({ provider: codex })
    response.assertStatus(200)
    assert.isTrue(response.body().ok)
    assert.deepEqual(built[0]?.credential, {
      kind: 'openai-codex',
      accessToken: ACCESS,
      accountId: 'acct-1',
    })
    assert.notInclude(JSON.stringify(response.body()), ACCESS)
  })

  test('without a connection, the test reports an expired subscription', async ({ client }) => {
    const user = await makeUser()
    await updateFlag(FeatureFlagKey.LlmSubscriptionChatgpt, ON, user)
    useModel(answeringModel('OK'))
    const response = await client
      .post('/llm/test')
      .headers(json)
      .loginAs(user)
      .json({ provider: codex })
    response.assertBody({ ok: false, reason: 'subscription_expired' })
  })

  test('a dead grant answers proposals with 502 subscription_expired', async ({ client }) => {
    const user = await makeUser()
    await updateFlag(FeatureFlagKey.LlmSubscriptionChatgpt, ON, user)
    await connectCodex(user, 10_000)
    fakeCodexOAuth({ refreshStatus: 400, refresh: { error: 'invalid_grant' } })
    useModel(answeringModel('{"proposals":[]}'))
    const project = (
      await client.post('/projects').headers(json).loginAs(user).json({ name: 'Shop' })
    ).body().project
    const created = await client
      .post('/agent-configs')
      .headers(json)
      .loginAs(user)
      .json({
        name: 'Shop',
        projectId: project.id,
        questionnaires: ['frontend-react'],
        targets: ['generic'],
      })
    created.assertStatus(201)
    const response = await client
      .post(`/agent-configs/${created.body().config.id}/proposals`)
      .headers(json)
      .loginAs(user)
      .json({ provider: codex })
    response.assertStatus(502)
    response.assertBodyContains({ reason: 'subscription_expired' })
  })

  test('refuses a claude-code model name that could read as a flag', async ({ client }) => {
    const user = await makeUser()
    await updateFlag(FeatureFlagKey.LlmSubscriptionClaude, ON, user)
    useModel(answeringModel('OK'))
    const response = await client
      .post('/llm/test')
      .headers(json)
      .loginAs(user)
      .json({ provider: { kind: 'claude-code', model: '--dangerously-skip-permissions' } })
    response.assertStatus(422)
  })

  test('a subscription kind whose flag is off is not found', async ({ client }) => {
    const user = await makeUser()
    useModel(answeringModel('OK'))
    for (const provider of [codex, { kind: 'claude-code', model: 'sonnet' }]) {
      const response = await client.post('/llm/test').headers(json).loginAs(user).json({ provider })
      response.assertStatus(404)
    }
  })
})
