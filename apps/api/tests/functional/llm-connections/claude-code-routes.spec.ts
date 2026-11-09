import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { ClaudeRun } from '@coreloom-uml/llm'
import { test } from '@japa/runner'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import ClaudeCodeCli, { type ClaudeLogin } from '#app/llm-connections/services/claude-code-cli'
import { startClaudeLogin } from '#app/llm-connections/services/claude-code-connections'
import User from '#app/users/models/user'
import llmConfig from '#config/llm'
import { captureLogs } from '#tests/helpers/leaks'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const PASSWORD = 'a-very-strong-passphrase'
const CODE = 'claude-code-fixture-never-shown#state'
const LOGIN_URL = 'https://claude.com/cai/oauth/authorize?code=true&client_id=x&state=y'
const claude = { kind: 'claude-code', model: 'sonnet' }

type Outcome = Awaited<ReturnType<ClaudeRun>>

function makeUser() {
  return User.create({
    email: `claude-${Math.random().toString(36).slice(2)}@example.com`,
    password: PASSWORD,
  })
}

/** Swaps the binary for a fake that records each call and the folder it ran in. */
function fakeClaude(options: { loggedIn?: boolean; outcome?: Partial<Outcome>; accept?: boolean }) {
  const record = {
    dirs: [] as string[],
    codes: [] as string[],
    killed: 0,
    logouts: 0,
    loggedIn: options.loggedIn ?? false,
  }
  app.container.swap(ClaudeCodeCli, () => {
    const fake = new ClaudeCodeCli()
    fake.run = async (_args, { configDir }) => {
      record.dirs.push(configDir)
      return {
        exitCode: 0,
        stdout: JSON.stringify({ is_error: false, result: 'OK' }),
        timedOut: false,
        missing: false,
        ...options.outcome,
      }
    }
    fake.status = async (configDir) => {
      record.dirs.push(configDir)
      return record.loggedIn
    }
    fake.logout = async (configDir) => {
      record.dirs.push(configDir)
      record.logouts++
    }
    fake.login = (configDir): ClaudeLogin => {
      record.dirs.push(configDir)
      return {
        url: Promise.resolve(LOGIN_URL),
        submit: async (code) => {
          record.codes.push(code)
          record.loggedIn = options.accept ?? true
          return record.loggedIn
        },
        kill: () => {
          record.killed++
        },
      }
    }
    return fake
  })
  return record
}

async function enableClaude(user: User) {
  await updateFlag(FeatureFlagKey.LlmSubscriptionClaude, ON, user)
}

async function exists(path: string) {
  return stat(path).then(
    (info) => info,
    () => null,
  )
}

