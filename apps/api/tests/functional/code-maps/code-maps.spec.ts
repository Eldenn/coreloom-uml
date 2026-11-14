import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import type { CodeMap as CodeMapValue } from '@coreloom-uml/codemap'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { UmlSpec } from '@coreloom-uml/uml'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import type { CreatedApiTokenOutput } from '#app/api-tokens/validators/api-tokens-output'
import Architecture from '#app/architectures/models/architecture'
import { CODE_MAP_LIMITS } from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import DiagramCodeLink from '#app/code-maps/models/diagram-code-link'
import type {
  CodeMapDetailOutput,
  CodeMapLinksOutput,
  CodeMapOutput,
  CodeMapsListOutput,
} from '#app/code-maps/validators/code-maps-output'
import Diagram from '#app/diagrams/models/diagram'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

type Client = TestContext['client']

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const APP = 'apps/api/app'

/** graphify's own output on part of this repository (see `packages/codemap/fixtures`). */
const GRAPH = readFileSync(app.makePath('../../packages/codemap/fixtures/adonis-graph.json'))

/** A map the CLI would send: one file, nothing else. */
function smallMap(path = 'src/a.ts'): CodeMapValue {
  return {
    header: {
      version: 1,
      extractor: { name: 'graphify', version: '0.9.108' },
      repository: 'https://user:secret-token@github.com/acme/shop.git',
      branch: 'main',
      commit: 'abc1234',
      nodeCount: 1,
      edgeCount: 0,
    },
    nodes: [{ key: path, name: path.split('/').pop() ?? path, kind: 'file', path }],
    edges: [],
  }
}

