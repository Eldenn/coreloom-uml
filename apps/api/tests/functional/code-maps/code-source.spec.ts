import { generateKeyPairSync } from 'node:crypto'
import { readFileSync } from 'node:fs'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { MockLanguageModelV4 } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import Architecture from '#app/architectures/models/architecture'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import { CodeMapSuggestionStatus } from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import CodeMapSuggestion from '#app/code-maps/models/code-map-suggestion'
import { readSource, SourceAbsence, sourceSentence } from '#app/code-maps/services/code-source'
import type { CodeMapOutput } from '#app/code-maps/validators/code-maps-output'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import { GithubFailure } from '#app/github/constants/github'
import GithubRepositoryGrant from '#app/github/models/github-repository-grant'
import GithubApi, { type GithubResult } from '#app/github/services/github-api'
import LanguageModels from '#app/llm/services/language-models'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import env from '#start/env'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

/**
 * The source code read on GitHub for a diagram drawn from a code map. GitHub and the provider
 * are never called: `GithubApi` and `LanguageModels` are swapped for fakes.
 */

type Client = TestContext['client']

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const KEY = 'sk-fixture-4d2a8e10-never-stored'
const TOKEN = 'ghs_InstallationTokenNeverStored00002'
const MARKER = 'SOURCE-MARKER-7f3a'
const SOURCE = `export default class X {\n  // ${MARKER}\n}\n`
const provider = { kind: 'mistral', model: 'mistral-small-latest' }
const CONTROLLER = 'apps/api/app/architectures/controllers/architectures-controller.ts'
const UPDATE = `${CONTROLLER}#ArchitecturesController.update`
const REPOSITORY = 'https://github.com/acme/shop'
const COMMIT = 'abc1234'

const GRAPH = readFileSync(app.makePath('../../packages/codemap/fixtures/adonis-graph.json'))

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
  reads: { owner: string; commit: string; path: string; token: string | undefined }[] = []
  tokens = 0
  revoked: string[] = []
  answer: (path: string) => GithubResult<string | null> = () => ({ ok: true, value: SOURCE })

  override async readFile(
    repository: { owner: string; name: string },
    commit: string,
    path: string,
    token?: string,
  ) {
    this.reads.push({ owner: `${repository.owner}/${repository.name}`, commit, path, token })
    return this.answer(path)
  }

  override async installationToken(): Promise<GithubResult<string>> {
    this.tokens += 1
    return { ok: true, value: TOKEN }
  }

  override async revokeInstallationToken(token: string) {
    this.revoked.push(token)
  }

  access: GithubResult<boolean> = { ok: true, value: true }
  asked: string[] = []

  override async canRead(repository: { owner: string; name: string }, login: string) {
    this.asked.push(`${repository.owner}/${repository.name}:${login}`)
    return this.access
  }
}

function useFakeGithub() {
  const fake = new FakeGithubApi()
  app.container.swap(GithubApi, () => fake)
  return fake
}

const TARGET = (kind: string, focus: string[]) =>
  JSON.stringify({ reply: '', target: { kind, title: 'A view', reason: 'Asked.', focus } })

const DRAWING = JSON.stringify({
  title: 'Update an architecture',
  summary: 'The update route.',
  diagram: JSON.stringify({
    kind: 'sequence',
    participants: [
      { id: 'client', kind: 'actor', label: 'Client' },
      { id: 'controller', label: 'ArchitecturesController' },
    ],
    steps: [{ type: 'message', from: 'client', to: 'controller', text: 'update()', arrow: 'sync' }],
  }),
  links: [{ element: 'controller', nodes: ['n1'] }],
})

const PACKAGES = JSON.stringify({
  title: 'Packages',
  summary: 'The folders.',
  diagram: JSON.stringify({
    kind: 'package',
    elements: [{ id: 'app', kind: 'package', label: 'app' }],
    relations: [],
  }),
  links: [],
})

/** A model that gives these answers in turn; an `Error` is thrown instead. */
function useModel(...answers: (string | Error)[]) {
  let call = 0
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      const answer = answers[call]
      call += 1
      if (answer === undefined) throw new Error('the model was called once too often')
      if (answer instanceof Error) throw answer
      return {
        content: [{ type: 'text', text: answer }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 10, text: 10, reasoning: undefined },
        },
        warnings: [],
      }
    },
  })
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
  return model
}

