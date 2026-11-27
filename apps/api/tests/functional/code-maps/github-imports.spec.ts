import { gzipSync } from 'node:zlib'
import type { Logger } from '@adonisjs/core/logger'
import drive from '@adonisjs/drive/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import queue from '@nemoventures/adonis-jobs/services/main'
import { DateTime } from 'luxon'
import { REPOSITORY_SANDBOX } from '#app/assistant/constants/repository'
import { CLONE, cloneKillSeconds, MAP, MAP_EXIT } from '#app/assistant/services/repository-commands'
import {
  CODE_MAP_LIMITS,
  CODE_MAPS_QUEUE,
  CodeMapSource,
  CodeMapStatus,
  GITHUB_IMPORT_FAILURES,
  GITHUB_IMPORT_LIMITS,
} from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import { parseGithubRepository } from '#app/code-maps/services/github-repository'
import type { CodeMapDetailOutput, CodeMapOutput } from '#app/code-maps/validators/code-maps-output'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import ImportGithubCodeMapJob from '#app/jobs/import-github-code-map_job'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import env from '#start/env'
import {
  type FakeMapSandboxes,
  MAPPED_SHA,
  useFakeMapSandboxes,
} from '#tests/helpers/fake-map-sandbox'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

/**
 * `POST /projects/:id/code-maps/github` and the job that reads the repository. The sandbox is a
 * stand-in answering what the command lines answer in one; the route's specs need a running
 * Redis (the job is queued), like `mail-queue.spec.ts`.
 */

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const SHA = MAPPED_SHA

