import { execFile } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import app from '@adonisjs/core/services/app'
import redis from '@adonisjs/redis/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { LanguageModel } from '@coreloom-uml/llm'
import { NOTHING_TO_READ } from '@coreloom-uml/llm'
import { answeringModel, toolCallingModel } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import Architecture from '#app/architectures/models/architecture'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import AssistantSandbox from '#app/assistant/models/assistant-sandbox'
import { CLONE, SHELL } from '#app/assistant/services/repository-commands'
import RepositorySandbox, {
  type OpenRepositorySandbox,
} from '#app/assistant/services/repository-sandbox'
import { RepositorySession } from '#app/assistant/services/repository-session'
import GithubCodeMapFollow from '#app/code-maps/models/github-code-map-follow'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import GithubRepositoryGrant from '#app/github/models/github-repository-grant'
import GithubApi, { type GithubResult } from '#app/github/services/github-api'
import PruneAssistantSandboxesJob from '#app/jobs/prune-assistant-sandboxes_job'
import LanguageModels from '#app/llm/services/language-models'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import env from '#start/env'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

/**
 * The assistant reads a project's repository in a sandbox. E2B and GitHub are never reached:
 * the sandbox is swapped for a temporary folder where the same fixed command lines run with this
 * machine's bash and git, and the repository's GitHub URL is cloned from a local fixture
 * repository instead (the only change to what the sandbox would run). `GithubApi` is a fake.
 */

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const KEY = 'sk-fixture-repository-never-stored'
const TOKEN = 'ghs_InstallationTokenNeverStored00003'
const provider = { kind: 'mistral', model: 'mistral-small-latest' }
const REPOSITORY = 'https://github.com/acme/shop'
/** A line of the fixture's code: it must never reach a log, a row or a response. */
const SECRET_LINE = 'export function placeOrder(cart) { return ledger.charge(cart) }'

const sh = promisify(execFile)

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const APP_ENV = {
  GITHUB_APP_ID: '123456',
  GITHUB_APP_SLUG: 'coreloom-uml-test',
  GITHUB_APP_CLIENT_ID: 'Iv23liTestClient',
  GITHUB_APP_CLIENT_SECRET: 'client-secret-for-tests',
  GITHUB_APP_PRIVATE_KEY: privateKey
    .export({ type: 'pkcs1', format: 'pem' })
    .toString()
    .replaceAll('\n', '\\n'),
  GITHUB_APP_WEBHOOK_SECRET: 'webhook-secret-for-tests',
} as const

/** Swaps the GitHub App's settings in, and back out after the test. */
function withGithubApp() {
  const keys = Object.keys(APP_ENV) as (keyof typeof APP_ENV)[]
  const previous = keys.map((key) => [key, env.get(key as never)] as const)
  for (const key of keys) env.set(key as never, APP_ENV[key] as never)
  return () => {
    for (const [key, value] of previous) env.set(key as never, (value ?? '') as never)
  }
}

class FakeGithubApi extends GithubApi {
  tokens = 0
  revoked: string[] = []

  override async installationToken(): Promise<GithubResult<string>> {
    this.tokens += 1
    return { ok: true, value: TOKEN }
  }

  override async revokeInstallationToken(token: string) {
    this.revoked.push(token)
  }

  override async canRead(): Promise<GithubResult<boolean>> {
    return { ok: true, value: true }
  }
}

/** A local Git repository standing for `REPOSITORY`, with two commits; answers the first. */
async function fixtureRepository(folder: string): Promise<string> {
  const run = (...args: string[]) =>
    sh('git', args, {
      cwd: folder,
      env: {
        PATH: process.env.PATH ?? '',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_NAME: 'Ada',
        GIT_AUTHOR_EMAIL: 'ada@example.com',
        GIT_COMMITTER_NAME: 'Ada',
        GIT_COMMITTER_EMAIL: 'ada@example.com',
      },
    })
  await mkdir(join(folder, 'src'), { recursive: true })
  await run('init', '--quiet', '--initial-branch=main')
  await writeFile(join(folder, 'README.md'), '# Shop\n')
  await writeFile(join(folder, 'src', 'orders.ts'), '// Orders\n')
  await run('add', '.')
  await run('commit', '--quiet', '-m', 'Start the shop')
  const first = (await run('rev-parse', 'HEAD')).stdout.trim()
  await writeFile(join(folder, 'src', 'orders.ts'), `// Orders\n${SECRET_LINE}\n`)
  await run('commit', '--quiet', '-am', 'Charge the ledger')
  return first
}

