import { readFileSync } from 'node:fs'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { UmlSpec } from '@coreloom-uml/uml'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import type { CreatedApiTokenOutput } from '#app/api-tokens/validators/api-tokens-output'
import Architecture from '#app/architectures/models/architecture'
import { CodeMapStatus } from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import type {
  CodeConformanceOutput,
  CodeMapOutput,
} from '#app/code-maps/validators/code-maps-output'
import Diagram from '#app/diagrams/models/diagram'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

type Client = TestContext['client']

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }

/** graphify's own output on part of this repository (see `packages/codemap/fixtures`). */
const GRAPH = readFileSync(app.makePath('../../packages/codemap/fixtures/adonis-graph.json'))

function makeUser() {
  return User.create({
    email: `conformance-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

/** A user with code maps on, a project, a map of this repository's API and two diagrams. */
async function setup(client: Client) {
  const user = await makeUser()
  await updateFlag(FeatureFlagKey.CodeMaps, ON, user)
  const project = await Project.create({ userId: user.id, name: 'Shop', description: null })
  const response = await client
    .post(`/projects/${project.id}/code-maps`)
    .headers(json)
    .loginAs(user)
    .file('file', GRAPH, { filename: 'graph.json' })
  response.assertStatus(201)
  const codeMap = (response.body() as { codeMap: CodeMapOutput }).codeMap

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
    relations: [{ from: 'billing', to: 'projects' }],
  }
  const packages = await Diagram.create({
    architectureId: architecture.id,
    title: 'Packages',
    kind: 'package',
    format: 'mermaid',
    content,
    position: 0,
    version: 1,
  })
  await Diagram.create({
    architectureId: architecture.id,
    title: 'Lifecycle',
    kind: 'state',
    format: 'mermaid',
    content: { kind: 'state', states: [{ id: 'draft' }], transitions: [] },
    position: 1,
    version: 1,
  })
  return { user, project, codeMap, packages }
}

async function bearer(client: Client, user: User, abilities: string[]) {
  const response = await client
    .post('/account/api-tokens')
    .headers(json)
    .loginAs(user)
    .json({ name: 'CI', abilities, expiresInDays: 30 })
  response.assertStatus(201)
  return { ...json, authorization: `Bearer ${(response.body() as CreatedApiTokenOutput).secret}` }
}

test.group('Code maps - conformance', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => {
    drive.fake()
    return () => drive.restore()
  })

  test('weighs the findings of every diagram the map can check, with a read key', async ({
    client,
    assert,
  }) => {
    const { user, project, codeMap, packages } = await setup(client)
    const headers = await bearer(client, user, ['read'])

    const response = await client
      .get(`/projects/${project.id}/code-maps/conformance`)
      .headers(headers)

    response.assertStatus(200)
    const body = response.body() as CodeConformanceOutput
    assert.equal(body.codeMap.id, codeMap.id)
    assert.equal(body.notChecked, 1)
    assert.lengthOf(body.diagrams, 1)
    const [diagram] = body.diagrams
    assert.equal(diagram?.diagramId, packages.id)
    assert.equal(diagram?.architectureTitle, 'API')
    assert.deepInclude(diagram?.findings, {
      kind: 'missing-in-code',
      elementId: 'billing',
      level: 'error',
      message: 'billing is not in the code',
    })
    for (const finding of diagram?.findings ?? []) {
      assert.include(['error', 'warning'], finding.level)
      assert.isNotEmpty(finding.message)
    }
    assert.equal(
      body.counts.error,
      diagram?.findings.filter((finding) => finding.level === 'error').length,
    )
    assert.deepEqual(body.counts, diagram?.counts)
    assert.isAbove(body.undocumentedProcesses, 0)
  })

  test('reads the newest ready map by default, or the one named', async ({ client, assert }) => {
    const { user, project, codeMap } = await setup(client)
    const pending = await CodeMap.create({
      projectId: project.id,
      userId: user.id,
      source: 'github',
      repositoryUrl: null,
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

    const latest = await client
      .get(`/projects/${project.id}/code-maps/conformance`)
      .headers(json)
      .loginAs(user)
    const named = await client
      .get(`/projects/${project.id}/code-maps/conformance`)
      .qs({ codeMapId: pending.id })
      .headers(json)
      .loginAs(user)

    latest.assertStatus(200)
    assert.equal((latest.body() as CodeConformanceOutput).codeMap.id, codeMap.id)
    named.assertStatus(409)
  })

  test('answers 409 without a ready map, 404 for a map of another project', async ({ client }) => {
    const { user, codeMap } = await setup(client)
    const empty = await Project.create({ userId: user.id, name: 'Empty', description: null })

    ;(
      await client.get(`/projects/${empty.id}/code-maps/conformance`).headers(json).loginAs(user)
    ).assertStatus(409)
    ;(
      await client
        .get(`/projects/${empty.id}/code-maps/conformance`)
        .qs({ codeMapId: codeMap.id })
        .headers(json)
        .loginAs(user)
    ).assertStatus(404)
  })

  test('reads another account’s project as 404, and 404 while the flag is off', async ({
    client,
  }) => {
    const { project } = await setup(client)
    const other = await makeUser()
    await updateFlag(FeatureFlagKey.CodeMaps, ON, other)
    const off = await makeUser()

    ;(
      await client.get(`/projects/${project.id}/code-maps/conformance`).headers(json).loginAs(other)
    ).assertStatus(404)
    ;(
      await client.get(`/projects/${project.id}/code-maps/conformance`).headers(json).loginAs(off)
    ).assertStatus(404)
  })
})
