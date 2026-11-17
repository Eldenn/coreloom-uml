import { generateKeyPairSync } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import GithubCodeMapFollow from '#app/code-maps/models/github-code-map-follow'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import { GithubFailure } from '#app/github/constants/github'
import GithubAppRegistration from '#app/github/models/github-app-registration'
import GithubRepositoryGrant from '#app/github/models/github-repository-grant'
import GithubApi, {
  appJwt,
  type GithubCreatedApp,
  type GithubResult,
} from '#app/github/services/github-api'
import { githubAppConfig } from '#app/github/services/github-app-config'
import { createManifestState, reachable } from '#app/github/services/github-app-manifest'
import type {
  GithubAppManifestOutput,
  GithubAppStatusOutput,
} from '#app/github/validators/github-output'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import env from '#start/env'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

/**
 * The GitHub App created from the settings (GitHub's manifest flow): the manifest the browser
 * posts, the code traded for the App's secrets (stored encrypted, never answered), the environment
 * winning over it, and its removal. GitHub is never called.
 */

const json = { accept: 'application/json' }
const ADMIN = 'github-app-admin@example.com'
const ON = { enabled: true, rollout: 100, rules: [] }
const CODE = 'manifestcode0123'
const CLIENT_SECRET = 'client-secret-from-the-manifest-0001'
const WEBHOOK_SECRET = 'webhook-secret-from-the-manifest-0001'
const ENV_KEYS = [
  'GITHUB_APP_ID',
  'GITHUB_APP_SLUG',
  'GITHUB_APP_CLIENT_ID',
  'GITHUB_APP_CLIENT_SECRET',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_APP_WEBHOOK_SECRET',
  'API_URL',
] as const

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
const PEM_BODY = PEM.split('\n')[1] ?? ''

const CREATED: GithubCreatedApp = {
  appId: 424242,
  slug: 'coreloom-uml-example',
  name: 'Coreloom UML (example)',
  clientId: 'Iv23liManifest',
  owner: { login: 'Acme', type: 'Organization' },
  credentials: { clientSecret: CLIENT_SECRET, privateKey: PEM, webhookSecret: WEBHOOK_SECRET },
}

class FakeGithubApi extends GithubApi {
  calls: string[] = []
  answer: GithubResult<GithubCreatedApp> = { ok: true, value: CREATED }

  override async convertManifest(code: string) {
    this.calls.push(`convert:${code}`)
    return this.answer
  }
}

function useFakeGithub() {
  const fake = new FakeGithubApi()
  app.container.swap(GithubApi, () => fake)
  return fake
}

/** Empties the App's variables (and API_URL) for the test, and puts them back after. */
function withoutEnvironmentApp(values: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, env.get(key)]))
  for (const key of ENV_KEYS) env.set(key, '' as never)
  for (const [key, value] of Object.entries(values)) env.set(key as never, value as never)
  return () => {
    for (const [key, value] of Object.entries(previous))
      env.set(key as never, (value ?? '') as never)
  }
}

async function makeUser(email = `gh-settings-${Math.random().toString(36).slice(2)}@example.com`) {
  const user = await User.create({ email, password: 'a-very-strong-passphrase' })
  await updateFlag(FeatureFlagKey.CodeMaps, ON, user)
  return user
}

async function admin() {
  return (await User.findBy('email', ADMIN)) ?? makeUser(ADMIN)
}