class FakeSandboxes extends RepositorySandbox {
  created = 0
  resumed = 0
  paused = 0
  killed: string[] = []
  folders = new Map<string, string>()
  /** The environment of every clone, as the sandbox would get it. */
  clones: Record<string, string>[] = []
  /** The environment of every other command. */
  afterClone: Record<string, string>[] = []
  /** What happened to the sandboxes, in order: 'clone', 'isolate', 'shell', 'tool'. */
  events: string[] = []
  /** False: E2B does not confirm the sandbox is cut off the network. */
  isolates = true

  constructor(private origin: string) {
    super()
  }

  configured() {
    return true
  }

  async create(): Promise<OpenRepositorySandbox | null> {
    const folder = await mkdtemp(join(tmpdir(), 'fake-sandbox-'))
    this.created += 1
    const id = `sbx-${String(this.created)}`
    this.folders.set(id, folder)
    return this.#open(id)
  }

  async resume(sandboxId: string) {
    if (!this.folders.has(sandboxId)) return null
    this.resumed += 1
    return this.#open(sandboxId)
  }

  async kill(sandboxId: string) {
    this.killed.push(sandboxId)
    const folder = this.folders.get(sandboxId)
    this.folders.delete(sandboxId)
    if (folder) await rm(folder, { recursive: true, force: true })
  }

  #open(id: string): OpenRepositorySandbox {
    const root = join(this.folders.get(id) ?? '', 'repo')
    return {
      sandboxId: id,
      run: (command, envs) => {
        if (command === CLONE) this.clones.push(envs)
        this.events.push(command === CLONE ? 'clone' : command === SHELL ? 'shell' : 'tool')
        if (command !== CLONE) this.afterClone.push(envs)
        // GitHub's URL is cloned from the fixture, which the sandbox's git (https only) refuses
        // unless allowed, the same way a token is passed.
        const count = Number(envs.GIT_CONFIG_COUNT ?? 0)
        const local = {
          ...envs,
          REPO_URL: envs.REPO_URL === `${REPOSITORY}.git` ? `file://${this.origin}` : '',
          GIT_CONFIG_COUNT: String(count + 1),
          [`GIT_CONFIG_KEY_${String(count)}`]: 'protocol.file.allow',
          [`GIT_CONFIG_VALUE_${String(count)}`]: 'always',
        }
        return new Promise((resolve) => {
          execFile(
            '/bin/bash',
            ['-c', command],
            { env: { PATH: process.env.PATH ?? '', ...local, REPO_ROOT: root } },
            (error, stdout) =>
              resolve({
                exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
                output: stdout,
              }),
          )
        })
      },
      readFile: async () => null,
      isolate: async () => {
        this.events.push('isolate')
        return this.isolates
      },
      pause: async () => {
        this.paused += 1
      },
    }
  }
}

function useModel(model: LanguageModel) {
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
}

async function setup(email: string) {
  const user = await User.create({ email, password: 'a-very-strong-passphrase' })
  for (const key of [
    FeatureFlagKey.DiagramAssistant,
    FeatureFlagKey.AssistantActions,
    FeatureFlagKey.CodeMaps,
    FeatureFlagKey.AssistantRepository,
  ]) {
    await updateFlag(key, ON, user)
  }
  const project = await Project.create({ userId: user.id, name: 'Shop' })
  await GithubCodeMapFollow.create({
    projectId: project.id,
    userId: user.id,
    repositoryId: 4242,
    repositoryUrl: REPOSITORY,
    branch: null,
  })
  const conversation = await AssistantConversation.create({ userId: user.id, title: '' })
  return { user, project, conversation, path: `/assistant/conversations/${conversation.id}` }
}

