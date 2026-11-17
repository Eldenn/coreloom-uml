import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { gzipSync } from 'node:zlib'
import type { Logger } from '@adonisjs/core/logger'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import queue from '@nemoventures/adonis-jobs/services/main'
import { DateTime } from 'luxon'
import {
  CODE_MAP_LIMITS,
  CODE_MAPS_QUEUE,
  CodeMapSource,
  CodeMapStatus,
  GITHUB_IMPORT_FAILURES,
} from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import { parseGithubRepository } from '#app/code-maps/services/github-repository'
import type { CodeMapDetailOutput, CodeMapOutput } from '#app/code-maps/validators/code-maps-output'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import ImportGithubCodeMapJob from '#app/jobs/import-github-code-map_job'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import env from '#start/env'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

/**
 * `POST /projects/:id/code-maps/github` and the job that reads the repository. The analyzer is a
 * local stand-in answering what `apps/analyzer` answers; the route's specs need a running Redis
 * (the job is queued), like `mail-queue.spec.ts`.
 */

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const SHA = '0123456789abcdef0123456789abcdef01234567'

/** graphify's own output on part of this repository (see `packages/codemap/fixtures`). */
const GRAPH = readFileSync(app.makePath('../../packages/codemap/fixtures/adonis-graph.json'))

type Answer = { status: number; body: Buffer | object; headers?: Record<string, string> }

/** A stand-in for the analyzer: records each request, answers the next queued answer. */
class FakeAnalyzer {
  requests: Array<Record<string, unknown>> = []
  answers: Answer[] = []
  #server: Server

  constructor() {
    this.#server = createServer((request, response) => void this.#handle(request, response))
  }

  async start(): Promise<string> {
    await new Promise<void>((resolve) => this.#server.listen(0, '127.0.0.1', resolve))
    return `http://127.0.0.1:${String((this.#server.address() as AddressInfo).port)}`
  }

  stop(): Promise<void> {
    return new Promise((resolve) => this.#server.close(() => resolve()))
  }

  async #handle(request: IncomingMessage, response: ServerResponse) {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    this.requests.push(
      JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>,
    )
    const answer: Answer = this.answers.shift() ?? {
      status: 500,
      body: { error: { code: 'internal' } },
    }
    const isBytes = Buffer.isBuffer(answer.body)
    response.writeHead(answer.status, {
      'content-type': isBytes ? 'application/gzip' : 'application/json',
      ...answer.headers,
    })
    response.end(isBytes ? answer.body : JSON.stringify(answer.body))
  }
}

function graphAnswer(): Answer {
  return {
    status: 200,
    body: gzipSync(GRAPH),
    headers: { 'x-commit-sha': SHA, 'x-branch': 'main', 'x-graphify-version': '0.9.108' },
  }
}

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
    const previous = env.get('ANALYZER_URL')
    env.set('ANALYZER_URL', 'http://analyzer.test:8080')
    await queue.useQueue(CODE_MAPS_QUEUE).drain(true)
    return async () => {
      env.set('ANALYZER_URL', previous ?? '')
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

  test('503 when the server has no analyzer', async ({ client }) => {
    const { user, project } = await setup()
    env.set('ANALYZER_URL', '')

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
  let analyzer: FakeAnalyzer
  group.each.setup(() => withDefaultFlags())
  group.each.setup(async () => {
    drive.fake()
    analyzer = new FakeAnalyzer()
    const previous = env.get('ANALYZER_URL')
    env.set('ANALYZER_URL', await analyzer.start())
    return async () => {
      env.set('ANALYZER_URL', previous ?? '')
      await analyzer.stop()
      drive.restore()
    }
  })

  test('stores the map the analyzer read', async ({ client, assert }) => {
    const { user, project } = await setup()
    const pending = await pendingMap(user, project)
    analyzer.answers.push(graphAnswer())

    assert.isNull(await runJob(pending.id))

    assert.deepEqual(analyzer.requests, [
      {
        repository: 'https://github.com/acme/shop',
        ignore: analyzer.requests[0]?.ignore,
      },
    ])
    assert.include(analyzer.requests[0]?.ignore as string, 'node_modules/')
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
    analyzer.answers.push(graphAnswer())

    await runJob(pending.id)

    assert.equal(analyzer.requests[0]?.branch, 'release/2')
    assert.equal((await CodeMap.findOrFail(pending.id)).branch, 'release/2')
  })

  test('a repository that cannot be read fails the map at once', async ({ assert }) => {
    const { user, project } = await setup()
    const pending = await pendingMap(user, project)
    analyzer.answers.push({ status: 422, body: { error: { code: 'too_many_files' } } })

    assert.isNull(await runJob(pending.id))

    const row = await CodeMap.findOrFail(pending.id)
    assert.equal(row.status, CodeMapStatus.Failed)
    assert.equal(row.failureReason, GITHUB_IMPORT_FAILURES.too_many_files)
    assert.lengthOf(analyzer.requests, 1)
  })

  test('a graph that is not graphify output fails the map', async ({ assert }) => {
    const { user, project } = await setup()
    const pending = await pendingMap(user, project)
    analyzer.answers.push({
      status: 200,
      body: gzipSync(JSON.stringify({ hello: 'world' })),
      headers: { 'x-commit-sha': SHA },
    })

    await runJob(pending.id)

    const row = await CodeMap.findOrFail(pending.id)
    assert.equal(row.status, CodeMapStatus.Failed)
    assert.isAtMost(row.failureReason?.length ?? 0, CODE_MAP_LIMITS.failureReason)
    assert.match(row.failureReason ?? '', /^The map graphify wrote was refused/)
  })

  test('an analyzer that is down is tried again, then fails the map', async ({ assert }) => {
    const { user, project } = await setup()
    const pending = await pendingMap(user, project)
    analyzer.answers.push({ status: 503, body: { error: { code: 'busy' } } })

    const first = await runJob(pending.id, 1)
    assert.instanceOf(first, Error)
    assert.equal((await CodeMap.findOrFail(pending.id)).status, CodeMapStatus.Running)

    const last = await runJob(pending.id, 3)
    assert.instanceOf(last, Error)
    const row = await CodeMap.findOrFail(pending.id)
    assert.equal(row.status, CodeMapStatus.Failed)
    assert.equal(row.failureReason, GITHUB_IMPORT_FAILURES.unreachable)
  })

  test('storage that cannot be written fails the map with its own reason', async ({ assert }) => {
    const { user, project } = await setup()
    const pending = await pendingMap(user, project)
    analyzer.answers.push(graphAnswer())
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
    assert.lengthOf(analyzer.requests, 0)
  })

  test('the project keeps its five newest maps', async ({ assert }) => {
    const { user, project } = await setup()
    for (let index = 0; index < CODE_MAP_LIMITS.perProject; index++) {
      await pendingMap(user, project).then((map) => map.merge({ status: 'failed' }).save())
    }
    const pending = await pendingMap(user, project)
    analyzer.answers.push(graphAnswer())

    await runJob(pending.id)

    const kept = await CodeMap.query().where('projectId', project.id)
    assert.lengthOf(kept, CODE_MAP_LIMITS.perProject)
    assert.isTrue(kept.some((map) => map.id === pending.id))
  })
})
