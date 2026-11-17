import { readFileSync } from 'node:fs'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import type { CreatedApiTokenOutput } from '#app/api-tokens/validators/api-tokens-output'
import Architecture from '#app/architectures/models/architecture'
import type {
  CodeMapOutput,
  CodeMapProcessesOutput,
} from '#app/code-maps/validators/code-maps-output'
import CodeReview from '#app/code-reviews/models/code-review'
import CodeReviewFinding from '#app/code-reviews/models/code-review-finding'
import Diagram from '#app/diagrams/models/diagram'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import { McpTool } from '#app/mcp/constants/mcp'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

type Client = TestContext['client']

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const GRAPH = readFileSync(app.makePath('../../packages/codemap/fixtures/adonis-graph.json'))

function makeUser() {
  return User.create({
    email: `mcp-conformance-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

/** Both flags on, a `read` token, a project with a package diagram and no map yet. */
async function setup(client: Client) {
  const user = await makeUser()
  await updateFlag(FeatureFlagKey.McpServer, ON, user)
  await updateFlag(FeatureFlagKey.CodeMaps, ON, user)
  const token = await client
    .post('/account/api-tokens')
    .headers(json)
    .loginAs(user)
    .json({ name: 'Agent', abilities: ['read'], expiresInDays: 30 })
  token.assertStatus(201)
  const project = await Project.create({ userId: user.id, name: 'Shop', description: null })
  const architecture = await Architecture.create({
    userId: user.id,
    projectId: project.id,
    title: 'API',
  })
  const diagram = await Diagram.create({
    architectureId: architecture.id,
    title: 'Packages',
    kind: 'package',
    format: 'mermaid',
    content: {
      kind: 'package',
      elements: [
        { id: 'app', kind: 'package', label: 'apps/api/app' },
        { id: 'projects', kind: 'package', label: 'projects', parent: 'app' },
        { id: 'billing', kind: 'package', label: 'billing', parent: 'app' },
      ],
      relations: [],
    },
    position: 0,
    version: 1,
  })
  return { user, secret: (token.body() as CreatedApiTokenOutput).secret, project, diagram }
}

async function uploadMap(client: Client, user: User, projectId: number) {
  const response = await client
    .post(`/projects/${projectId}/code-maps`)
    .headers(json)
    .loginAs(user)
    .file('file', GRAPH, { filename: 'graph.json' })
  response.assertStatus(201)
  return (response.body() as { codeMap: CodeMapOutput }).codeMap
}

/** A finished review of `diagram` holding these findings. */
async function review(
  user: User,
  project: Project,
  diagram: Diagram,
  findings: Partial<CodeReviewFinding>[],
) {
  const created = await CodeReview.create({
    projectId: project.id,
    userId: user.id,
    codeMapId: null,
    repositoryUrl: 'https://github.com/acme/shop',
    branch: 'main',
    commitSha: 'abc1234',
    providerKind: 'openai-compatible',
    model: 'test-model',
    includeSnippets: false,
    locale: 'en',
    diagrams: [
      {
        diagramId: diagram.id,
        title: diagram.title,
        kind: diagram.kind,
        status: 'done',
        reason: null,
        findingCount: findings.length,
        dropped: 0,
        truncated: false,
        reviewedAt: '2026-11-17T05:00:00.000Z',
      },
    ],
  })
  for (const finding of findings) {
    await CodeReviewFinding.create({
      codeReviewId: created.id,
      diagramId: diagram.id,
      elementId: 'projects',
      status: 'deviates',
      severity: 'high',
      comment: 'Projects reach into architectures.',
      evidence: [{ key: 'apps/api/app/projects/', path: 'apps/api/app/projects/x.ts', line: 3 }],
      resolution: 'open',
      ...finding,
    })
  }
  return created
}

async function callTool(client: Client, secret: string, name: McpTool, args: object) {
  const response = await client
    .post('/mcp')
    .header('accept', 'application/json, text/event-stream')
    .header('authorization', `Bearer ${secret}`)
    .json({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  response.assertStatus(200)
  return response.body().result as { content: { type: string; text: string }[]; isError?: true }
}

test.group('MCP server - code conformance', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => {
    drive.fake()
    return () => drive.restore()
  })

  test('returns the open findings of the newest review and the match of the newest map', async ({
    client,
    assert,
  }) => {
    const { user, secret, project, diagram } = await setup(client)
    await review(user, project, diagram, [{ comment: 'Older review.' }])
    const newest = await review(user, project, diagram, [
      {},
      { resolution: 'done', comment: 'Fixed already.' },
      { status: 'conforms', severity: 'low', comment: 'Matches.' },
    ])
    const codeMap = await uploadMap(client, user, project.id)

    const result = await callTool(client, secret, McpTool.GetCodeConformance, {
      projectId: project.id,
    })

    assert.isUndefined(result.isError)
    const body = JSON.parse(result.content[0]?.text ?? '')
    assert.equal(body.codeMap.id, codeMap.id)
    assert.isAbove(body.undocumentedProcesses, 0)
    assert.lengthOf(body.diagrams, 1)
    const [entry] = body.diagrams
    assert.equal(entry.diagramId, diagram.id)
    assert.equal(entry.review.reviewId, newest.id)
    assert.deepEqual(
      entry.review.findings.map((finding: { comment: string }) => finding.comment),
      ['Projects reach into architectures.'],
    )
    assert.deepEqual(entry.review.findings[0].evidence, [
      { key: 'apps/api/app/projects/', path: 'apps/api/app/projects/x.ts', line: 3 },
    ])
    assert.deepInclude(entry.codeMatch.findings, {
      kind: 'missing-in-code',
      elementId: 'billing',
      level: 'error',
      message: 'billing is not in the code',
    })
  })

  test('says so when there is no map or review yet, and filters by diagram', async ({
    client,
    assert,
  }) => {
    const { secret, project, diagram } = await setup(client)

    const conformance = await callTool(client, secret, McpTool.GetCodeConformance, {
      projectId: project.id,
      diagramId: diagram.id,
    })
    const processes = await callTool(client, secret, McpTool.ListUndocumentedProcesses, {
      projectId: project.id,
    })
    const unknown = await callTool(client, secret, McpTool.GetCodeConformance, {
      projectId: project.id,
      diagramId: diagram.id + 1000,
    })

    const body = JSON.parse(conformance.content[0]?.text ?? '')
    assert.isNull(body.codeMap)
    assert.include(body.note, 'map push')
    assert.deepInclude(body.diagrams[0], { review: null, codeMatch: null })
    assert.isTrue(processes.isError)
    assert.include(processes.content[0]?.text, 'No code map is ready')
    assert.isTrue(unknown.isError)
    assert.equal(unknown.content[0]?.text, 'Diagram not found')
  })

  test('lists the undocumented processes of the newest map', async ({ client, assert }) => {
    const { user, secret, project } = await setup(client)
    const codeMap = await uploadMap(client, user, project.id)

    const result = await callTool(client, secret, McpTool.ListUndocumentedProcesses, {
      projectId: project.id,
    })

    const body = JSON.parse(result.content[0]?.text ?? '') as CodeMapProcessesOutput
    assert.equal(body.codeMapId, codeMap.id)
    assert.isAbove(body.total, 0)
    assert.equal(body.processes[0]?.nodes[0], body.processes[0]?.entry)
  })

  test('reads another account’s project as not found', async ({ client, assert }) => {
    const { secret } = await setup(client)
    const other = await setup(client)
    await uploadMap(client, other.user, other.project.id)
    await review(other.user, other.project, other.diagram, [{}])

    const conformance = await callTool(client, secret, McpTool.GetCodeConformance, {
      projectId: other.project.id,
    })
    const processes = await callTool(client, secret, McpTool.ListUndocumentedProcesses, {
      projectId: other.project.id,
    })

    for (const result of [conformance, processes]) {
      assert.isTrue(result.isError)
      assert.equal(result.content[0]?.text, 'Project not found')
    }
  })

  test('lists neither tool while code maps are off', async ({ client, assert }) => {
    const { user, secret, project } = await setup(client)
    await updateFlag(FeatureFlagKey.CodeMaps, { enabled: false, rollout: 0, rules: [] }, user)

    const response = await client
      .post('/mcp')
      .header('accept', 'application/json, text/event-stream')
      .header('authorization', `Bearer ${secret}`)
      .json({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: McpTool.GetCodeConformance, arguments: { projectId: project.id } },
      })

    response.assertStatus(200)
    const body = response.body()
    assert.isTrue(body.error !== undefined || body.result?.isError === true)
  })
})
