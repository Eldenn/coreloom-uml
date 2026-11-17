import { createHmac, createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto'
import type { Logger } from '@adonisjs/core/logger'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { ApiClient } from '@japa/api-client'
import { test } from '@japa/runner'
import queue from '@nemoventures/adonis-jobs/services/main'
import {
  CODE_MAPS_QUEUE,
  CodeMapSource,
  CodeMapStatus,
  GITHUB_IMPORT_FAILURES,
} from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import GithubCodeMapFollow from '#app/code-maps/models/github-code-map-follow'
import type { GithubFollowOutput } from '#app/code-maps/validators/code-maps-output'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import { GithubFailure } from '#app/github/constants/github'
import GithubRepositoryGrant from '#app/github/models/github-repository-grant'
import GithubApi, {
  appJwt,
  type GithubConnection,
  type GithubResult,
} from '#app/github/services/github-api'
import {
  type GithubAppConfig,
  githubAppConfig,
  parsePrivateKey,
} from '#app/github/services/github-app-config'
import { createGithubState, safeReturnTo } from '#app/github/services/github-state'
import { verifyGithubSignature } from '#app/github/services/github-webhook'
import type {
  GithubConnectionCompleteOutput,
  GithubConnectionOutput,
} from '#app/github/validators/github-output'
import FollowGithubPushJob from '#app/jobs/follow-github-push_job'
import ImportGithubCodeMapJob from '#app/jobs/import-github-code-map_job'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import env from '#start/env'
import { ANALYZED_SHA, FakeAnalyzer, graphAnswer } from '#tests/helpers/fake-analyzer'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

/**
 * The GitHub App: connecting it (OAuth `code` → the repositories the user reaches), its webhook,
 * private repositories read with an installation token, and projects following pushes. GitHub is
 * never called: `GithubApi` is swapped for a fake recording what it was asked.
 */

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const WEBHOOK_SECRET = 'webhook-secret-for-tests'
const USER_TOKEN = 'ghu_UserTokenThatMustNeverBeStored0001'
const INSTALLATION_TOKEN = 'ghs_InstallationTokenNeverStored00001'
const CODE = 'a1b2c3d4e5f6'
const PUSH_SHA = 'fedcba9876543210fedcba9876543210fedcba98'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()

const APP_ENV = {
  GITHUB_APP_ID: '123456',
  GITHUB_APP_SLUG: 'coreloom-uml-test',
  GITHUB_APP_CLIENT_ID: 'Iv23liTestClient',
  GITHUB_APP_CLIENT_SECRET: 'client-secret-for-tests',
  GITHUB_APP_PRIVATE_KEY: PEM.replaceAll('\n', '\\n'),
  GITHUB_APP_WEBHOOK_SECRET: WEBHOOK_SECRET,
} as const

const SHOP = {
  installationId: 77,
  repositoryId: 9001,
  owner: 'Acme',
  name: 'Shop',
  private: true,
  defaultBranch: 'main',
}

/** Swaps the GitHub App's settings in, and back out after the test. */
function withGithubApp(values: Partial<Record<keyof typeof APP_ENV, string>> = APP_ENV) {
  const previous = Object.fromEntries(
    Object.keys(APP_ENV).map((key) => [key, env.get(key as never)]),
  )
  for (const key of Object.keys(APP_ENV)) env.set(key as never, '' as never)
  for (const [key, value] of Object.entries(values)) env.set(key as never, value as never)
  return () => {
    for (const [key, value] of Object.entries(previous))
      env.set(key as never, (value ?? '') as never)
  }
}

class FakeGithubApi extends GithubApi {
  calls: string[] = []
  codeAnswer: GithubResult<string> = { ok: true, value: USER_TOKEN }
  connection: GithubResult<GithubConnection> = {
    ok: true,
    value: { user: { id: 501, login: 'octo' }, accounts: ['Acme'], repositories: [SHOP] },
  }
  tokenAnswer: GithubResult<string> = { ok: true, value: INSTALLATION_TOKEN }

  override async exchangeCode(_config: GithubAppConfig, code: string) {
    this.calls.push(`exchange:${code}`)
    return this.codeAnswer
  }

  override async readConnection(token: string) {
    this.calls.push(`read:${token === USER_TOKEN ? 'user-token' : 'other'}`)
    return this.connection
  }

  override async revokeUserToken(_config: GithubAppConfig, token: string) {
    this.calls.push(`revoke-user:${token === USER_TOKEN ? 'user-token' : 'other'}`)
  }

  override async installationToken(
    _config: GithubAppConfig,
    installation: number,
    repository: number,
  ) {
    this.calls.push(`installation-token:${String(installation)}:${String(repository)}`)
    return this.tokenAnswer
  }

  override async revokeInstallationToken(token: string) {
    this.calls.push(`revoke-installation:${token === INSTALLATION_TOKEN ? 'token' : 'other'}`)
  }
}

function useFakeGithub() {
  const fake = new FakeGithubApi()
  app.container.swap(GithubApi, () => fake)
  return fake
}

async function setup(flag = true) {
  const user = await User.create({
    email: `gh-app-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  if (flag) await updateFlag(FeatureFlagKey.CodeMaps, ON, user)
  const project = await Project.create({ userId: user.id, name: 'Shop', description: null })
  return { user, project }
}

function grant(user: User, overrides: Partial<typeof SHOP> = {}) {
  const repository = { ...SHOP, ...overrides }
  return GithubRepositoryGrant.create({
    userId: user.id,
    githubUserId: 501,
    githubLogin: 'octo',
    installationId: repository.installationId,
    repositoryId: repository.repositoryId,
    owner: repository.owner,
    name: repository.name,
    private: repository.private,
    defaultBranch: repository.defaultBranch,
  })
}

function follow(user: User, project: Project, branch: string | null = null) {
  return GithubCodeMapFollow.create({
    projectId: project.id,
    userId: user.id,
    repositoryId: SHOP.repositoryId,
    repositoryUrl: 'https://github.com/Acme/Shop',
    branch,
  })
}

function sign(body: string, secret = WEBHOOK_SECRET) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

function silentLogger() {
  return { info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger
}

async function runImport(codeMapId: number, attempt = 1) {
  const job = new ImportGithubCodeMapJob()
  job.data = { codeMapId }
  job.logger = silentLogger()
  job.job = { attemptsMade: attempt - 1, opts: { attempts: 3 } } as unknown as typeof job.job
  try {
    await job.process()
    return null
  } catch (error) {
    job.job = { attemptsMade: attempt, opts: { attempts: 3 } } as unknown as typeof job.job
    job.error = error as Error
    await job.onFailed()
    return error as Error
  }
}

async function runPush(data: Partial<FollowGithubPushJob['data']> = {}) {
  const job = new FollowGithubPushJob()
  job.data = {
    repositoryId: SHOP.repositoryId,
    branch: 'main',
    defaultBranch: 'main',
    commit: PUSH_SHA,
    ...data,
  }
  job.logger = silentLogger()
  await job.process()
}

test.group('GitHub App: settings and signatures', (group) => {
  group.each.setup(() => withGithubApp())

  test('reads the private key with its line breaks escaped, as is, or in base64', async ({
    assert,
  }) => {
    assert.isNotNull(parsePrivateKey(PEM))
    assert.isNotNull(parsePrivateKey(PEM.replaceAll('\n', '\\n')))
    assert.isNotNull(parsePrivateKey(Buffer.from(PEM).toString('base64')))
    assert.isNull(parsePrivateKey('not a key'))
    assert.isNotNull(await githubAppConfig())
  })

  test('is off while one setting is missing', async ({ assert }) => {
    const restore = withGithubApp({ ...APP_ENV, GITHUB_APP_WEBHOOK_SECRET: '' })
    assert.isNull(await githubAppConfig())
    restore()
  })

  test("signs the App's token with its key, valid under ten minutes", async ({ assert }) => {
    const config = await githubAppConfig()
    if (!config) throw new Error('no config')
    const now = Date.UTC(2026, 10, 17, 12)
    const [header, payload, signature] = appJwt(config, now).split('.') as [string, string, string]
    const verifier = createVerify('RSA-SHA256')
    verifier.update(`${header}.${payload}`)
    assert.isTrue(
      verifier.verify(
        createPublicKey(publicKey.export({ type: 'spki', format: 'pem' })),
        Buffer.from(signature, 'base64url'),
      ),
    )
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<
      string,
      number | string
    >
    assert.equal(claims.iss, '123456')
    assert.isBelow(Number(claims.exp) - Number(claims.iat), 600 + 1)
    assert.isAbove(Number(claims.exp), now / 1000)
  })

  test('checks the webhook signature over the raw body', ({ assert }) => {
    const body = '{"zen":"Keep it logically awesome."}'
    assert.isTrue(verifyGithubSignature(body, sign(body), WEBHOOK_SECRET))
    assert.isFalse(verifyGithubSignature(`${body} `, sign(body), WEBHOOK_SECRET))
    assert.isFalse(verifyGithubSignature(body, sign(body, 'other'), WEBHOOK_SECRET))
    assert.isFalse(verifyGithubSignature(body, undefined, WEBHOOK_SECRET))
    assert.isFalse(verifyGithubSignature(body, 'sha256=abcd', WEBHOOK_SECRET))
    assert.isFalse(
      verifyGithubSignature(body, sign(body).replace('sha256=', 'sha1='), WEBHOOK_SECRET),
    )
  })

  test('only comes back to a path of the web app', ({ assert }) => {
    assert.equal(safeReturnTo('/projects/3?tab=code'), '/projects/3?tab=code')
    for (const bad of [
      'https://evil.io',
      '//evil.io',
      '/\\evil.io',
      'projects',
      '/a\nb',
      undefined,
    ]) {
      assert.equal(safeReturnTo(bad), '/projects', String(bad))
    }
  })
})

test.group('GitHub App: connection', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => withGithubApp())
  group.each.teardown(() => app.container.restore(GithubApi))

  test('says the App is off when it is not set up', async ({ client, assert }) => {
    const restore = withGithubApp({})
    const { user } = await setup()
    const response = await client.get('/github/connection').headers(json).loginAs(user)
    response.assertStatus(200)
    assert.deepEqual(response.body() as GithubConnectionOutput, {
      available: false,
      login: null,
      repositories: [],
    })
    const start = await client
      .post('/github/connection/start')
      .headers(json)
      .loginAs(user)
      .json({ target: 'install' })
    start.assertStatus(404)
    restore()
  })

  test('starts on the install or the authorization page, with a state', async ({
    client,
    assert,
  }) => {
    const { user } = await setup()
    const install = await client
      .post('/github/connection/start')
      .headers(json)
      .loginAs(user)
      .json({ target: 'install', returnTo: '/projects/1?tab=code' })
    install.assertStatus(200)
    const installUrl = new URL((install.body() as { url: string }).url)
    assert.equal(
      installUrl.origin + installUrl.pathname,
      'https://github.com/apps/coreloom-uml-test/installations/new',
    )
    assert.isNotEmpty(installUrl.searchParams.get('state'))

    const authorize = await client
      .post('/github/connection/start')
      .headers(json)
      .loginAs(user)
      .json({ target: 'authorize' })
    const authorizeUrl = new URL((authorize.body() as { url: string }).url)
    assert.equal(
      authorizeUrl.origin + authorizeUrl.pathname,
      'https://github.com/login/oauth/authorize',
    )
    assert.equal(authorizeUrl.searchParams.get('client_id'), 'Iv23liTestClient')
    assert.isNotEmpty(authorizeUrl.searchParams.get('state'))
  })

  test('carries the page to come back to from an installation to the authorization', async ({
    client,
    assert,
  }) => {
    const github = useFakeGithub()
    const { user } = await setup()
    const started = await client
      .post('/github/connection/start')
      .headers(json)
      .loginAs(user)
      .json({ target: 'authorize', state: createGithubState(user, '/projects/9?tab=code') })
    const state = new URL((started.body() as { url: string }).url).searchParams.get('state') ?? ''
    const done = await client
      .post('/github/connection')
      .headers(json)
      .loginAs(user)
      .json({ code: CODE, state })
    assert.equal((done.body() as GithubConnectionCompleteOutput).returnTo, '/projects/9?tab=code')
    assert.include(github.calls, `exchange:${CODE}`)
  })

  test('keeps the repositories the user reaches, never the token', async ({ client, assert }) => {
    const github = useFakeGithub()
    const { user } = await setup()
    const logs = captureLogs()
    const response = await client
      .post('/github/connection')
      .headers(json)
      .loginAs(user)
      .json({ code: CODE, state: createGithubState(user, '/projects/4?tab=code') })
      .finally(() => logs.restore())
    response.assertStatus(200)
    const body = response.body() as GithubConnectionCompleteOutput
    assert.equal(body.returnTo, '/projects/4?tab=code')
    assert.equal(body.login, 'octo')
    assert.deepEqual(body.repositories, [
      {
        id: 9001,
        owner: 'Acme',
        name: 'Shop',
        url: 'https://github.com/Acme/Shop',
        private: true,
        defaultBranch: 'main',
      },
    ])
    assert.deepEqual(github.calls, [
      `exchange:${CODE}`,
      'read:user-token',
      'revoke-user:user-token',
    ])
    const database = await dumpDatabase()
    assert.notInclude(database, USER_TOKEN)
    assert.notInclude(logs.lines.join('\n'), USER_TOKEN)
    assert.notInclude(JSON.stringify(body), USER_TOKEN)

    // A new connection replaces the list.
    github.connection = {
      ok: true,
      value: { user: { id: 501, login: 'octo' }, accounts: [], repositories: [] },
    }
    await client
      .post('/github/connection')
      .headers(json)
      .loginAs(user)
      .json({ code: CODE, state: createGithubState(user, undefined) })
      .then((r) => r.assertStatus(200))
    assert.lengthOf(await GithubRepositoryGrant.query().where('userId', user.id), 0)
  })

  test('refuses a state made for someone else, or forged', async ({ client, assert }) => {
    const github = useFakeGithub()
    const { user } = await setup()
    const { user: other } = await setup()
    for (const state of [createGithubState(other, undefined), 'forged-state']) {
      const response = await client
        .post('/github/connection')
        .headers(json)
        .loginAs(user)
        .json({ code: CODE, state })
      response.assertStatus(422)
    }
    assert.deepEqual(github.calls, [])
  })

  test('says why GitHub refused, and revokes the token whatever happens', async ({
    client,
    assert,
  }) => {
    const github = useFakeGithub()
    const { user } = await setup()
    github.codeAnswer = { ok: false, failure: GithubFailure.Denied }
    const denied = await client
      .post('/github/connection')
      .headers(json)
      .loginAs(user)
      .json({ code: CODE, state: createGithubState(user, undefined) })
    denied.assertStatus(422)

    github.codeAnswer = { ok: true, value: USER_TOKEN }
    github.connection = { ok: false, failure: GithubFailure.Unreachable }
    const down = await client
      .post('/github/connection')
      .headers(json)
      .loginAs(user)
      .json({ code: CODE, state: createGithubState(user, undefined) })
    down.assertStatus(502)
    assert.include(github.calls, 'revoke-user:user-token')
  })

  test('disconnecting forgets the repositories and stops following', async ({ client, assert }) => {
    const { user, project } = await setup()
    await grant(user)
    await follow(user, project)
    const response = await client.delete('/github/connection').headers(json).loginAs(user)
    response.assertStatus(204)
    assert.lengthOf(await GithubRepositoryGrant.query().where('userId', user.id), 0)
    assert.isNull(await GithubCodeMapFollow.findBy('projectId', project.id))
  })

  test('404 while the flag is off', async ({ client }) => {
    const { user } = await setup(false)
    const response = await client.get('/github/connection').headers(json).loginAs(user)
    response.assertStatus(404)
  })
})

test.group('GitHub App: webhook', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => withGithubApp())
  group.each.setup(async () => {
    await queue.useQueue(CODE_MAPS_QUEUE).drain(true)
    return () => queue.useQueue(CODE_MAPS_QUEUE).drain(true)
  })

  function deliver(client: ApiClient, event: string, payload: object, signature?: string) {
    const body = JSON.stringify(payload)
    return client
      .post('/github/webhook')
      .header('content-type', 'application/json')
      .header('x-github-event', event)
      .header('x-github-delivery', 'delivery-1')
      .header('x-hub-signature-256', signature ?? sign(body))
      .json(payload)
  }

  test('refuses a delivery whose signature does not match', async ({ client }) => {
    const response = await deliver(client, 'ping', { zen: 'x' }, sign('{}'))
    response.assertStatus(401)
  })

  test('404 when the App is not set up', async ({ client }) => {
    const restore = withGithubApp({})
    const response = await deliver(client, 'ping', { zen: 'x' })
    response.assertStatus(404)
    restore()
  })

  test('queues a push on a followed repository, ignores the others', async ({ client, assert }) => {
    const { user, project } = await setup()
    await follow(user, project)
    const push = {
      ref: 'refs/heads/main',
      after: PUSH_SHA,
      deleted: false,
      repository: { id: SHOP.repositoryId, default_branch: 'main' },
    }
    const queued = await deliver(client, 'push', push)
    queued.assertStatus(202)
    assert.deepEqual(queued.body(), { outcome: 'queued' })
    const jobs = await queue.useQueue(CODE_MAPS_QUEUE).getJobs(['waiting', 'delayed'])
    const job = jobs.find((entry) => entry.name === 'FollowGithubPushJob')
    assert.deepEqual(job?.data, {
      repositoryId: SHOP.repositoryId,
      branch: 'main',
      defaultBranch: 'main',
      commit: PUSH_SHA,
    })

    for (const payload of [
      { ...push, repository: { id: 1, default_branch: 'main' } },
      { ...push, deleted: true },
      { ...push, ref: 'refs/tags/v1' },
      { ...push, ref: 'refs/heads/--upload-pack=x' },
      { ...push, after: 'not-a-sha' },
    ]) {
      const ignored = await deliver(client, 'push', payload)
      assert.deepEqual(ignored.body(), { outcome: 'ignored' })
    }
  })

  test('forgets what GitHub took away', async ({ client, assert }) => {
    const { user } = await setup()
    await grant(user)
    await grant(user, { repositoryId: 9002, name: 'Api' })
    await grant(user, { installationId: 78, repositoryId: 9003, name: 'Other' })

    await deliver(client, 'installation_repositories', {
      action: 'removed',
      installation: { id: 77 },
      repositories_removed: [{ id: 9002 }],
    }).then((r) => r.assertStatus(202))
    let left = (await GithubRepositoryGrant.query().where('userId', user.id)).map(
      (g) => g.repositoryId,
    )
    assert.sameMembers(left, [9001, 9003])

    await deliver(client, 'installation', { action: 'deleted', installation: { id: 77 } })
    left = (await GithubRepositoryGrant.query().where('userId', user.id)).map((g) => g.repositoryId)
    assert.sameMembers(left, [9003])

    await deliver(client, 'github_app_authorization', { action: 'revoked', sender: { id: 501 } })
    assert.lengthOf(await GithubRepositoryGrant.query().where('userId', user.id), 0)
  })
})

test.group('GitHub App: private repositories and follows', (group) => {
  let analyzer: FakeAnalyzer
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => withGithubApp())
  group.each.setup(async () => {
    drive.fake()
    analyzer = new FakeAnalyzer()
    const previous = env.get('ANALYZER_URL')
    env.set('ANALYZER_URL', await analyzer.start())
    await queue.useQueue(CODE_MAPS_QUEUE).drain(true)
    return async () => {
      drive.restore()
      app.container.restore(GithubApi)
      await analyzer.stop()
      env.set('ANALYZER_URL', previous ?? '')
      await queue.useQueue(CODE_MAPS_QUEUE).drain(true)
    }
  })

  test('follows a repository the App reaches, under its GitHub name', async ({
    client,
    assert,
  }) => {
    const { user, project } = await setup()
    await grant(user)
    const response = await client
      .post(`/projects/${project.id}/code-maps/github`)
      .headers(json)
      .loginAs(user)
      .json({ url: 'https://github.com/acme/shop', follow: true })
    response.assertStatus(202)
    assert.equal(
      (response.body() as { codeMap: { repositoryUrl: string } }).codeMap.repositoryUrl,
      'https://github.com/Acme/Shop',
    )

    const shown = await client
      .get(`/projects/${project.id}/code-maps/github/follow`)
      .headers(json)
      .loginAs(user)
    assert.deepEqual((shown.body() as { follow: GithubFollowOutput }).follow, {
      repositoryUrl: 'https://github.com/Acme/Shop',
      branch: null,
      active: true,
    })

    await GithubRepositoryGrant.query().where('userId', user.id).delete()
    const inactive = await client
      .get(`/projects/${project.id}/code-maps/github/follow`)
      .headers(json)
      .loginAs(user)
    assert.isFalse((inactive.body() as { follow: GithubFollowOutput }).follow.active)

    const stopped = await client
      .delete(`/projects/${project.id}/code-maps/github/follow`)
      .headers(json)
      .loginAs(user)
    stopped.assertStatus(204)
    const none = await client
      .get(`/projects/${project.id}/code-maps/github/follow`)
      .headers(json)
      .loginAs(user)
    assert.isNull((none.body() as { follow: null }).follow)
  })

  test('cannot follow a repository the App does not reach', async ({ client, assert }) => {
    const { user, project } = await setup()
    const response = await client
      .post(`/projects/${project.id}/code-maps/github`)
      .headers(json)
      .loginAs(user)
      .json({ url: 'https://github.com/acme/shop', follow: true })
    response.assertStatus(422)
    assert.lengthOf(await CodeMap.query().where('projectId', project.id), 0)
  })

  test("another user's follow stays out of reach", async ({ client }) => {
    const { user, project } = await setup()
    await follow(user, project)
    const { user: stranger } = await setup()
    const response = await client
      .delete(`/projects/${project.id}/code-maps/github/follow`)
      .headers(json)
      .loginAs(stranger)
    response.assertStatus(404)
  })

  test('reads a private repository with a token made for it, then revoked', async ({ assert }) => {
    const github = useFakeGithub()
    const { user, project } = await setup()
    await grant(user)
    const codeMap = await pendingMap(user, project)
    analyzer.answers.push(graphAnswer())
    const logs = captureLogs()
    try {
      assert.isNull(await runImport(codeMap.id))
    } finally {
      logs.restore()
    }
    assert.deepEqual(github.calls, ['installation-token:77:9001', 'revoke-installation:token'])
    assert.equal(analyzer.requests[0]?.token, INSTALLATION_TOKEN)
    assert.equal((await CodeMap.findOrFail(codeMap.id)).status, CodeMapStatus.Ready)
    assert.notInclude(await dumpDatabase(), INSTALLATION_TOKEN)
    assert.notInclude(logs.lines.join('\n'), INSTALLATION_TOKEN)
  })

  test('a public repository is read without a token', async ({ assert }) => {
    const github = useFakeGithub()
    const { user, project } = await setup()
    const codeMap = await pendingMap(user, project)
    analyzer.answers.push(graphAnswer())
    assert.isNull(await runImport(codeMap.id))
    assert.deepEqual(github.calls, [])
    assert.notProperty(analyzer.requests[0] ?? {}, 'token')
  })

  test('the token is revoked when the analyzer fails too', async ({ assert }) => {
    const github = useFakeGithub()
    const { user, project } = await setup()
    await grant(user)
    const codeMap = await pendingMap(user, project)
    analyzer.answers.push({ status: 422, body: { error: { code: 'not_found' } } })
    await runImport(codeMap.id)
    assert.include(github.calls, 'revoke-installation:token')
    assert.equal((await CodeMap.findOrFail(codeMap.id)).status, CodeMapStatus.Failed)
  })

  test('fails the map when GitHub refuses the token, retries when it is down', async ({
    assert,
  }) => {
    const github = useFakeGithub()
    const { user, project } = await setup()
    await grant(user)
    github.tokenAnswer = { ok: false, failure: GithubFailure.Denied }
    const refused = await pendingMap(user, project)
    await runImport(refused.id)
    const row = await CodeMap.findOrFail(refused.id)
    assert.equal(row.status, CodeMapStatus.Failed)
    assert.equal(row.failureReason, GITHUB_IMPORT_FAILURES.githubAccess)
    assert.lengthOf(analyzer.requests, 0)

    github.tokenAnswer = { ok: false, failure: GithubFailure.Unreachable }
    const down = await pendingMap(user, project)
    assert.isNotNull(await runImport(down.id, 1))
    assert.equal((await CodeMap.findOrFail(down.id)).status, CodeMapStatus.Running)
    await runImport(down.id, 3)
    const last = await CodeMap.findOrFail(down.id)
    assert.equal(last.status, CodeMapStatus.Failed)
    assert.equal(last.failureReason, GITHUB_IMPORT_FAILURES.githubUnreachable)
  })

  test('a push reads the followed branch again', async ({ assert }) => {
    const { user, project } = await setup()
    await grant(user)
    await follow(user, project)
    await runPush()
    const maps = await CodeMap.query().where('projectId', project.id)
    assert.lengthOf(maps, 1)
    assert.include(maps[0]?.$attributes, {
      source: CodeMapSource.Github,
      status: CodeMapStatus.Pending,
      repositoryUrl: 'https://github.com/Acme/Shop',
      branch: null,
    })
    const jobs = await queue.useQueue(CODE_MAPS_QUEUE).getJobs(['waiting', 'delayed'])
    assert.isTrue(
      jobs.some(
        (job) => job.name === 'ImportGithubCodeMapJob' && job.data.codeMapId === maps[0]?.id,
      ),
    )

    // A map already waiting reads the newest commit: no second one.
    await runPush()
    assert.lengthOf(await CodeMap.query().where('projectId', project.id), 1)
  })

  test('a push is skipped for another branch, a known commit, or a lost repository', async ({
    assert,
  }) => {
    const { user, project } = await setup()
    await grant(user)
    await follow(user, project, 'release')
    await runPush({ branch: 'main' })
    assert.lengthOf(await CodeMap.query().where('projectId', project.id), 0)

    const ready = await pendingMap(user, project)
    ready.merge({ status: CodeMapStatus.Ready, commitSha: PUSH_SHA })
    await ready.save()
    await runPush({ branch: 'release' })
    assert.lengthOf(await CodeMap.query().where('projectId', project.id), 1)

    await GithubRepositoryGrant.query().where('userId', user.id).delete()
    await runPush({ branch: 'release', commit: ANALYZED_SHA })
    assert.lengthOf(await CodeMap.query().where('projectId', project.id), 1)
  })
})

function pendingMap(user: User, project: Project) {
  return CodeMap.create({
    projectId: project.id,
    userId: user.id,
    source: CodeMapSource.Github,
    repositoryUrl: 'https://github.com/Acme/Shop',
    branch: null,
    commitSha: null,
    extractor: 'graphify',
    extractorVersion: '0.9.108',
    status: CodeMapStatus.Pending,
    failureReason: null,
    nodeCount: 0,
    edgeCount: 0,
    storageKey: null,
  })
}
