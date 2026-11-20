import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import app from '@adonisjs/core/services/app'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { LanguageModel } from '@coreloom-uml/llm'
import { toolCallingModel } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantSandbox from '#app/assistant/models/assistant-sandbox'
import RepositorySandbox, {
  type OpenRepositorySandbox,
} from '#app/assistant/services/repository-sandbox'
import GithubCodeMapFollow from '#app/code-maps/models/github-code-map-follow'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import PruneAssistantSandboxesJob from '#app/jobs/prune-assistant-sandboxes_job'
import LanguageModels from '#app/llm/services/language-models'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import env from '#start/env'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

/**
 * The assistant reads a project's repository in a sandbox. E2B is never reached: the sandbox is
 * swapped for one that unpacks the archive in a temporary folder and runs the same fixed command
 * lines with this machine's bash. The analyzer is a local server answering a tar of a fixture.
 */

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const KEY = 'sk-fixture-repository-never-stored'
const provider = { kind: 'mistral', model: 'mistral-small-latest' }
const COMMIT = 'a'.repeat(40)
/** A line of the fixture's code: it must never reach a log, a row or a response. */
const SECRET_LINE = 'export function placeOrder(cart) { return ledger.charge(cart) }'

const sh = promisify(execFile)

class FakeSandboxes extends RepositorySandbox {
  created = 0
  resumed = 0
  paused = 0
  killed: string[] = []
  folders = new Map<string, string>()

  configured() {
    return true
  }

  async create(archive: Uint8Array): Promise<OpenRepositorySandbox | null> {
    const folder = await mkdtemp(join(tmpdir(), 'fake-sandbox-'))
    await writeFile(join(folder, 'repo.tar.gz'), archive)
    await mkdir(join(folder, 'repo'))
    await sh('tar', ['-xzf', join(folder, 'repo.tar.gz'), '-C', join(folder, 'repo')])
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
      run: (command, envs) =>
        new Promise((resolve) => {
          execFile(
            '/bin/bash',
            ['-c', command],
            { env: { PATH: process.env.PATH ?? '', ...envs, REPO_ROOT: root } },
            (error, stdout) =>
              resolve({
                exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
                output: stdout,
              }),
          )
        }),
      pause: async () => {
        this.paused += 1
      },
    }
  }
}

/** The analyzer's `POST /archive`: a gzipped tar of a fixture repository. */
class FakeAnalyzer {
  requests: Record<string, unknown>[] = []
  #server: Server | null = null
  #archive = Buffer.alloc(0)

  async start(): Promise<string> {
    const base = await mkdtemp(join(tmpdir(), 'fake-archive-'))
    await mkdir(join(base, 'src'), { recursive: true })
    await writeFile(join(base, 'README.md'), '# Shop\n')
    await writeFile(join(base, 'src', 'orders.ts'), `// Orders\n${SECRET_LINE}\n`)
    await sh('tar', ['-czf', join(base, 'out.tar.gz'), '-C', base, 'README.md', 'src'])
    this.#archive = await readFile(join(base, 'out.tar.gz'))
    await rm(base, { recursive: true, force: true })
    this.#server = createServer((request, response) => {
      let body = ''
      request.on('data', (chunk) => {
        body += chunk
      })
      request.on('end', () => {
        this.requests.push(JSON.parse(body) as Record<string, unknown>)
        response.writeHead(200, {
          'content-type': 'application/gzip',
          'content-length': this.#archive.length,
          'x-commit-sha': COMMIT,
          'x-branch': 'main',
        })
        response.end(this.#archive)
      })
    })
    await new Promise<void>((resolve) => this.#server?.listen(0, '127.0.0.1', resolve))
    return `http://127.0.0.1:${String((this.#server.address() as AddressInfo).port)}`
  }

  stop() {
    return new Promise<void>((resolve) => this.#server?.close(() => resolve()))
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
    repositoryUrl: 'https://github.com/acme/shop',
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
let analyzer: FakeAnalyzer

test.group('Assistant repository', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(async () => {
    sandboxes = new FakeSandboxes()
    app.container.swap(RepositorySandbox, () => sandboxes)
    analyzer = new FakeAnalyzer()
    const previous = env.get('ANALYZER_URL')
    env.set('ANALYZER_URL', await analyzer.start())
    return async () => {
      env.set('ANALYZER_URL', previous ?? '')
      await analyzer.stop()
      for (const id of [...sandboxes.folders.keys()]) await sandboxes.kill(id)
      app.container.restore(RepositorySandbox)
      app.container.restore(LanguageModels)
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
    const reply = response.body().messages[1].content as string
    assert.include(reply, 'Files read: `src/orders.ts`')
    assert.isFalse(response.body().unfinished)
    // No token for a public repository, and the sandbox got only the archive.
    assert.deepEqual(analyzer.requests, [{ repository: 'https://github.com/acme/shop' }])
    assert.equal(sandboxes.created, 1)
    assert.equal(sandboxes.paused, 1)
    const row = await AssistantSandbox.findByOrFail('conversationId', f.conversation.id)
    assert.equal(row.commitSha, COMMIT)
    assert.isFalse(row.private)
    // The code lives in the sandbox only.
    const logged = logs.lines.join('\n')
    const database = await dumpDatabase()
    for (const secret of [KEY, 'ledger.charge']) {
      assert.notInclude(logged, secret)
      assert.notInclude(database, secret)
    }

    useModel(
      toolCallingModel([
        {
          calls: [
            { tool: 'read_repository_file', input: { projectId: f.project.id, path: 'README.md' } },
          ],
        },
        { text: 'A shop.' },
      ]),
    )
    const again = await client
      .post(`${f.path}/messages`)
      .headers(json)
      .loginAs(f.user)
      .json({ provider, apiKey: KEY, message: 'And the readme?', locale: 'fr', auto: true })
    again.assertStatus(200)
    assert.include(again.body().messages[1].content, 'Fichiers lus: `README.md`')
    assert.equal(sandboxes.created, 1)
    assert.equal(sandboxes.resumed, 1)
    assert.lengthOf(analyzer.requests, 1)
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
    assert.lengthOf(analyzer.requests, 0)
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
})