test.group('Claude subscription', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => app.container.restore(ClaudeCodeCli))

  test('signs in through the binary, in the account own private folder', async ({
    client,
    assert,
    cleanup,
  }) => {
    const user = await makeUser()
    const other = await makeUser()
    await enableClaude(user)
    const record = fakeClaude({})
    const logs = captureLogs()
    cleanup(logs.restore)

    const started = await client
      .post('/llm/connections/claude-code/login')
      .headers(json)
      .loginAs(user)
    started.assertStatus(200)
    started.assertBody({ url: LOGIN_URL })

    const done = await client
      .post('/llm/connections/claude-code/login/code')
      .headers(json)
      .loginAs(user)
      .json({ code: `  ${CODE}  ` })
    done.assertBody({ connected: true })
    assert.deepEqual(record.codes, [CODE])

    const providers = await client.get('/llm/providers').headers(json).loginAs(user)
    const entry = providers.body().providers.find((p: { kind: string }) => p.kind === 'claude-code')
    assert.containsSubset(entry, { auth: 'subscription', connected: true })

    const dir = join(llmConfig.claudeCodeHome, String(user.id))
    assert.isTrue(record.dirs.every((used) => used === dir))
    assert.equal(((await exists(dir))?.mode ?? 0) & 0o777, 0o700)
    assert.notInclude(dir, String(other.id) + '/')
    assert.notInclude(logs.lines.join('\n'), CODE)
    assert.notInclude(JSON.stringify(done.body()), CODE)
  })

  test('refuses a code with a line break or control characters', async ({ client }) => {
    const user = await makeUser()
    await enableClaude(user)
    fakeClaude({})
    await client.post('/llm/connections/claude-code/login').headers(json).loginAs(user)
    for (const code of ['abc\nrm -rf /', 'abc\u0007', 'a b', '']) {
      const response = await client
        .post('/llm/connections/claude-code/login/code')
        .headers(json)
        .loginAs(user)
        .json({ code })
      response.assertStatus(422)
    }
  })

  test('a code with no sign-in running is not found', async ({ client }) => {
    const user = await makeUser()
    await enableClaude(user)
    fakeClaude({})
    const response = await client
      .post('/llm/connections/claude-code/login/code')
      .headers(json)
      .loginAs(user)
      .json({ code: 'abc' })
    response.assertStatus(404)
  })

  test('a second sign-in stops the first; a sign-in left open stops after the delay', async ({
    assert,
  }) => {
    const user = await makeUser()
    const record = fakeClaude({})
    await startClaudeLogin(user)
    await startClaudeLogin(user)
    assert.equal(record.killed, 1)
    await startClaudeLogin(user, { timeoutMs: 20 })
    assert.equal(record.killed, 2)
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert.equal(record.killed, 3)
  })

  test('two sign-ins started together leave one running', async ({ assert }) => {
    const user = await makeUser()
    const record = fakeClaude({})
    await Promise.all([startClaudeLogin(user), startClaudeLogin(user)])
    assert.equal(record.killed, 1)
  })

  test('signing out logs the binary out and removes the folder', async ({ client, assert }) => {
    const user = await makeUser()
    await enableClaude(user)
    const record = fakeClaude({ loggedIn: true })
    await client.post('/llm/connections/claude-code/login').headers(json).loginAs(user)
    const dir = join(llmConfig.claudeCodeHome, String(user.id))
    assert.isNotNull(await exists(dir))
    ;(await client.delete('/llm/connections/claude-code').headers(json).loginAs(user)).assertStatus(
      204,
    )
    assert.equal(record.logouts, 1)
    assert.isNull(await exists(dir))
  })

  test('deleting the account removes the folder', async ({ client, assert }) => {
    const user = await makeUser()
    await enableClaude(user)
    fakeClaude({})
    await client.post('/llm/connections/claude-code/login').headers(json).loginAs(user)
    const dir = join(llmConfig.claudeCodeHome, String(user.id))
    ;(
      await client.delete('/account').headers(json).loginAs(user).json({ password: PASSWORD })
    ).assertStatus(204)
    assert.isNull(await exists(dir))
  })

  test('calls go through the binary, failures become reasons', async ({ client, assert }) => {
    const user = await makeUser()
    await enableClaude(user)
    const cases: [Partial<Outcome>, { ok: boolean; reason?: string }][] = [
      [{}, { ok: true }],
      [
        { exitCode: 1, stdout: 'boom' },
        { ok: false, reason: 'unknown' },
      ],
      [
        { exitCode: null, timedOut: true, stdout: '' },
        { ok: false, reason: 'timeout' },
      ],
      [
        {
          exitCode: 1,
          stdout: JSON.stringify({ is_error: true, result: 'Not logged in · Please run /login' }),
        },
        { ok: false, reason: 'subscription_expired' },
      ],
      [
        { exitCode: null, missing: true, stdout: '' },
        { ok: false, reason: 'unreachable' },
      ],
    ]
    for (const [outcome, expected] of cases) {
      fakeClaude({ outcome })
      const response = await client
        .post('/llm/test')
        .headers(json)
        .loginAs(user)
        .json({ provider: claude })
      response.assertStatus(200)
      assert.containsSubset(response.body(), expected)
    }
  })

  test('is not found while the flag is off', async ({ client }) => {
    const user = await makeUser()
    fakeClaude({})
    ;(
      await client.post('/llm/connections/claude-code/login').headers(json).loginAs(user)
    ).assertStatus(404)
    ;(await client.delete('/llm/connections/claude-code').headers(json).loginAs(user)).assertStatus(
      404,
    )
  })
})
