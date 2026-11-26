import { mkdir, readdir, readFile, stat, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { ClaudeRun } from '@coreloom-uml/llm'
import { test } from '@japa/runner'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import ClaudeCodeCli, { type ClaudeLogin } from '#app/llm-connections/services/claude-code-cli'
import { startClaudeLogin } from '#app/llm-connections/services/claude-code-connections'
import {
  claudeState,
  deleteClaudeState,
  hasClaudeState,
  importClaudeFolders,
  removeClaudeFolder,
  saveClaudeState,
  withClaudeFolder,
  withClaudeLock,
} from '#app/llm-connections/services/claude-code-state'
import User from '#app/users/models/user'
import llmConfig from '#config/llm'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const PASSWORD = 'a-very-strong-passphrase'
const CODE = 'claude-code-fixture-never-shown#state'
const LOGIN_URL = 'https://claude.com/cai/oauth/authorize?code=true&client_id=x&state=y'
/** What the fake binary writes as its credentials: it must never show up in clear anywhere. */
const CREDENTIALS = '{"claudeAiOauth":{"accessToken":"sk-ant-oat-fixture-never-shown"}}'
const REFRESHED = '{"claudeAiOauth":{"accessToken":"sk-ant-oat-refreshed-never-shown"}}'
const claude = { kind: 'claude-code', model: 'sonnet' }

type Outcome = Awaited<ReturnType<ClaudeRun>>

function makeUser() {
  return User.create({
    email: `claude-${Math.random().toString(36).slice(2)}@example.com`,
    password: PASSWORD,
  })
}

/**
 * Swaps the binary for a fake that records each call and the folder it ran in. Its sign-in writes
 * `CREDENTIALS` to its folder when it accepts the code, like the real one; `onRun` lets a test
 * play a launch (a refreshed token, a slow call).
 */
function fakeClaude(options: {
  loggedIn?: boolean
  outcome?: Partial<Outcome>
  accept?: boolean
  onRun?: (configDir: string) => Promise<void>
}) {
  const record = {
    dirs: [] as string[],
    codes: [] as string[],
    seen: [] as string[],
    killed: 0,
    logouts: 0,
    loggedIn: options.loggedIn ?? false,
  }
  app.container.swap(ClaudeCodeCli, () => {
    const fake = new ClaudeCodeCli()
    fake.run = async (_args, { configDir }) => {
      record.dirs.push(configDir)
      record.seen.push(await readCredentials(configDir))
      await options.onRun?.(configDir)
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
          if (record.loggedIn) {
            await writeFile(join(configDir, '.credentials.json'), CREDENTIALS)
          }
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

function readCredentials(dir: string): Promise<string> {
  return readFile(join(dir, '.credentials.json'), 'utf8').catch(() => '')
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

/** The short-lived folders left in the home: none once every launch and sign-in has ended. */
async function runFolders(): Promise<string[]> {
  const entries = await readdir(llmConfig.claudeCodeHome).catch(() => [])
  return entries.filter((name) => name.startsWith('run-'))
}

test.group('Claude subscription', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(ClaudeCodeCli))

  test('signs in through the binary and keeps its state sealed in the database', async ({
    client,
    assert,
    cleanup,
  }) => {
    const user = await makeUser()
    await enableClaude(user)
    const record = fakeClaude({})
    const logs = captureLogs()
    cleanup(logs.restore)
    const before = await runFolders()

    const started = await client
      .post('/llm/connections/claude-code/login')
      .headers(json)
      .loginAs(user)
    started.assertStatus(200)
    started.assertBody({ url: LOGIN_URL })

    // The sign-in runs in a private short-lived folder, not one named after the account.
    const [loginDir] = record.dirs
    assert.match(loginDir, /\/run-[^/]+$/)
    assert.equal(((await exists(loginDir))?.mode ?? 0) & 0o777, 0o700)

    const done = await client
      .post('/llm/connections/claude-code/login/code')
      .headers(json)
      .loginAs(user)
      .json({ code: `  ${CODE}  ` })
    done.assertBody({ connected: true })
    assert.deepEqual(record.codes, [CODE])

    // The binary's files are in the database now, and its folder is gone.
    assert.deepEqual(await claudeState(user), { '.credentials.json': CREDENTIALS })
    const raw = await db.from('claude_code_states').where('user_id', user.id).firstOrFail()
    assert.notInclude(raw.files, 'sk-ant-oat')
    assert.isNull(await exists(loginDir))
    assert.isNull(await exists(join(llmConfig.claudeCodeHome, String(user.id))))

    const providers = await client.get('/llm/providers').headers(json).loginAs(user)
    const entry = providers.body().providers.find((p: { kind: string }) => p.kind === 'claude-code')
    assert.containsSubset(entry, { auth: 'subscription', connected: true })

    assert.notInclude(logs.lines.join('\n'), CODE)
    assert.notInclude(logs.lines.join('\n'), 'sk-ant-oat')
    assert.notInclude(JSON.stringify(done.body()), CODE)
    assert.notInclude(await dumpDatabase(), 'sk-ant-oat')
    assert.deepEqual(await runFolders(), before)
  })

  test('a code the binary refuses saves nothing', async ({ client, assert }) => {
    const user = await makeUser()
    await enableClaude(user)
    fakeClaude({ accept: false })
    await client.post('/llm/connections/claude-code/login').headers(json).loginAs(user)
    const done = await client
      .post('/llm/connections/claude-code/login/code')
      .headers(json)
      .loginAs(user)
      .json({ code: CODE })
    done.assertBody({ connected: false })
    assert.isNull(await claudeState(user))
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
    // Each stopped sign-in took its folder with it.
    await new Promise((resolve) => setTimeout(resolve, 20))
    for (const dir of record.dirs) assert.isNull(await exists(dir))
  })

  test('two sign-ins started together leave one running', async ({ assert }) => {
    const user = await makeUser()
    const record = fakeClaude({})
    await Promise.all([startClaudeLogin(user), startClaudeLogin(user)])
    assert.equal(record.killed, 1)
  })

  test('a launch gets the saved state in a folder of its own, and keeps a refreshed token', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    await enableClaude(user)
    await saveClaudeState(user, { '.credentials.json': CREDENTIALS })
    const record = fakeClaude({
      // The binary refreshes its token during the call, as the real one does.
      onRun: (dir) => writeFile(join(dir, '.credentials.json'), REFRESHED),
    })
    const before = await runFolders()

    const response = await client
      .post('/llm/test')
      .headers(json)
      .loginAs(user)
      .json({ provider: claude })
    response.assertStatus(200)
    assert.isTrue(response.body().ok)

    assert.deepEqual(record.seen, [CREDENTIALS])
    assert.deepEqual(await claudeState(user), { '.credentials.json': REFRESHED })
    assert.isNull(await exists(record.dirs[0]))
    assert.deepEqual(await runFolders(), before)
  })

  test('launches of one account run one at a time', async ({ client, assert }) => {
    const user = await makeUser()
    await enableClaude(user)
    await saveClaudeState(user, { '.credentials.json': CREDENTIALS })
    let running = 0
    let most = 0
    fakeClaude({
      onRun: async () => {
        running++
        most = Math.max(most, running)
        await new Promise((resolve) => setTimeout(resolve, 50))
        running--
      },
    })
    const send = () =>
      client.post('/llm/test').headers(json).loginAs(user).json({ provider: claude })
    const responses = await Promise.all([send(), send(), send()])
    for (const response of responses) response.assertStatus(200)
    assert.equal(most, 1)
  })

  test('an account without a saved state is not connected and never reaches the binary', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    await enableClaude(user)
    const record = fakeClaude({ loggedIn: true })
    const providers = await client.get('/llm/providers').headers(json).loginAs(user)
    const entry = providers.body().providers.find((p: { kind: string }) => p.kind === 'claude-code')
    assert.containsSubset(entry, { connected: false })

    const call = await client
      .post('/llm/test')
      .headers(json)
      .loginAs(user)
      .json({ provider: claude })
    call.assertStatus(200)
    call.assertBody({ ok: false, reason: 'subscription_expired' })
    assert.deepEqual(record.dirs, [])
  })

  test('signing out logs the binary out and drops the state', async ({ client, assert }) => {
    const user = await makeUser()
    await enableClaude(user)
    await saveClaudeState(user, { '.credentials.json': CREDENTIALS })
    const record = fakeClaude({ loggedIn: true })
    ;(await client.delete('/llm/connections/claude-code').headers(json).loginAs(user)).assertStatus(
      204,
    )
    assert.equal(record.logouts, 1)
    assert.isNull(await claudeState(user))
    assert.isNull(await exists(record.dirs[0]))
  })

  test('deleting the account drops the state', async ({ client, assert }) => {
    const user = await makeUser()
    await enableClaude(user)
    await saveClaudeState(user, { '.credentials.json': CREDENTIALS })
    fakeClaude({})
    ;(
      await client.delete('/account').headers(json).loginAs(user).json({ password: PASSWORD })
    ).assertStatus(204)
    const left = await db.from('claude_code_states').where('user_id', user.id)
    assert.lengthOf(left, 0)
  })

  test('calls go through the binary, failures become reasons', async ({ client, assert }) => {
    const user = await makeUser()
    await enableClaude(user)
    await saveClaudeState(user, { '.credentials.json': CREDENTIALS })
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

  test('a sign-in whose binary prints no page fails after a short delay', async ({ assert }) => {
    const user = await makeUser()
    let killed = 0
    app.container.swap(ClaudeCodeCli, () => {
      const fake = new ClaudeCodeCli()
      fake.login = () => ({
        url: new Promise<string>(() => {}),
        submit: async () => false,
        kill: () => {
          killed++
        },
      })
      return fake
    })
    await assert.rejects(() => startClaudeLogin(user, { urlTimeoutMs: 20 }))
    assert.equal(killed, 1)
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

test.group('Claude subscription - import of account folders', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('moves a signed-in folder into the database and removes every account folder', async ({
    assert,
  }) => {
    const user = await makeUser()
    const signedIn = join(llmConfig.claudeCodeHome, String(user.id))
    await mkdir(signedIn, { recursive: true, mode: 0o700 })
    await writeFile(join(signedIn, '.credentials.json'), CREDENTIALS)
    await writeFile(join(signedIn, '.claude.json'), '{"numStartups":3}')
    await writeFile(join(signedIn, 'notes.txt'), 'not kept')
    // A folder left by an account that is gone, and an empty one: removed, nothing saved.
    const gone = join(llmConfig.claudeCodeHome, '999999999')
    await mkdir(gone, { recursive: true })
    await writeFile(join(gone, '.credentials.json'), CREDENTIALS)
    const other = await makeUser()
    const empty = join(llmConfig.claudeCodeHome, String(other.id))
    await mkdir(empty, { recursive: true })

    const result = await importClaudeFolders()
    assert.isAtLeast(result.imported, 1)
    assert.deepEqual(await claudeState(user), {
      '.credentials.json': CREDENTIALS,
      '.claude.json': '{"numStartups":3}',
    })
    assert.isNull(await claudeState(other))
    for (const dir of [signedIn, gone, empty]) assert.isNull(await exists(dir))

    // A second run finds nothing to move.
    assert.equal((await importClaudeFolders()).imported, 0)
  })

  test('keeps a state already in the database over an old folder', async ({ assert }) => {
    const user = await makeUser()
    await saveClaudeState(user, { '.credentials.json': REFRESHED })
    const old = join(llmConfig.claudeCodeHome, String(user.id))
    await mkdir(old, { recursive: true, mode: 0o700 })
    await writeFile(join(old, '.credentials.json'), CREDENTIALS)

    await importClaudeFolders()
    assert.deepEqual(await claudeState(user), { '.credentials.json': REFRESHED })
    assert.isNull(await exists(old))
  })
})

/** A launch held open until `release`: `started` resolves once it holds the account's folder. */
function heldLaunch(user: User, play: (dir: string) => Promise<void>) {
  let release!: () => void
  let started!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const running = new Promise<void>((resolve) => {
    started = resolve
  })
  const done = withClaudeFolder(user, async (dir) => {
    await play(dir)
    started()
    await gate
  })
  return { running, release, done }
}

test.group('Claude subscription - a launch and the state around it', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('a launch never brings back a state dropped while it ran', async ({ assert }) => {
    const user = await makeUser()
    await saveClaudeState(user, { '.credentials.json': CREDENTIALS })
    const launch = heldLaunch(user, (dir) => writeFile(join(dir, '.credentials.json'), REFRESHED))
    await launch.running
    await deleteClaudeState(user)
    launch.release()
    await launch.done
    assert.isFalse(await hasClaudeState(user))
  })

  test('a launch never overwrites a state saved again while it ran', async ({ assert }) => {
    const user = await makeUser()
    await saveClaudeState(user, { '.credentials.json': CREDENTIALS })
    const launch = heldLaunch(user, (dir) => writeFile(join(dir, '.credentials.json'), REFRESHED))
    await launch.running
    await saveClaudeState(user, { '.credentials.json': '{"newer":true}' })
    launch.release()
    await launch.done
    assert.deepEqual(await claudeState(user), { '.credentials.json': '{"newer":true}' })
  })

  test('a file the binary was cut off writing keeps its saved content', async ({ assert }) => {
    const user = await makeUser()
    await saveClaudeState(user, { '.credentials.json': CREDENTIALS, '.claude.json': '{}' })
    await withClaudeFolder(user, async (dir) => {
      await writeFile(join(dir, '.credentials.json'), '{"claudeAiOauth":{"acc')
      await writeFile(join(dir, '.claude.json'), '{"numStartups":4}')
    })
    assert.deepEqual(await claudeState(user), {
      '.credentials.json': CREDENTIALS,
      '.claude.json': '{"numStartups":4}',
    })
  })

  test('a request gone while it waits for the account never launches', async ({ assert }) => {
    const user = await makeUser()
    await saveClaudeState(user, { '.credentials.json': CREDENTIALS })
    let release!: () => void
    const held = withClaudeLock(
      user,
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const controller = new AbortController()
    let launched = false
    const waiting = withClaudeFolder(
      user,
      async () => {
        launched = true
      },
      { signal: controller.signal },
    )
    setTimeout(() => controller.abort(), 50)
    await assert.rejects(() => waiting)
    release()
    await held
    assert.isFalse(launched)
  })
})

test.group('Claude subscription - import, edge cases', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('leaves a folder whose credentials cannot be read whole in place', async ({ assert }) => {
    const user = await makeUser()
    const cut = join(llmConfig.claudeCodeHome, String(user.id))
    await mkdir(cut, { recursive: true, mode: 0o700 })
    await writeFile(join(cut, '.credentials.json'), '{"claudeAiOauth":{"acc')
    const result = await importClaudeFolders()
    assert.isAtLeast(result.kept, 1)
    assert.isNotNull(await exists(cut))
    assert.isNull(await claudeState(user))
    await removeClaudeFolder(cut)
  })

  test('imports over a saved state that can no longer be read', async ({ assert }) => {
    const user = await makeUser()
    await saveClaudeState(user, { '.credentials.json': REFRESHED })
    await db
      .from('claude_code_states')
      .where('user_id', user.id)
      .update({ files: 'sealed-elsewhere' })
    const old = join(llmConfig.claudeCodeHome, String(user.id))
    await mkdir(old, { recursive: true, mode: 0o700 })
    await writeFile(join(old, '.credentials.json'), CREDENTIALS)
    await importClaudeFolders()
    assert.deepEqual(await claudeState(user), { '.credentials.json': CREDENTIALS })
    assert.isNull(await exists(old))
  })

  test('purges the launch folders a dead process left, never a recent one', async ({ assert }) => {
    const stale = join(llmConfig.claudeCodeHome, 'run-stale-fixture')
    const fresh = join(llmConfig.claudeCodeHome, 'run-fresh-fixture')
    for (const dir of [stale, fresh]) {
      await mkdir(dir, { recursive: true, mode: 0o700 })
      await writeFile(join(dir, '.credentials.json'), CREDENTIALS)
    }
    const old = new Date(Date.now() - 24 * 3600_000)
    await utimes(stale, old, old)
    const result = await importClaudeFolders()
    assert.isAtLeast(result.purged, 1)
    assert.isNull(await exists(stale))
    assert.isNotNull(await exists(fresh))
    await removeClaudeFolder(fresh)
  })
})
