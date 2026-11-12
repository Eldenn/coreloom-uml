import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import type { CreatedApiTokenOutput } from '#app/api-tokens/validators/api-tokens-output'
import Architecture from '#app/architectures/models/architecture'
import Diagram from '#app/diagrams/models/diagram'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import { McpTool } from '#app/mcp/constants/mcp'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

type Client = TestContext['client']

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }

function makeUser() {
  return User.create({
    email: `mcp-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

async function createToken(client: Client, user: User, abilities = ['read']) {
  const response = await client
    .post('/account/api-tokens')
    .headers(json)
    .loginAs(user)
    .json({ name: 'Agent', abilities, expiresInDays: 30 })
  response.assertStatus(201)
  return (response.body() as CreatedApiTokenOutput).secret
}

/** A user with the flag on, a `read` token, and a project holding one class diagram. */
async function setup(client: Client) {
  const user = await makeUser()
  await updateFlag(FeatureFlagKey.McpServer, ON, user)
  const secret = await createToken(client, user)
  const project = await Project.create({ userId: user.id, name: 'Storefront', description: null })
  const architecture = await Architecture.create({
    userId: user.id,
    projectId: project.id,
    title: 'Shop',
  })
  const diagram = await Diagram.create({
    architectureId: architecture.id,
    title: 'Domain',
    kind: 'class',
    format: 'mermaid',
    content: { kind: 'class', classes: [{ id: 'Basket' }], relations: [] },
    position: 0,
    version: 1,
  })
  return { user, secret, project, architecture, diagram }
}

/** A JSON-RPC request to `/mcp`, as an MCP client sends it. */
function rpc(client: Client, secret: string | null, method: string, params: unknown = {}) {
  const request = client
    .post('/mcp')
    .header('accept', 'application/json, text/event-stream')
    .json({ jsonrpc: '2.0', id: 1, method, params })
  return secret ? request.header('authorization', `Bearer ${secret}`) : request
}

/** Calls a tool and returns its result (`content`, and `isError` when it failed). */
async function callTool(client: Client, secret: string, name: McpTool, args: object = {}) {
  const response = await rpc(client, secret, 'tools/call', { name, arguments: args })
  response.assertStatus(200)
  return response.body().result as { content: { type: string; text: string }[]; isError?: true }
}

test.group('MCP server', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('needs an API token: no token and a session are both refused', async ({ client }) => {
    const { user } = await setup(client)

    const anonymous = await rpc(client, null, 'tools/list')
    anonymous.assertStatus(401)
    const session = await rpc(client, null, 'tools/list').loginAs(user)
    session.assertStatus(401)
  })

  test('answers 404 while the flag is off', async ({ client }) => {
    const user = await makeUser()
    const secret = await createToken(client, user)

    const response = await rpc(client, secret, 'tools/list')

    response.assertStatus(404)
  })

  test('refuses a token without the read ability', async ({ client }) => {
    const { user } = await setup(client)
    const secret = await createToken(client, user, ['write'])

    const response = await rpc(client, secret, 'tools/list')

    response.assertStatus(403)
  })

  test('answers 405 to anything but a POST', async ({ client }) => {
    const { secret } = await setup(client)

    const response = await client
      .get('/mcp')
      .headers({ ...json, authorization: `Bearer ${secret}` })

    response.assertStatus(405)
  })

  test('initializes and lists its tools', async ({ client, assert }) => {
    const { secret } = await setup(client)

    const initialized = await rpc(client, secret, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'spec', version: '1.0.0' },
    })
    const listed = await rpc(client, secret, 'tools/list')

    initialized.assertStatus(200)
    assert.equal(initialized.body().result.serverInfo.name, 'coreloom-uml')
    listed.assertStatus(200)
    assert.sameMembers(
      listed.body().result.tools.map((tool: { name: string }) => tool.name),
      Object.values(McpTool),
    )
  })

  test('lists projects and diagrams and returns a diagram as text', async ({ client, assert }) => {
    const { secret, project, architecture, diagram } = await setup(client)

    const projects = await callTool(client, secret, McpTool.ListProjects)
    const diagrams = await callTool(client, secret, McpTool.ListDiagrams, { projectId: project.id })
    const mermaid = await callTool(client, secret, McpTool.GetDiagram, { diagramId: diagram.id })
    const plantuml = await callTool(client, secret, McpTool.GetDiagram, {
      diagramId: diagram.id,
      format: 'plantuml',
    })

    assert.deepEqual(JSON.parse(projects.content[0].text), [
      { id: project.id, name: 'Storefront', description: null },
    ])
    assert.containsSubset(JSON.parse(diagrams.content[0].text), [
      { id: architecture.id, title: 'Shop', diagrams: [{ id: diagram.id, kind: 'class' }] },
    ])
    assert.include(mermaid.content[0].text, 'classDiagram')
    assert.include(mermaid.content[0].text, 'Basket')
    assert.include(plantuml.content[0].text, '@startuml')
  })

  test('returns the latest generated AGENTS.md of a project', async ({ client, assert }) => {
    const { user, secret, project } = await setup(client)

    const before = await callTool(client, secret, McpTool.GetAgentConventions, {
      projectId: project.id,
    })
    const created = await client
      .post('/agent-configs')
      .headers(json)
      .loginAs(user)
      .json({
        name: 'Storefront conventions',
        projectId: project.id,
        questionnaires: ['frontend-react'],
        targets: ['claude-code'],
      })
    created.assertStatus(201)
    const generated = await client
      .post(`/agent-configs/${created.body().config.id}/generations`)
      .headers(json)
      .loginAs(user)
    generated.assertStatus(201)
    const after = await callTool(client, secret, McpTool.GetAgentConventions, {
      projectId: project.id,
    })

    assert.isTrue(before.isError)
    assert.isUndefined(after.isError)
    assert.equal(after.content[0].text, generated.body().generation.files[0].content)
  })

  test('lists agent conventions and reads ones outside any project by id', async ({
    client,
    assert,
  }) => {
    const { user, secret } = await setup(client)
    const created = await client
      .post('/agent-configs')
      .headers(json)
      .loginAs(user)
      .json({ name: 'Loose conventions', questionnaires: ['frontend-react'], targets: ['codex'] })
    created.assertStatus(201)
    const configId = created.body().config.id
    const generated = await client
      .post(`/agent-configs/${configId}/generations`)
      .headers(json)
      .loginAs(user)
    generated.assertStatus(201)

    const list = await callTool(client, secret, McpTool.ListAgentConventions)
    const byId = await callTool(client, secret, McpTool.GetAgentConventions, { configId })
    const neither = await callTool(client, secret, McpTool.GetAgentConventions, {})

    assert.deepEqual(JSON.parse(list.content[0].text), [
      { id: configId, name: 'Loose conventions', projectId: null },
    ])
    assert.equal(byId.content[0].text, generated.body().generation.files[0].content)
    assert.isTrue(neither.isError)
  })

  test('reads what belongs to someone else as not found', async ({ client, assert }) => {
    const { secret } = await setup(client)
    const other = await setup(client)

    const projects = await callTool(client, secret, McpTool.ListProjects)
    const diagrams = await callTool(client, secret, McpTool.ListDiagrams, {
      projectId: other.project.id,
    })
    const diagram = await callTool(client, secret, McpTool.GetDiagram, {
      diagramId: other.diagram.id,
    })
    const conventions = await callTool(client, secret, McpTool.GetAgentConventions, {
      projectId: other.project.id,
    })
    const otherConfig = await client
      .post('/agent-configs')
      .headers(json)
      .loginAs(other.user)
      .json({ name: 'Theirs', questionnaires: ['frontend-react'], targets: ['codex'] })
    const byId = await callTool(client, secret, McpTool.GetAgentConventions, {
      configId: otherConfig.body().config.id,
    })
    const configs = await callTool(client, secret, McpTool.ListAgentConventions)

    assert.notInclude(projects.content[0].text, String(other.project.id))
    assert.lengthOf(JSON.parse(projects.content[0].text), 1)
    for (const result of [diagrams, diagram, conventions, byId]) assert.isTrue(result.isError)
    assert.deepEqual(JSON.parse(configs.content[0].text), [])
    assert.equal(diagram.content[0].text, 'Diagram not found')
  })
})