/** A user with a project, an architecture, a conversation and a ready map naming a repository. */
async function setup(
  client: Client,
  repository: Partial<Pick<CodeMap, 'repositoryUrl' | 'commitSha'>> = {},
) {
  const user = await User.create({
    email: `code-source-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  await updateFlag(FeatureFlagKey.CodeMaps, ON, user)
  await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
  const project = await Project.create({ userId: user.id, name: 'Shop', description: null })
  const architecture = await Architecture.create({
    userId: user.id,
    projectId: project.id,
    title: 'API',
  })
  const conversation = await AssistantConversation.create({
    architectureId: architecture.id,
    userId: user.id,
    title: '',
  })
  const response = await client
    .post(`/projects/${project.id}/code-maps`)
    .headers(json)
    .loginAs(user)
    .file('file', GRAPH, { filename: 'graph.json' })
  response.assertStatus(201)
  const codeMap = await CodeMap.findOrFail(
    (response.body() as { codeMap: CodeMapOutput }).codeMap.id,
  )
  await codeMap.merge({ repositoryUrl: REPOSITORY, commitSha: COMMIT, ...repository }).save()
  return { user, project, architecture, conversation, codeMap }
}

type Setup = Awaited<ReturnType<typeof setup>>

function ask(client: Client, { user, architecture, conversation, codeMap }: Setup) {
  return client
    .post(`/architectures/${architecture.id}/assistant/conversations/${conversation.id}/messages`)
    .headers(json)
    .loginAs(user)
    .json({
      provider,
      apiKey: KEY,
      message: 'A sequence diagram of updating an architecture',
      currentDiagramId: null,
      locale: 'en',
      codeMapId: codeMap.id,
    })
}

async function answer(conversationId: number) {
  const message = await AssistantMessage.query()
    .where('conversationId', conversationId)
    .where('role', 'assistant')
    .orderBy('id', 'desc')
    .firstOrFail()
  return message.content
}

function grant(user: User) {
  return GithubRepositoryGrant.create({
    userId: user.id,
    githubUserId: 501,
    githubLogin: 'octo',
    installationId: 77,
    repositoryId: 9001,
    owner: 'Acme',
    name: 'Shop',
    private: true,
    defaultBranch: 'main',
  })
}

const NODES = [{ kind: 'method', path: CONTROLLER, line: 3 }]

test.group('Code maps - source code read for a drawing', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => withGithubApp())
  group.each.setup(() => {
    drive.fake()
    return () => drive.restore()
  })
  group.each.teardown(() => {
    app.container.restore(LanguageModels)
    app.container.restore(GithubApi)
  })

  test('an assistant message reads the files of the slice anonymously and sends them to the drawing', async ({
    client,
    assert,
  }) => {
    const context = await setup(client)
    const github = useFakeGithub()
    const model = useModel(TARGET('sequence', ['s1']), DRAWING)
    ;(await ask(client, context)).assertStatus(200)

    assert.isAbove(github.reads.length, 0)
    assert.deepInclude(github.reads, {
      owner: 'acme/shop',
      commit: COMMIT,
      path: CONTROLLER,
      token: undefined,
    })
    assert.equal(github.tokens, 0)
    const prompt = JSON.stringify(model.doGenerateCalls[1]?.prompt)
    assert.include(prompt, `<source_file path=\\"${CONTROLLER}\\">`)
    assert.include(prompt, MARKER)
    assert.notInclude(prompt, 'You never see the source code.')
    const files = github.reads.length
    assert.isTrue(
      (await answer(context.conversation.id)).endsWith(
        `The update route.\n\nSource code read: ${String(files)} file${files > 1 ? 's' : ''}.`,
      ),
    )
  })

  test('a private repository is read with an installation token, revoked afterwards', async ({
    client,
    assert,
  }) => {
    const context = await setup(client)
    await grant(context.user)
    const github = useFakeGithub()
    useModel(TARGET('sequence', ['s1']), DRAWING)
    ;(await ask(client, context)).assertStatus(200)
    assert.equal(github.tokens, 1)
    assert.isTrue(github.reads.every((read) => read.token === TOKEN))
    assert.deepEqual(github.revoked, [TOKEN])
    assert.deepEqual(github.asked, ['acme/shop:octo'])
  })

  test('a grant GitHub no longer backs reads nothing and is dropped', async ({
    client,
    assert,
  }) => {
    const { codeMap, user } = await setup(client)
    await grant(user)
    const github = useFakeGithub()
    github.access = { ok: true, value: false }
    const reading = await readSource(codeMap, user, NODES)
    assert.equal(reading?.absence, SourceAbsence.Unreadable)
    assert.lengthOf(github.reads, 0)
    assert.deepEqual(github.revoked, [TOKEN])
    assert.isNull(await GithubRepositoryGrant.findBy('userId', user.id))

    // GitHub not answering proves nothing: nothing is read, the grant stays.
    await grant(user)
    github.access = { ok: false, failure: GithubFailure.Unreachable }
    assert.equal((await readSource(codeMap, user, NODES))?.absence, SourceAbsence.Unreadable)
    assert.lengthOf(github.reads, 0)
    assert.isNotNull(await GithubRepositoryGrant.findBy('userId', user.id))
  })

  test('one file GitHub fails on is left out, the others are read', async ({ client, assert }) => {
    const { codeMap, user } = await setup(client)
    const github = useFakeGithub()
    github.answer = (path) =>
      path === 'slow.ts'
        ? { ok: false, failure: GithubFailure.Unreachable }
        : { ok: true, value: SOURCE }
    const reading = await readSource(codeMap, user, [{ kind: 'file', path: 'slow.ts' }, ...NODES])
    assert.equal(reading?.absence, null)
    assert.equal(reading?.omitted, 1)
    assert.lengthOf(reading?.excerpts ?? [], 1)
  })

  test('no token is made when every path is refused', async ({ client, assert }) => {
    const { codeMap, user } = await setup(client)
    await grant(user)
    const github = useFakeGithub()
    const reading = await readSource(codeMap, user, [{ kind: 'function', path: '../secret' }])
    assert.equal(reading?.absence, SourceAbsence.NotFound)
    assert.equal(github.tokens, 0)
  })

  test('the token is revoked when a read throws, and the drawing goes on', async ({
    client,
    assert,
  }) => {
    const context = await setup(client)
    await grant(context.user)
    const github = useFakeGithub()
    github.answer = () => {
      throw new Error('broken')
    }
    const reading = await readSource(context.codeMap, context.user, NODES)
    assert.deepEqual(github.revoked, [TOKEN])
    assert.deepEqual(reading, { excerpts: [], omitted: 0, absence: SourceAbsence.Unreadable })
  })

  test('says why when the map has no repository, no commit, GitHub refuses, or no file is found', async ({
    client,
    assert,
  }) => {
    const context = await setup(client)
    const github = useFakeGithub()
    const { codeMap, user } = context
    const read = async (
      change: Partial<Pick<CodeMap, 'repositoryUrl' | 'commitSha'>>,
      answerWith: GithubResult<string | null>,
    ) => {
      github.answer = () => answerWith
      const reading = await readSource(Object.assign(codeMap, change), user, NODES)
      assert.lengthOf(reading?.excerpts ?? [], 0)
      return reading?.absence
    }
    const found: GithubResult<string | null> = { ok: true, value: SOURCE }
    assert.equal(await read({ repositoryUrl: null }, found), SourceAbsence.NoRepository)
    assert.equal(
      await read({ repositoryUrl: 'https://gitlab.com/acme/shop' }, found),
      SourceAbsence.NoRepository,
    )
    assert.equal(await read({ repositoryUrl: REPOSITORY, commitSha: null }, found), 'no_commit')
    assert.equal(await read({ commitSha: 'not a commit' }, found), SourceAbsence.NoCommit)
    assert.lengthOf(github.reads, 0)
    assert.equal(
      await read({ commitSha: COMMIT }, { ok: false, failure: GithubFailure.Denied }),
      SourceAbsence.Unreadable,
    )
    assert.equal(
      await read({}, { ok: false, failure: GithubFailure.Unreachable }),
      SourceAbsence.Unreadable,
    )
    assert.equal(await read({}, { ok: true, value: null }), SourceAbsence.NotFound)
  })

  test('draws from the structure and says so when no file is found at the commit', async ({
    client,
    assert,
  }) => {
    const context = await setup(client)
    const github = useFakeGithub()
    github.answer = () => ({ ok: true, value: null })
    const model = useModel(TARGET('sequence', ['s1']), DRAWING)
    ;(await ask(client, context)).assertStatus(200)
    const prompt = JSON.stringify(model.doGenerateCalls[1]?.prompt)
    assert.notInclude(prompt, '<source_file')
    assert.include(prompt, 'You never see the source code.')
    assert.isTrue(
      (await answer(context.conversation.id)).endsWith(
        'Source code not read: the files were not found at this commit. Drawn from the structure only.',
      ),
    )
  })

  test('a refused path of the map is never asked for, and counts as left out', async ({
    client,
    assert,
  }) => {
    const { codeMap, user } = await setup(client)
    const github = useFakeGithub()
    const reading = await readSource(codeMap, user, [
      { kind: 'function', path: '../secret' },
      { kind: 'function', path: '/etc/passwd' },
      ...NODES,
    ])
    assert.deepEqual(
      github.reads.map((read) => read.path),
      [CONTROLLER],
    )
    assert.equal(reading?.omitted, 2)
    assert.lengthOf(reading?.excerpts ?? [], 1)
    assert.equal(sourceSentence(reading, 'en'), 'Source code read: 1 file, 2 left out.')
    assert.equal(sourceSentence(reading, 'fr'), 'Code source lu : 1 fichier, 2 laissés de côté.')
  })

  test('a file GitHub does not give is left out, the others are read', async ({
    client,
    assert,
  }) => {
    const { codeMap, user } = await setup(client)
    const github = useFakeGithub()
    github.answer = (path) => ({ ok: true, value: path === 'big.bin' ? null : SOURCE })
    const reading = await readSource(codeMap, user, [{ kind: 'file', path: 'big.bin' }, ...NODES])
    assert.equal(reading?.absence, null)
    assert.equal(reading?.omitted, 1)
    assert.deepEqual(
      reading?.excerpts.map((excerpt) => excerpt.path),
      [CONTROLLER],
    )
    assert.equal(sourceSentence(reading, 'fr'), 'Code source lu : 1 fichier, 1 laissé de côté.')
  })

  test('a package diagram reads no source and says nothing about it', async ({
    client,
    assert,
  }) => {
    const context = await setup(client)
    const github = useFakeGithub()
    useModel(TARGET('package', ['f1']), PACKAGES)
    ;(await ask(client, context)).assertStatus(200)
    assert.lengthOf(github.reads, 0)
    assert.equal(await answer(context.conversation.id), 'The folders.')
    assert.isNull(await readSource(context.codeMap, context.user, []))
    assert.equal(sourceSentence(null, 'en'), '')
  })

  test('drawing a proposal and proposing a process read the source too', async ({
    client,
    assert,
  }) => {
    const context = await setup(client)
    const { user, architecture, codeMap } = context
    const github = useFakeGithub()
    const suggestion = await CodeMapSuggestion.create({
      codeMapId: codeMap.id,
      kind: 'sequence',
      title: 'Update an architecture',
      reason: 'The route.',
      focus: [UPDATE],
      status: CodeMapSuggestionStatus.Open,
      position: 0,
    })
    const drafted = useModel(DRAWING)
    const draft = await client
      .post(`/code-map-suggestions/${suggestion.id}/draft`)
      .headers(json)
      .loginAs(user)
      .json({ provider, apiKey: KEY, locale: 'en', architectureId: architecture.id })
    draft.assertStatus(201)
    assert.include(JSON.stringify(drafted.doGenerateCalls[0]?.prompt), MARKER)
    assert.include(JSON.stringify(draft.body()), 'Source code read: ')
    assert.notInclude(JSON.stringify(draft.body()), MARKER)

    github.reads = []
    const proposed = useModel(DRAWING)
    const proposal = await client
      .post(`/code-maps/${codeMap.id}/processes/propose`)
      .headers(json)
      .loginAs(user)
      .json({
        provider,
        apiKey: KEY,
        entry: UPDATE,
        kind: 'sequence',
        locale: 'fr',
        architectureId: architecture.id,
      })
    proposal.assertStatus(201)
    assert.isAbove(github.reads.length, 0)
    assert.include(JSON.stringify(proposed.doGenerateCalls[0]?.prompt), MARKER)
    assert.include(JSON.stringify(proposal.body()), 'Code source lu : ')
  })

  test('the source, the token and the key reach neither the response, the logs nor the database', async ({
    client,
    assert,
  }) => {
    const context = await setup(client)
    await grant(context.user)
    useFakeGithub()
    useModel(TARGET('sequence', ['s1']), DRAWING)
    const logs = captureLogs()
    let body: string
    try {
      const response = await ask(client, context)
      response.assertStatus(200)
      body = JSON.stringify(response.body())
    } finally {
      logs.restore()
    }
    const everything = [body, logs.lines.join('\n'), await dumpDatabase()].join('\n')
    for (const secret of [MARKER, TOKEN, KEY]) assert.notInclude(everything, secret)
    assert.isTrue(logs.lines.some((line) => line.includes('code source')))
  })
})