async function setup(flag = true) {
  const user = await User.create({
    email: `github-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  if (flag) await updateFlag(FeatureFlagKey.CodeMaps, ON, user)
  const project = await Project.create({ userId: user.id, name: 'Shop', description: null })
  return { user, project }
}

function pendingMap(user: User, project: Project, branch: string | null = null) {
  return CodeMap.create({
    projectId: project.id,
    userId: user.id,
    source: CodeMapSource.Github,
    repositoryUrl: 'https://github.com/acme/shop',
    branch,
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

/** Runs the job the way the worker does, `attempt` being the attempt number (from 1). */
async function runJob(codeMapId: number, attempt = 1) {
  const job = new ImportGithubCodeMapJob()
  job.data = { codeMapId }
  job.logger = { info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger
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

test.group('GitHub repository URLs', () => {
  test('accepts github.com repositories only', ({ assert }) => {
    for (const input of [
      'https://github.com/acme/shop',
      'https://github.com/acme/shop.git',
      'https://github.com/acme/shop/',
      'github.com/acme/shop',
      'https://www.github.com/acme/shop',
    ]) {
      assert.equal(parseGithubRepository(input)?.url, 'https://github.com/acme/shop', input)
    }
    for (const input of [
      'https://gitlab.com/acme/shop',
      'https://github.com.evil.io/acme/shop',
      'https://token@github.com/acme/shop',
      'https://github.com:8443/acme/shop',
      'https://github.com/acme/shop/tree/main',
      'https://github.com/acme',
      'https://github.com/acme/shop?x=1',
      'git@github.com:acme/shop.git',
      'file:///etc/passwd',
      'https://github.com/acme/..',
    ]) {
      assert.isNull(parseGithubRepository(input), input)
    }
  })
})

test.group('GitHub code maps: route', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(async () => {
    const previous = env.get('E2B_API_KEY')
    env.set('E2B_API_KEY', 'e2b_key_for_tests')
    await queue.useQueue(CODE_MAPS_QUEUE).drain(true)
    return async () => {
      env.set('E2B_API_KEY', previous ?? '')
      await queue.useQueue(CODE_MAPS_QUEUE).drain(true)
    }
  })

  test('creates a pending map and queues its extraction', async ({ client, assert }) => {
    const { user, project } = await setup()

    const response = await client
      .post(`/projects/${project.id}/code-maps/github`)
      .headers(json)
      .loginAs(user)
      .json({ url: ' https://github.com/acme/shop.git ', branch: 'develop' })

    response.assertStatus(202)
    const { codeMap } = response.body() as { codeMap: CodeMapOutput }
    assert.include(codeMap, {
      source: 'github',
      status: 'pending',
      repositoryUrl: 'https://github.com/acme/shop',
      branch: 'develop',
      nodeCount: 0,
    })
    const jobs = await queue.useQueue(CODE_MAPS_QUEUE).getJobs(['waiting', 'delayed'])
    assert.isTrue(
      jobs.some(
        (job) => job.name === 'ImportGithubCodeMapJob' && job.data.codeMapId === codeMap.id,
      ),
    )
  })

  test('refuses anything but a public github.com repository', async ({ client }) => {
    const { user, project } = await setup()
    for (const body of [
      { url: 'https://gitlab.com/acme/shop' },
      { url: 'https://user:token@github.com/acme/shop' },
      { url: 'https://github.com/acme/shop', branch: '--upload-pack=touch' },
      { url: 'https://github.com/acme/shop', branch: 'a..b' },
    ]) {
      const response = await client
        .post(`/projects/${project.id}/code-maps/github`)
        .headers(json)
        .loginAs(user)
        .json(body)
      response.assertStatus(422)
    }
  })

  test('one extraction at a time per project', async ({ client }) => {
    const { user, project } = await setup()
    await pendingMap(user, project)

    const response = await client
      .post(`/projects/${project.id}/code-maps/github`)
      .headers(json)
      .loginAs(user)
      .json({ url: 'https://github.com/acme/shop' })

    response.assertStatus(409)
  })

  test('a map left pending for too long no longer blocks the project', async ({
    client,
    assert,
  }) => {
    const { user, project } = await setup()
    const stale = await pendingMap(user, project)
    await CodeMap.query()
      .where('id', stale.id)
      .update({ updatedAt: DateTime.now().minus({ minutes: 31 }).toSQL() })

    const response = await client
      .post(`/projects/${project.id}/code-maps/github`)
      .headers(json)
      .loginAs(user)
      .json({ url: 'https://github.com/acme/shop' })

    response.assertStatus(202)
    const row = await CodeMap.findOrFail(stale.id)
    assert.equal(row.status, CodeMapStatus.Failed)
    assert.equal(row.failureReason, GITHUB_IMPORT_FAILURES.stale)
  })

  test('503 when the server has no sandboxes', async ({ client }) => {
    const { user, project } = await setup()
    env.set('E2B_API_KEY', '')

    const response = await client
      .post(`/projects/${project.id}/code-maps/github`)
      .headers(json)
      .loginAs(user)
      .json({ url: 'https://github.com/acme/shop' })

    response.assertStatus(503)
  })

  test('404 for a project that is not yours', async ({ client }) => {
    const { project } = await setup()
    const { user: stranger } = await setup()

    const response = await client
      .post(`/projects/${project.id}/code-maps/github`)
      .headers(json)
      .loginAs(stranger)
      .json({ url: 'https://github.com/acme/shop' })

    response.assertStatus(404)
  })

  test('404 while the flag is off', async ({ client }) => {
    const { user, project } = await setup(false)

    const response = await client
      .post(`/projects/${project.id}/code-maps/github`)
      .headers(json)
      .loginAs(user)
      .json({ url: 'https://github.com/acme/shop' })

    response.assertStatus(404)
  })
})

test.group('GitHub code maps: job', (group) => {
  let sandboxes: FakeMapSandboxes
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => {
    drive.fake()
    const fake = useFakeMapSandboxes()
    sandboxes = fake.sandboxes
    return () => {
      fake.restore()
      drive.restore()
    }
  })

  test('stores the map the sandbox read', async ({ client, assert }) => {
    const { user, project } = await setup()
    const pending = await pendingMap(user, project)

    assert.isNull(await runJob(pending.id))

    // One commit of the repository, no token; graphify gets the ignore file and nothing else.
    assert.deepEqual(
      sandboxes.runs.map((run) => run.command),
      [CLONE, MAP],
    )
    assert.deepEqual(sandboxes.cloned, {
      REPO_ROOT: REPOSITORY_SANDBOX.root,
      REPO_URL: 'https://github.com/acme/shop.git',
      REPO_BRANCH: '',
      REPO_DEPTH: '1',
      // Killed in the sandbox a little before the worker stops waiting for it.
      ...cloneKillSeconds(GITHUB_IMPORT_LIMITS.cloneTimeoutMs),
    })
    assert.sameMembers(Object.keys(sandboxes.runs[1]?.envs ?? {}), ['REPO_ROOT', 'MAP_IGNORE'])
    assert.include(sandboxes.runs[1]?.envs.MAP_IGNORE, 'node_modules/')
    assert.deepEqual(sandboxes.killed, ['sbx-map'])
    const row = await CodeMap.findOrFail(pending.id)
    assert.equal(row.status, CodeMapStatus.Ready)
    assert.equal(row.commitSha, SHA)
    assert.equal(row.branch, 'main')
    assert.isAbove(row.nodeCount, 0)
    assert.isString(row.storageKey)

    const detail = await client.get(`/code-maps/${pending.id}`).headers(json).loginAs(user)
    detail.assertStatus(200)
    const { codeMap } = detail.body() as { codeMap: CodeMapDetailOutput }
    assert.isNotNull(codeMap.summary)
  })

  test('sends the branch it was asked for', async ({ assert }) => {
    const { user, project } = await setup()
    const pending = await pendingMap(user, project, 'release/2')

    await runJob(pending.id)

    assert.equal(sandboxes.cloned?.REPO_BRANCH, 'release/2')
    assert.equal((await CodeMap.findOrFail(pending.id)).branch, 'release/2')
  })

  test('a repository that cannot be read fails the map at once', async ({ assert }) => {
    const { user, project } = await setup()
    const pending = await pendingMap(user, project)
    sandboxes.map = { exitCode: MAP_EXIT.tooManyFiles, output: '' }

    assert.isNull(await runJob(pending.id))

    const row = await CodeMap.findOrFail(pending.id)
    assert.equal(row.status, CodeMapStatus.Failed)
    assert.equal(row.failureReason, GITHUB_IMPORT_FAILURES.too_many_files)
    assert.deepEqual(sandboxes.killed, ['sbx-map'])
  })

  test('each way the sandbox refuses a repository has its reason', async ({ assert }) => {
    const { user, project } = await setup()
    const failed = { exitCode: 1, output: '' }
    for (const [answers, reason] of [
      [{ clone: failed }, GITHUB_IMPORT_FAILURES.not_found],
      [{ clone: { exitCode: MAP_EXIT.tooLarge, output: '' } }, GITHUB_IMPORT_FAILURES.too_large],
      [{ clone: { exitCode: 124, output: '' } }, GITHUB_IMPORT_FAILURES.timeout],
      [{ map: { exitCode: 124, output: '' } }, GITHUB_IMPORT_FAILURES.timeout],
      [
        { map: { exitCode: MAP_EXIT.extraction, output: '' } },
        GITHUB_IMPORT_FAILURES.extraction_failed,
      ],
      [{ graph: Buffer.from('not gzip') }, GITHUB_IMPORT_FAILURES.too_large],
    ] as const) {
      const fake = useFakeMapSandboxes().sandboxes
      Object.assign(fake, answers)
      const pending = await pendingMap(user, project)
      assert.isNull(await runJob(pending.id))
      const row = await CodeMap.findOrFail(pending.id)
      assert.equal(row.failureReason, reason)
      assert.deepEqual(fake.killed, ['sbx-map'])
    }
  })

  test('a graph that is not graphify output fails the map', async ({ assert }) => {
    const { user, project } = await setup()
    const pending = await pendingMap(user, project)
    sandboxes.graph = gzipSync(JSON.stringify({ hello: 'world' }))

    await runJob(pending.id)

    const row = await CodeMap.findOrFail(pending.id)
    assert.equal(row.status, CodeMapStatus.Failed)
    assert.isAtMost(row.failureReason?.length ?? 0, CODE_MAP_LIMITS.failureReason)
    assert.match(row.failureReason ?? '', /^The map graphify wrote was refused/)
  })

  test('a sandbox that cannot start is tried again, then fails the map', async ({ assert }) => {
    const { user, project } = await setup()
    const pending = await pendingMap(user, project)
    sandboxes.available = false

    const first = await runJob(pending.id, 1)
    assert.instanceOf(first, Error)
    assert.equal((await CodeMap.findOrFail(pending.id)).status, CodeMapStatus.Running)

    const last = await runJob(pending.id, 3)
    assert.instanceOf(last, Error)
    const row = await CodeMap.findOrFail(pending.id)
    assert.equal(row.status, CodeMapStatus.Failed)
    assert.equal(row.failureReason, GITHUB_IMPORT_FAILURES.unreachable)
  })

  test('a sandbox that stops answering is tried again', async ({ assert }) => {
    const { user, project } = await setup()
    const pending = await pendingMap(user, project)
    sandboxes.map = { exitCode: REPOSITORY_SANDBOX.goneExitCode, output: '' }

    assert.instanceOf(await runJob(pending.id, 1), Error)
    assert.equal((await CodeMap.findOrFail(pending.id)).status, CodeMapStatus.Running)
    assert.deepEqual(sandboxes.killed, ['sbx-map'])
  })

  test('storage that cannot be written fails the map with its own reason', async ({ assert }) => {
    const { user, project } = await setup()
    const pending = await pendingMap(user, project)
    const put = drive.use().put
    drive.use().put = () => Promise.reject(new Error('connect ETIMEDOUT 127.0.0.1:9000'))
    try {
      const error = await runJob(pending.id, 3)
      assert.instanceOf(error, Error)
    } finally {
      drive.use().put = put
    }

    const row = await CodeMap.findOrFail(pending.id)
    assert.equal(row.status, CodeMapStatus.Failed)
    assert.equal(row.failureReason, GITHUB_IMPORT_FAILURES.storage)
  })

  test('a map deleted meanwhile is left alone', async ({ assert }) => {
    const { user, project } = await setup()
    const pending = await pendingMap(user, project)
    await pending.delete()

    assert.isNull(await runJob(pending.id))
    assert.lengthOf(sandboxes.runs, 0)
  })

  test('the project keeps its five newest maps', async ({ assert }) => {
    const { user, project } = await setup()
    for (let index = 0; index < CODE_MAP_LIMITS.perProject; index++) {
      await pendingMap(user, project).then((map) => map.merge({ status: 'failed' }).save())
    }
    const pending = await pendingMap(user, project)

    await runJob(pending.id)

    const kept = await CodeMap.query().where('projectId', project.id)
    assert.lengthOf(kept, CODE_MAP_LIMITS.perProject)
    assert.isTrue(kept.some((map) => map.id === pending.id))
  })
})