test.group('GitHub App: created from the settings', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => {
    env.set('DEFAULT_ACCOUNT_EMAIL', ADMIN)
    env.set('DEFAULT_ACCOUNT_PASSWORD', 'the-default-passphrase')
    return () => {
      env.set('DEFAULT_ACCOUNT_EMAIL', '')
      env.set('DEFAULT_ACCOUNT_PASSWORD', '')
    }
  })
  group.each.setup(() => withoutEnvironmentApp({ API_URL: 'https://api.uml.example.com' }))
  group.each.teardown(async () => {
    app.container.restore(GithubApi)
    await GithubAppRegistration.query().delete()
  })

  test('is for the admin only', async ({ client }) => {
    const user = await makeUser()
    ;(await client.get('/admin/github-app').headers(json)).assertStatus(401)
    ;(await client.get('/admin/github-app').headers(json).loginAs(user)).assertStatus(404)
    ;(
      await client.post('/admin/github-app/manifest').headers(json).json({}).loginAs(user)
    ).assertStatus(404)
    ;(
      await client
        .post('/admin/github-app')
        .headers(json)
        .json({ code: CODE, state: createManifestState(user) })
        .loginAs(user)
    ).assertStatus(404)
    ;(await client.delete('/admin/github-app').headers(json).loginAs(user)).assertStatus(404)
  })

  test('says there is no App yet, and where GitHub would deliver', async ({ client, assert }) => {
    const response = await client
      .get('/admin/github-app')
      .headers(json)
      .loginAs(await admin())
    response.assertStatus(200)
    assert.deepEqual(response.body() as GithubAppStatusOutput, {
      source: null,
      app: null,
      webhookUrl: 'https://api.uml.example.com/github/webhook',
      webhookReachable: true,
    })
  })

  test('gives the manifest and the GitHub page to post it to', async ({ client, assert }) => {
    const response = await client
      .post('/admin/github-app/manifest')
      .headers(json)
      .json({ organization: 'Acme', public: true })
      .loginAs(await admin())
    response.assertStatus(200)
    const body = response.body() as GithubAppManifestOutput
    const url = new URL(body.url)
    assert.equal(
      url.origin + url.pathname,
      'https://github.com/organizations/Acme/settings/apps/new',
    )
    assert.isNotEmpty(url.searchParams.get('state'))
    assert.deepEqual(body.manifest, {
      name: 'Coreloom UML (localhost)',
      url: 'http://localhost:5173',
      description: 'Reads the repositories it is installed on to map their code in Coreloom UML.',
      public: true,
      redirect_url: 'http://localhost:5173/github/app-created',
      callback_urls: ['http://localhost:5173/github/callback'],
      setup_url: 'http://localhost:5173/github/callback',
      setup_on_update: true,
      request_oauth_on_install: false,
      default_permissions: { contents: 'read', metadata: 'read' },
      default_events: ['push'],
      hook_attributes: { url: 'https://api.uml.example.com/github/webhook', active: true },
    })

    const own = await client
      .post('/admin/github-app/manifest')
      .headers(json)
      .json({})
      .loginAs(await admin())
    const ownBody = own.body() as GithubAppManifestOutput
    assert.isTrue(ownBody.url.startsWith('https://github.com/settings/apps/new?state='))
    assert.isFalse(ownBody.manifest.public)
  })

  test('leaves the webhook out when GitHub cannot reach the API', async ({ client, assert }) => {
    env.set('API_URL', 'http://localhost:3333')
    const response = await client
      .post('/admin/github-app/manifest')
      .headers(json)
      .json({})
      .loginAs(await admin())
    const body = response.body() as GithubAppManifestOutput
    assert.notProperty(body.manifest, 'hook_attributes')
    assert.deepEqual(body.manifest.default_events, [])
    for (const url of [
      'http://api.example.com',
      'https://localhost',
      'https://127.0.0.1:3333',
      'https://10.0.0.4',
      'https://192.168.1.2',
      'https://172.20.0.3',
      'https://api.local',
      'https://[::1]:3333',
    ]) {
      assert.isFalse(reachable(url), url)
    }
    assert.isTrue(reachable('https://api.uml.example.com'))
  })

  test('refuses an organization GitHub would not accept', async ({ client }) => {
    const response = await client
      .post('/admin/github-app/manifest')
      .headers(json)
      .json({ organization: '../evil' })
      .loginAs(await admin())
    response.assertStatus(422)
  })

  test('keeps the App GitHub created, its secrets encrypted and never answered', async ({
    client,
    assert,
  }) => {
    const github = useFakeGithub()
    const user = await admin()
    const logs = captureLogs()
    const response = await client
      .post('/admin/github-app')
      .headers(json)
      .json({ code: CODE, state: createManifestState(user) })
      .loginAs(user)
      .finally(() => logs.restore())
    response.assertStatus(200)
    assert.deepEqual(github.calls, [`convert:${CODE}`])
    const body = response.body() as GithubAppStatusOutput
    assert.equal(body.source, 'settings')
    assert.deepEqual(body.app, {
      appId: 424242,
      slug: 'coreloom-uml-example',
      name: 'Coreloom UML (example)',
      owner: { login: 'Acme', type: 'Organization' },
      pageUrl: 'https://github.com/apps/coreloom-uml-example',
      settingsUrl: 'https://github.com/organizations/Acme/settings/apps/coreloom-uml-example',
      webhook: true,
    })

    for (const secret of [CLIENT_SECRET, WEBHOOK_SECRET, PEM_BODY]) {
      assert.notInclude(JSON.stringify(body), secret)
      assert.notInclude(await dumpDatabase(), secret)
      assert.notInclude(logs.lines.join('\n'), secret)
    }
    const shown = await client.get('/admin/github-app').headers(json).loginAs(user)
    for (const secret of [CLIENT_SECRET, WEBHOOK_SECRET, PEM_BODY])
      assert.notInclude(JSON.stringify(shown.body()), secret)

    // The rest of the server uses it, the API and the queue worker alike.
    const config = await githubAppConfig()
    assert.equal(config?.appId, '424242')
    assert.equal(config?.clientSecret, CLIENT_SECRET)
    assert.equal(config?.webhookSecret, WEBHOOK_SECRET)
    if (config) assert.match(appJwt(config), /^[\w-]+\.[\w-]+\.[\w-]+$/)
    const connection = await client
      .get('/github/connection')
      .headers(json)
      .loginAs(await makeUser())
    assert.isTrue(connection.body().available)

    // One App at a time.
    const again = await client
      .post('/admin/github-app/manifest')
      .headers(json)
      .json({})
      .loginAs(user)
    again.assertStatus(409)
  })

  test('refuses a state made for someone else, or forged', async ({ client, assert }) => {
    const github = useFakeGithub()
    const other = await makeUser()
    for (const state of [createManifestState(other), 'forged']) {
      const response = await client
        .post('/admin/github-app')
        .headers(json)
        .json({ code: CODE, state })
        .loginAs(await admin())
      response.assertStatus(422)
    }
    assert.deepEqual(github.calls, [])
    assert.isNull(await GithubAppRegistration.first())
  })

  test('says why GitHub refused the code', async ({ client, assert }) => {
    const github = useFakeGithub()
    const user = await admin()
    github.answer = { ok: false, failure: GithubFailure.Denied }
    ;(
      await client
        .post('/admin/github-app')
        .headers(json)
        .json({ code: CODE, state: createManifestState(user) })
        .loginAs(user)
    ).assertStatus(422)
    github.answer = { ok: false, failure: GithubFailure.Unreachable }
    ;(
      await client
        .post('/admin/github-app')
        .headers(json)
        .json({ code: CODE, state: createManifestState(user) })
        .loginAs(user)
    ).assertStatus(502)
    assert.isNull(await GithubAppRegistration.first())
  })

  test('the environment wins, and cannot be changed here', async ({ client, assert }) => {
    useFakeGithub()
    const user = await admin()
    await client
      .post('/admin/github-app')
      .headers(json)
      .json({ code: CODE, state: createManifestState(user) })
      .loginAs(user)
      .then((r) => r.assertStatus(200))

    env.set('GITHUB_APP_ID', '123456')
    env.set('GITHUB_APP_SLUG', 'from-the-environment')
    env.set('GITHUB_APP_CLIENT_ID', 'Iv23liEnv')
    env.set('GITHUB_APP_CLIENT_SECRET', 'env-client-secret')
    env.set('GITHUB_APP_PRIVATE_KEY', PEM.replaceAll('\n', '\\n'))
    env.set('GITHUB_APP_WEBHOOK_SECRET', 'env-webhook-secret')
    const response = await client.get('/admin/github-app').headers(json).loginAs(user)
    const body = response.body() as GithubAppStatusOutput
    assert.equal(body.source, 'environment')
    assert.equal(body.app?.slug, 'from-the-environment')
    assert.isNull(body.app?.owner)
    assert.isNull(body.app?.settingsUrl)
    ;(
      await client.post('/admin/github-app/manifest').headers(json).json({}).loginAs(user)
    ).assertStatus(409)
    ;(await client.delete('/admin/github-app').headers(json).loginAs(user)).assertStatus(409)
    assert.equal((await githubAppConfig())?.slug, 'from-the-environment')
  })

  test('an App made without a webhook takes no delivery', async ({ client }) => {
    const github = useFakeGithub()
    const user = await admin()
    github.answer = {
      ok: true,
      value: { ...CREATED, credentials: { ...CREATED.credentials, webhookSecret: null } },
    }
    await client
      .post('/admin/github-app')
      .headers(json)
      .json({ code: CODE, state: createManifestState(user) })
      .loginAs(user)
      .then((r) => r.assertStatus(200))
    const status = await client.get('/admin/github-app').headers(json).loginAs(user)
    status.assertBodyContains({ app: { webhook: false } })
    const delivery = await client
      .post('/github/webhook')
      .header('content-type', 'application/json')
      .header('x-github-event', 'ping')
      .header('x-hub-signature-256', 'sha256=00')
      .json({ zen: 'x' })
    delivery.assertStatus(404)
  })

  test('removing it forgets what every user read through it', async ({ client, assert }) => {
    useFakeGithub()
    const user = await admin()
    await client
      .post('/admin/github-app')
      .headers(json)
      .json({ code: CODE, state: createManifestState(user) })
      .loginAs(user)
      .then((r) => r.assertStatus(200))
    const member = await makeUser()
    const project = await Project.create({ userId: member.id, name: 'Shop', description: null })
    await GithubRepositoryGrant.create({
      userId: member.id,
      githubUserId: 501,
      githubLogin: 'octo',
      installationId: 77,
      repositoryId: 9001,
      owner: 'Acme',
      name: 'Shop',
      private: true,
      defaultBranch: 'main',
    })
    await GithubCodeMapFollow.create({
      projectId: project.id,
      userId: member.id,
      repositoryId: 9001,
      repositoryUrl: 'https://github.com/Acme/Shop',
      branch: null,
    })

    ;(await client.delete('/admin/github-app').headers(json).loginAs(user)).assertStatus(204)
    assert.isNull(await githubAppConfig())
    assert.lengthOf(await GithubRepositoryGrant.query().where('userId', member.id), 0)
    assert.lengthOf(await GithubCodeMapFollow.query().where('userId', member.id), 0)
    ;(await client.delete('/admin/github-app').headers(json).loginAs(user)).assertStatus(404)
  })

  test('an App whose secrets no longer decrypt is off', async ({ client, assert }) => {
    useFakeGithub()
    const user = await admin()
    await client
      .post('/admin/github-app')
      .headers(json)
      .json({ code: CODE, state: createManifestState(user) })
      .loginAs(user)
      .then((r) => r.assertStatus(200))
    await db
      .from('github_app_registrations')
      .update({ credentials: 'not-a-ciphertext', updated_at: new Date() })
    assert.isNull(await githubAppConfig())
  })
})