const toolResults = (model: ReturnType<typeof toolCallingModel>) =>
  JSON.stringify(
    model.doGenerateCalls.flatMap((call) => call.prompt.filter((m) => m.role === 'tool')),
  )

let sandboxes: FakeSandboxes
let firstCommit = ''

test.group('Assistant repository', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(async () => {
    const origin = await mkdtemp(join(tmpdir(), 'fake-origin-'))
    firstCommit = await fixtureRepository(origin)
    sandboxes = new FakeSandboxes(origin)
    app.container.swap(RepositorySandbox, () => sandboxes)
    return async () => {
      for (const id of [...sandboxes.folders.keys()]) await sandboxes.kill(id)
      await rm(origin, { recursive: true, force: true })
      app.container.restore(RepositorySandbox)
      app.container.restore(LanguageModels)
      app.container.restore(GithubApi)
    }
  })

  test('answers from files it really read, then resumes the paused sandbox next time', async ({
    client,
    assert,
  }) => {
    const f = await setup('repo-read@example.com')
    const model = toolCallingModel([
      { calls: [{ tool: 'list_repository_files', input: { projectId: f.project.id } }] },
      {
        calls: [
          { tool: 'search_repository', input: { projectId: f.project.id, query: 'placeorder' } },
        ],
      },
      {
        calls: [
          {
            tool: 'read_repository_file',
            input: { projectId: f.project.id, path: 'src/orders.ts' },
          },
        ],
      },
      { text: 'placeOrder charges the ledger (src/orders.ts:2).' },
    ])
    useModel(model)

    const logs = captureLogs()
    const response = await client
      .post(`${f.path}/messages`)
      .headers(json)
      .loginAs(f.user)
      .json({ provider, apiKey: KEY, message: 'Who charges?', locale: 'en', auto: true })
    logs.restore()

    response.assertStatus(200)
    const results = toolResults(model)
    assert.include(results, 'src/orders.ts')
    assert.include(results, 'ledger.charge')
    assert.notInclude(results, '.git')
    const reply = response.body().messages[1].content as string
    assert.include(reply, 'Files read: `src/orders.ts`')
    assert.isFalse(response.body().unfinished)
    // A public repository is cloned without any credential.
    assert.lengthOf(sandboxes.clones, 1)
    assert.notProperty(sandboxes.clones[0], 'GIT_CONFIG_COUNT')
    assert.equal(sandboxes.created, 1)
    assert.equal(sandboxes.paused, 1)
    const row = await AssistantSandbox.findByOrFail('conversationId', f.conversation.id)
    assert.match(row.commitSha, /^[0-9a-f]{40}$/)
    assert.isFalse(row.private)
    // The code lives in the sandbox only.
    const logged = logs.lines.join('\n')
    const database = await dumpDatabase()
    for (const secret of [KEY, 'ledger.charge']) {
      assert.notInclude(logged, secret)
      assert.notInclude(database, secret)
    }

    const history = toolCallingModel([
      { calls: [{ tool: 'repository_history', input: { projectId: f.project.id } }] },
      {
        calls: [
          {
            tool: 'show_repository_commit',
            input: { projectId: f.project.id, commit: firstCommit.slice(0, 10) },
          },
        ],
      },
      {
        calls: [
          {
            tool: 'blame_repository_file',
            input: { projectId: f.project.id, path: 'README.md' },
          },
        ],
      },
      { text: 'Ada started it.' },
    ])
    useModel(history)
    const again = await client
      .post(`${f.path}/messages`)
      .headers(json)
      .loginAs(f.user)
      .json({ provider, apiKey: KEY, message: 'Who started it?', locale: 'fr', auto: true })
    again.assertStatus(200)
    const read = toolResults(history)
    assert.include(read, 'Ada: Charge the ledger')
    assert.include(read, 'Start the shop')
    assert.include(read, `commit ${firstCommit}`)
    assert.include(read, firstCommit.slice(0, 7))
    assert.include(again.body().messages[1].content, 'Fichiers lus: `README.md`')
    assert.equal(sandboxes.created, 1)
    assert.equal(sandboxes.resumed, 1)
    assert.lengthOf(sandboxes.clones, 1)
  })

  test('clones a private repository with a token it never writes down, revoked afterwards', async ({
    client,
    assert,
  }) => {
    const restore = withGithubApp()
    try {
      const github = new FakeGithubApi()
      app.container.swap(GithubApi, () => github)
      const f = await setup('repo-private@example.com')
      await GithubRepositoryGrant.create({
        userId: f.user.id,
        githubUserId: 501,
        githubLogin: 'octo',
        installationId: 77,
        repositoryId: 4242,
        owner: 'acme',
        name: 'shop',
        private: true,
        defaultBranch: 'main',
      })
      useModel(
        toolCallingModel([
          {
            calls: [
              {
                tool: 'read_repository_file',
                input: { projectId: f.project.id, path: 'src/orders.ts' },
              },
            ],
          },
          { text: 'ok' },
        ]),
      )
      const logs = captureLogs()
      const response = await client
        .post(`${f.path}/messages`)
        .headers(json)
        .loginAs(f.user)
        .json({ provider, apiKey: KEY, message: 'Read', locale: 'en', auto: true })
      logs.restore()
      response.assertStatus(200)

      // The token reached the clone as an environment variable only, and was revoked.
      assert.lengthOf(sandboxes.clones, 1)
      const header = Buffer.from(`x-access-token:${TOKEN}`).toString('base64')
      assert.equal(sandboxes.clones[0].GIT_CONFIG_VALUE_0, `Authorization: Basic ${header}`)
      assert.deepEqual(github.revoked, [TOKEN])
      const folder = [...sandboxes.folders.values()][0]
      const config = await readFile(join(folder, 'repo.git', 'config'), 'utf8')
      assert.notInclude(config, header)
      assert.notInclude(config, 'extraheader')
      const row = await AssistantSandbox.findByOrFail('conversationId', f.conversation.id)
      assert.isTrue(row.private)
      const database = await dumpDatabase()
      for (const secret of [TOKEN, header]) {
        assert.notInclude(logs.lines.join('\n'), secret)
        assert.notInclude(database, secret)
        assert.notInclude(JSON.stringify(response.body()), secret)
      }
    } finally {
      restore()
    }
  })

  test('runs a command of the model only once the sandbox is cut off the network', async ({
    client,
    assert,
  }) => {
    const f = await setup('repo-shell@example.com')
    const command = 'grep -c placeOrder src/orders.ts; exit 3'
    const model = toolCallingModel([
      { calls: [{ tool: 'run_repository_command', input: { projectId: f.project.id, command } }] },
      { text: 'Two lines.' },
    ])
    useModel(model)
    const response = await client
      .post(`${f.path}/messages`)
      .headers(json)
      .loginAs(f.user)
      .json({ provider, apiKey: KEY, message: 'How long is it?', locale: 'en', auto: true })
    response.assertStatus(200)
    assert.deepEqual(sandboxes.events, ['clone', 'isolate', 'shell'])
    // The command reaches the sandbox as one environment variable, with nothing else of ours.
    assert.deepEqual(Object.keys(sandboxes.afterClone[0] ?? {}).sort(), [
      'REPO_ROOT',
      'SHELL_COMMAND',
    ])
    assert.include(toolResults(model), '\\"exitCode\\":3')
    assert.include(response.body().messages[1].content, 'Commands run in the sandbox: 1')

    // E2B does not confirm the cut: the sandbox is not used, and nothing runs in it.
    const other = await setup('repo-shell-open@example.com')
    sandboxes.isolates = false
    sandboxes.events = []
    useModel(
      toolCallingModel([
        {
          calls: [
            { tool: 'run_repository_command', input: { projectId: other.project.id, command } },
          ],
        },
        { text: 'I could not read it.' },
      ]),
    )
    const refused = await client
      .post(`${other.path}/messages`)
      .headers(json)
      .loginAs(other.user)
      .json({ provider, apiKey: KEY, message: 'How long is it?', locale: 'en', auto: true })
    refused.assertStatus(200)
    assert.deepEqual(sandboxes.events, ['clone', 'isolate'])
    assert.isNull(await AssistantSandbox.findBy('conversationId', other.conversation.id))
  })

  test('refuses paths out of the repository and another account’s project', async ({
    client,
    assert,
  }) => {
    const f = await setup('repo-refuse@example.com')
    const other = await setup('repo-refuse-other@example.com')
    const model = toolCallingModel([
      {
        calls: [
          {
            tool: 'read_repository_file',
            input: { projectId: f.project.id, path: '../../etc/passwd' },
          },
        ],
      },
      { calls: [{ tool: 'list_repository_files', input: { projectId: other.project.id } }] },
      { text: 'Nothing.' },
    ])
    useModel(model)

    const response = await client
      .post(`${f.path}/messages`)
      .headers(json)
      .loginAs(f.user)
      .json({ provider, apiKey: KEY, message: 'Read it', locale: 'en', auto: true })

    response.assertStatus(200)
    const results = toolResults(model)
    assert.notInclude(results, 'root:')
    assert.include(results, 'no GitHub repository')
    assert.equal(sandboxes.created, 0)
  })

  test('offers no repository tool while the flag is off', async ({ client, assert }) => {
    const f = await setup('repo-flag@example.com')
    await updateFlag(
      FeatureFlagKey.AssistantRepository,
      { ...ON, enabled: false, rollout: 0 },
      f.user,
    )
    const model = toolCallingModel([{ text: 'ok' }])
    useModel(model)

    const response = await client
      .post(`${f.path}/messages`)
      .headers(json)
      .loginAs(f.user)
      .json({ provider, apiKey: KEY, message: 'Hi', locale: 'en', auto: true })

    response.assertStatus(200)
    const tools = model.doGenerateCalls[0]?.tools?.map((tool) => tool.name) ?? []
    assert.notInclude(tools, 'read_repository_file')
    assert.notInclude(tools, 'repository_history')
  })

  test('kills the sandbox with its conversation, its account, or after days unused', async ({
    client,
    assert,
  }) => {
    const opened = async (email: string) => {
      const f = await setup(email)
      useModel(
        toolCallingModel([
          { calls: [{ tool: 'list_repository_files', input: { projectId: f.project.id } }] },
          { text: 'ok' },
        ]),
      )
      ;(
        await client
          .post(`${f.path}/messages`)
          .headers(json)
          .loginAs(f.user)
          .json({ provider, apiKey: KEY, message: 'List', locale: 'en', auto: true })
      ).assertStatus(200)
      return { ...f, row: await AssistantSandbox.findByOrFail('conversationId', f.conversation.id) }
    }

    const a = await opened('repo-kill-conversation@example.com')
    ;(await client.delete(a.path).headers(json).loginAs(a.user)).assertStatus(204)
    assert.include(sandboxes.killed, a.row.sandboxId)

    const b = await opened('repo-kill-account@example.com')
    ;(
      await client
        .delete('/account')
        .headers(json)
        .loginAs(b.user)
        .json({ password: 'a-very-strong-passphrase' })
    ).assertStatus(204)
    assert.include(sandboxes.killed, b.row.sandboxId)

    const c = await opened('repo-kill-idle@example.com')
    const d = await opened('repo-kill-recent@example.com')
    c.row.lastUsedAt = DateTime.now().minus({ days: 8 })
    await c.row.save()
    const job = new PruneAssistantSandboxesJob()
    ;(job as unknown as { logger: unknown }).logger = { info: () => {} }
    await job.process()
    assert.include(sandboxes.killed, c.row.sandboxId)
    assert.notInclude(sandboxes.killed, d.row.sandboxId)
    assert.isNull(await AssistantSandbox.find(c.row.id))
    assert.isNotNull(await AssistantSandbox.find(d.row.id))
  })
  test('the diagram assistant reads the code first, then draws from what was read', async ({
    client,
    assert,
  }) => {
    const f = await setup('repo-diagram@example.com')
    const architecture = await Architecture.create({
      userId: f.user.id,
      projectId: f.project.id,
      title: 'Shop API',
      visibility: 'private',
    })
    const base = `/architectures/${architecture.id}/assistant/conversations/${f.conversation.id}`
    const reading = toolCallingModel([
      {
        calls: [
          {
            tool: 'read_repository_file',
            input: { projectId: f.project.id, path: 'src/orders.ts' },
          },
        ],
      },
      { text: '- placeOrder charges the ledger (src/orders.ts:2)' },
    ])
    useModel(reading)
    const logs = captureLogs()
    const read = await client
      .post(`${base}/readings`)
      .headers(json)
      .loginAs(f.user)
      .json({ provider, apiKey: KEY, message: 'Draw how an order is placed', locale: 'en' })
    logs.restore()
    read.assertStatus(200)
    assert.isFalse(read.body().unfinished)
    const [asked, found] = read.body().messages as { role: string; content: string }[]
    assert.equal(asked.content, 'Draw how an order is placed')
    assert.include(found.content, 'Files read: `src/orders.ts`')
    // Read tools only: nothing to write, nothing to hand over.
    const offered = reading.doGenerateCalls[0]?.tools?.map((tool) => tool.name) ?? []
    assert.includeMembers(offered, ['read_repository_file', 'repository_history', 'list_projects'])
    for (const name of ['create_project', 'delete_architecture', 'work_on_diagrams'])
      assert.notInclude(offered, name)
    assert.include(toolResults(reading), 'ledger.charge')
    assert.notInclude(logs.lines.join('\n'), 'ledger.charge')

    const drawing = answeringModel(JSON.stringify({ reply: 'Drawn from the code.', changes: [] }))
    useModel(drawing)
    const drawn = await client.post(`${base}/messages`).headers(json).loginAs(f.user).json({
      provider,
      apiKey: KEY,
      message: 'Draw how an order is placed',
      currentDiagramId: null,
      locale: 'en',
      afterReading: true,
    })
    drawn.assertStatus(200)
    assert.lengthOf(drawn.body().messages, 1)
    assert.include(
      JSON.stringify(drawing.doGenerateCalls[0]?.prompt),
      'placeOrder charges the ledger',
    )
    const stored = await AssistantMessage.query()
      .where('conversationId', f.conversation.id)
      .orderBy('id', 'asc')
    assert.deepEqual(
      stored.map((message) => message.role),
      ['user', 'assistant', 'assistant'],
    )
  })

  test('a reading stores nothing when the message needs nothing read', async ({
    client,
    assert,
  }) => {
    const f = await setup('repo-diagram-nothing@example.com')
    const architecture = await Architecture.create({
      userId: f.user.id,
      projectId: f.project.id,
      title: 'Shop API',
      visibility: 'private',
    })
    useModel(toolCallingModel([{ text: NOTHING_TO_READ }]))
    const read = await client
      .post(
        `/architectures/${architecture.id}/assistant/conversations/${f.conversation.id}/readings`,
      )
      .headers(json)
      .loginAs(f.user)
      .json({ provider, apiKey: KEY, message: 'Rename B to C', locale: 'en' })
    read.assertStatus(200)
    assert.deepEqual(read.body(), { messages: [], unfinished: false })
    assert.lengthOf(await AssistantMessage.query().where('conversationId', f.conversation.id), 0)
    assert.equal(sandboxes.created, 0)

    await updateFlag(FeatureFlagKey.AssistantActions, { ...ON, enabled: false, rollout: 0 }, f.user)
    const off = await client
      .post(
        `/architectures/${architecture.id}/assistant/conversations/${f.conversation.id}/readings`,
      )
      .headers(json)
      .loginAs(f.user)
      .json({ provider, apiKey: KEY, message: 'Rename B to C', locale: 'en' })
    off.assertStatus(404)
  })

  test('a close while an open still runs waits for it, then pauses what it made', async ({
    assert,
  }) => {
    const f = await setup('repo-close-during-open@example.com')
    const session = new RepositorySession(f.user, f.conversation.id)
    // The tool was stopped (Stop, a timeout): its open goes on, detached, while the message ends.
    const opening = session.open(f.project.id)
    await session.close()
    const opened = await opening
    assert.notTypeOf(opened, 'string')
    assert.equal(sandboxes.created, 1)
    assert.equal(sandboxes.paused, 1)
    // The conversation is free again: another message can take it.
    assert.isNull(await redis.get(`assistant:repository:${String(f.conversation.id)}`))
  })
})