function makeUser() {
  return User.create({
    email: `code-maps-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

/** A user with the flag on and a project. */
async function setup(flag = true) {
  const user = await makeUser()
  if (flag) await updateFlag(FeatureFlagKey.CodeMaps, ON, user)
  const project = await Project.create({ userId: user.id, name: 'Shop', description: null })
  return { user, project }
}

function upload(
  client: Client,
  user: User,
  projectId: number,
  bytes: Buffer,
  filename = 'graph.json',
) {
  return client
    .post(`/projects/${projectId}/code-maps`)
    .headers(json)
    .loginAs(user)
    .file('file', bytes, { filename })
}

async function uploaded(client: Client, user: User, projectId: number, bytes = GRAPH) {
  const response = await upload(client, user, projectId, bytes)
  response.assertStatus(201)
  return (response.body() as { codeMap: CodeMapOutput }).codeMap
}

async function createToken(client: Client, user: User, abilities: string[]) {
  const response = await client
    .post('/account/api-tokens')
    .headers(json)
    .loginAs(user)
    .json({ name: 'CLI', abilities, expiresInDays: 30 })
  response.assertStatus(201)
  return { ...json, authorization: `Bearer ${(response.body() as CreatedApiTokenOutput).secret}` }
}

async function storageKey(id: number) {
  const row = await CodeMap.findOrFail(id)
  return row.storageKey as string
}

/** An architecture of `project` holding one package diagram of this repository's API. */
async function packageDiagram(user: User, project: Project) {
  const architecture = await Architecture.create({
    userId: user.id,
    projectId: project.id,
    title: 'API',
  })
  const content: UmlSpec = {
    kind: 'package',
    elements: [
      { id: 'app', kind: 'package', label: 'apps/api/app' },
      { id: 'architectures', kind: 'package', label: 'architectures', parent: 'app' },
      { id: 'projects', kind: 'package', label: 'projects', parent: 'app' },
      { id: 'billing', kind: 'package', label: 'billing', parent: 'app' },
    ],
    relations: [{ from: 'architectures', to: 'projects' }],
  }
  return Diagram.create({
    architectureId: architecture.id,
    title: 'Packages',
    kind: 'package',
    format: 'mermaid',
    content,
    position: 0,
    version: 1,
  })
}

test.group('Code maps', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => {
    drive.fake()
    return () => drive.restore()
  })

  test('every route answers 404 while the flag is off', async ({ client }) => {
    const { user, project } = await setup(false)
    const codeMap = await CodeMap.create({
      projectId: project.id,
      userId: user.id,
      source: 'upload',
      extractor: 'graphify',
      extractorVersion: '0.9.108',
      status: 'ready',
      nodeCount: 0,
      edgeCount: 0,
      storageKey: null,
    })

    ;(
      await client.get(`/projects/${project.id}/code-maps`).headers(json).loginAs(user)
    ).assertStatus(404)
    ;(await upload(client, user, project.id, GRAPH)).assertStatus(404)
    ;(await client.get(`/code-maps/${codeMap.id}`).headers(json).loginAs(user)).assertStatus(404)
    ;(
      await client
        .get(`/code-maps/${codeMap.id}/links`)
        .qs({ diagramId: 1 })
        .headers(json)
        .loginAs(user)
    ).assertStatus(404)
    ;(await client.delete(`/code-maps/${codeMap.id}`).headers(json).loginAs(user)).assertStatus(404)
  })

  test('stores an uploaded graph.json gzipped in Drive and counts it on the project', async ({
    client,
    assert,
  }) => {
    const { user, project } = await setup()

    const codeMap = await uploaded(client, user, project.id)

    assert.equal(codeMap.projectId, project.id)
    assert.equal(codeMap.source, 'upload')
    assert.equal(codeMap.status, 'ready')
    assert.equal(codeMap.extractor, 'graphify')
    assert.isAbove(codeMap.nodeCount, 0)
    assert.isAbove(codeMap.edgeCount, 0)
    assert.notProperty(codeMap, 'storageKey')
    const key = await storageKey(codeMap.id)
    assert.match(key, new RegExp(`^code-maps/${project.id}/[0-9a-f-]+\\.json\\.gz$`))
    const stored = await drive.use().getBytes(key)
    assert.deepEqual([stored[0], stored[1]], [0x1f, 0x8b])

    const shown = await client.get(`/projects/${project.id}`).headers(json).loginAs(user)
    shown.assertBodyContains({ project: { codeMapCount: 1 } })
    const listed = await client.get('/projects').headers(json).loginAs(user)
    listed.assertBodyContains({ data: [{ id: project.id, codeMapCount: 1 }] })
  })

  test('reads a gzipped map the CLI sends with a write token, and refuses a read token', async ({
    client,
    assert,
  }) => {
    const { user, project } = await setup()
    const body = gzipSync(JSON.stringify(smallMap()))

    const reader = await createToken(client, user, ['read'])
    ;(
      await client
        .post(`/projects/${project.id}/code-maps`)
        .headers(reader)
        .file('file', body, { filename: 'map.json.gz' })
    ).assertStatus(403)

    const writer = await createToken(client, user, ['read', 'write'])
    const response = await client
      .post(`/projects/${project.id}/code-maps`)
      .headers(writer)
      .file('file', body, { filename: 'map.json.gz' })
      .field('branch', 'release')
    response.assertStatus(201)
    const { codeMap } = response.body() as { codeMap: CodeMapOutput }
    assert.equal(codeMap.source, 'cli')
    assert.equal(codeMap.nodeCount, 1)
    assert.equal(codeMap.branch, 'release')
    assert.equal(codeMap.commitSha, 'abc1234')
    // The user name and token a clone URL may carry are never kept.
    assert.equal(codeMap.repositoryUrl, 'https://github.com/acme/shop.git')
  })

  test('refuses with 422 what is not a code map', async ({ client, assert }) => {
    const { user, project } = await setup()
    const graph = JSON.parse(GRAPH.toString('utf8'))
    const cases: [Buffer, string][] = [
      [Buffer.from('not json'), 'graph.json'],
      [Buffer.from(JSON.stringify({ hello: 'world' })), 'graph.json'],
      [
        Buffer.from(JSON.stringify({ ...graph, graph: { ...graph.graph, schema_version: 99 } })),
        'graph.json',
      ],
      [Buffer.from(JSON.stringify({ ...smallMap(), nodes: [] })), 'map.json'],
      [GRAPH, 'graph.txt'],
      // A small file that inflates past the limit.
      [gzipSync(Buffer.alloc(CODE_MAP_LIMITS.inflatedBytes + 1024)), 'graph.json.gz'],
    ]
    for (const [bytes, filename] of cases) {
      const response = await upload(client, user, project.id, bytes, filename)
      response.assertStatus(422)
    }
    const unknownSchema = await upload(
      client,
      user,
      project.id,
      Buffer.from(JSON.stringify({ ...graph, graph: { ...graph.graph, schema_version: 99 } })),
    )
    assert.include(JSON.stringify(unknownSchema.body()), 'Unsupported graphify schema_version 99')

    const missing = await client
      .post(`/projects/${project.id}/code-maps`)
      .headers(json)
      .loginAs(user)
      .field('branch', 'main')
    missing.assertStatus(422)
    assert.equal((await CodeMap.query().where('projectId', project.id)).length, 0)
  })

  test('keeps the five newest maps of a project and deletes the files of the others', async ({
    client,
    assert,
  }) => {
    const { user, project } = await setup()
    const ids: number[] = []
    const keys: string[] = []
    for (let index = 0; index <= CODE_MAP_LIMITS.perProject; index += 1) {
      const codeMap = await uploaded(
        client,
        user,
        project.id,
        Buffer.from(JSON.stringify(smallMap(`src/file-${index}.ts`))),
      )
      ids.push(codeMap.id)
      keys.push(await storageKey(codeMap.id))
    }

    const response = await client
      .get(`/projects/${project.id}/code-maps`)
      .headers(json)
      .loginAs(user)
    response.assertStatus(200)
    const list = response.body() as CodeMapsListOutput
    assert.equal(list.meta.total, CODE_MAP_LIMITS.perProject)
    assert.deepEqual(
      list.data.map((codeMap) => codeMap.id),
      ids.slice(1).reverse(),
    )
    assert.isFalse(await drive.use().exists(keys[0]))
    assert.isTrue(await drive.use().exists(keys[1]))
  })

  test('shows the summary with the entry points it detects', async ({ client, assert }) => {
    const { user, project } = await setup()
    const codeMap = await uploaded(client, user, project.id)

    const response = await client.get(`/code-maps/${codeMap.id}`).headers(json).loginAs(user)

    response.assertStatus(200)
    const detail = (response.body() as { codeMap: CodeMapDetailOutput }).codeMap
    assert.equal(detail.id, codeMap.id)
    assert.isNotNull(detail.summary)
    assert.isAbove(detail.summary?.counts.files ?? 0, 0)
    assert.isTrue(detail.summary?.entries.some((entry) => entry.kind === 'route'))
    assert.isTrue(detail.summary?.folders.some((folder) => folder.path === 'apps/api/app'))
  })

  test('deletes a map with its file, and leaves the diagrams’ links alone', async ({
    client,
    assert,
  }) => {
    const { user, project } = await setup()
    const codeMap = await uploaded(client, user, project.id)
    const key = await storageKey(codeMap.id)
    const diagram = await packageDiagram(user, project)
    await DiagramCodeLink.create({
      diagramId: diagram.id,
      elementId: 'projects',
      codeKey: `${APP}/projects/`,
      status: 'confirmed',
    })

    const response = await client.delete(`/code-maps/${codeMap.id}`).headers(json).loginAs(user)

    response.assertStatus(204)
    assert.isNull(await CodeMap.find(codeMap.id))
    assert.isFalse(await drive.use().exists(key))
    assert.equal((await DiagramCodeLink.query().where('diagramId', diagram.id)).length, 1)
  })

  test('another account’s project and maps read as 404', async ({ client }) => {
    const { user, project } = await setup()
    const codeMap = await uploaded(client, user, project.id)
    const { user: other } = await setup()

    ;(
      await client.get(`/projects/${project.id}/code-maps`).headers(json).loginAs(other)
    ).assertStatus(404)
    ;(await upload(client, other, project.id, GRAPH)).assertStatus(404)
    ;(await client.get(`/code-maps/${codeMap.id}`).headers(json).loginAs(other)).assertStatus(404)
    ;(await client.delete(`/code-maps/${codeMap.id}`).headers(json).loginAs(other)).assertStatus(
      404,
    )
    ;(
      await client
        .put(`/code-maps/${codeMap.id}/links`)
        .headers(json)
        .loginAs(other)
        .json({ diagramId: 1, links: [] })
    ).assertStatus(404)
  })

  test('deleting the project deletes its maps’ files', async ({ client, assert }) => {
    const { user, project } = await setup()
    const codeMap = await uploaded(client, user, project.id)
    const key = await storageKey(codeMap.id)

    ;(await client.delete(`/projects/${project.id}`).headers(json).loginAs(user)).assertStatus(204)

    assert.isFalse(await drive.use().exists(key))
  })
})

test.group('Code maps - diagram links', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => {
    drive.fake()
    return () => drive.restore()
  })

  test('matches a diagram of the project against the map', async ({ client, assert }) => {
    const { user, project } = await setup()
    const codeMap = await uploaded(client, user, project.id)
    const diagram = await packageDiagram(user, project)

    const response = await client
      .get(`/code-maps/${codeMap.id}/links`)
      .qs({ diagramId: diagram.id })
      .headers(json)
      .loginAs(user)

    response.assertStatus(200)
    const body = response.body() as CodeMapLinksOutput
    assert.deepEqual(body.links, [])
    const projects = body.match.elements.find((element) => element.elementId === 'projects')
    assert.deepEqual(projects, {
      elementId: 'projects',
      status: 'suggested',
      candidates: [{ codeKey: `${APP}/projects/`, reason: 'folder-path' }],
    })
    assert.equal(
      body.match.elements.find((element) => element.elementId === 'billing')?.status,
      'missing',
    )
  })

  test('replaces the diagram’s links, and confirmed links win', async ({ client, assert }) => {
    const { user, project } = await setup()
    const codeMap = await uploaded(client, user, project.id)
    const diagram = await packageDiagram(user, project)
    const put = (links: unknown[]) =>
      client
        .put(`/code-maps/${codeMap.id}/links`)
        .headers(json)
        .loginAs(user)
        .json({ diagramId: diagram.id, links })

    const confirmed = await put([
      { elementId: 'billing', codeKey: `${APP}/shared/`, status: 'confirmed' },
      { elementId: 'projects', codeKey: `${APP}/projects/`, status: 'ignored' },
    ])
    confirmed.assertStatus(200)
    const body = confirmed.body() as CodeMapLinksOutput
    assert.deepEqual(body.links, [
      { elementId: 'billing', codeKey: `${APP}/shared/`, status: 'confirmed' },
      { elementId: 'projects', codeKey: `${APP}/projects/`, status: 'ignored' },
    ])
    assert.deepEqual(
      body.match.elements.find((element) => element.elementId === 'billing'),
      {
        elementId: 'billing',
        status: 'confirmed',
        candidates: [{ codeKey: `${APP}/shared/`, reason: 'confirmed' }],
      },
    )

    const twice = await put([
      { elementId: 'billing', codeKey: `${APP}/shared/`, status: 'confirmed' },
      { elementId: 'billing', codeKey: `${APP}/shared/`, status: 'ignored' },
    ])
    twice.assertStatus(422)

    ;(await put([])).assertStatus(200)
    assert.equal((await DiagramCodeLink.query().where('diagramId', diagram.id)).length, 0)
  })

  test('a diagram outside the map’s project, or empty, is handled', async ({ client, assert }) => {
    const { user, project } = await setup()
    const codeMap = await uploaded(client, user, project.id)
    const elsewhere = await Project.create({ userId: user.id, name: 'Other', description: null })
    const foreign = await packageDiagram(user, elsewhere)

    ;(
      await client
        .get(`/code-maps/${codeMap.id}/links`)
        .qs({ diagramId: foreign.id })
        .headers(json)
        .loginAs(user)
    ).assertStatus(404)

    const empty = await packageDiagram(user, project)
    empty.content = null
    await empty.save()
    const response = await client
      .get(`/code-maps/${codeMap.id}/links`)
      .qs({ diagramId: empty.id })
      .headers(json)
      .loginAs(user)
    response.assertStatus(200)
    assert.deepEqual((response.body() as CodeMapLinksOutput).match, {
      elements: [],
      relations: [],
      findings: [],
    })
  })
})
