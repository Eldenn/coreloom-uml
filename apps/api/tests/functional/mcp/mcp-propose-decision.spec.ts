import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { AssistantToolKind } from '@coreloom-uml/llm'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import type { CreatedApiTokenOutput } from '#app/api-tokens/validators/api-tokens-output'
import Architecture from '#app/architectures/models/architecture'
import type { ActionContext } from '#app/assistant/actions/action'
import { DESIGN_ACTIONS } from '#app/assistant/actions/design-actions'
import { AGENT_PROPOSALS_WAITING_MAX } from '#app/decisions/constants/decision'
import Decision from '#app/decisions/models/decision'
import { designReviewSource } from '#app/decisions/services/model-design-review'
import { agentContextDesign, projectDesign } from '#app/decisions/services/project-design'
import Diagram from '#app/diagrams/models/diagram'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import { McpTool, WRITE_TOOLS } from '#app/mcp/constants/mcp'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

type Client = TestContext['client']

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }

/** An account with the MCP server and design records on, a project, a view and one accepted decision. */
async function setup(email: string) {
  const user = await User.create({ email, password: 'a-very-strong-passphrase' })
  await updateFlag(FeatureFlagKey.McpServer, ON, user)
  await updateFlag(FeatureFlagKey.DesignRecords, ON, user)
  const project = await Project.create({ userId: user.id, name: 'Shop', description: null })
  const architecture = await Architecture.create({
    userId: user.id,
    projectId: project.id,
    title: 'Shop',
  })
  await Diagram.create({
    architectureId: architecture.id,
    title: 'Domain',
    kind: 'class',
    format: 'mermaid',
    content: { kind: 'class', classes: [{ id: 'Basket' }], relations: [] },
    position: 0,
    version: 1,
  })
  const accepted = await Decision.create({
    projectId: project.id,
    userId: user.id,
    title: 'How are mails sent?',
    context: null,
    options: [{ name: 'Queue', pros: null, cons: null }],
    chosen: 'Queue',
    consequences: null,
    status: 'accepted',
    supersededById: null,
  })
  return {
    user,
    project,
    architecture: architecture as Architecture & { projectId: number },
    accepted,
  }
}

async function createToken(client: Client, user: User, abilities: string[]) {
  const response = await client
    .post('/account/api-tokens')
    .headers(json)
    .loginAs(user)
    .json({ name: 'Agent', abilities, expiresInDays: 30 })
  response.assertStatus(201)
  return (response.body() as CreatedApiTokenOutput).secret
}

function rpc(client: Client, secret: string, method: string, params: unknown = {}) {
  return client
    .post('/mcp')
    .header('accept', 'application/json, text/event-stream')
    .header('authorization', `Bearer ${secret}`)
    .json({ jsonrpc: '2.0', id: 1, method, params })
}

async function toolNames(client: Client, secret: string): Promise<string[]> {
  const response = await rpc(client, secret, 'tools/list')
  response.assertStatus(200)
  return response.body().result.tools.map((tool: { name: string }) => tool.name)
}

async function callTool(client: Client, secret: string, name: McpTool, args: object) {
  const response = await rpc(client, secret, 'tools/call', { name, arguments: args })
  response.assertStatus(200)
  const result = response.body().result as { content: { text: string }[]; isError?: true }
  return { ...result, text: result.content[0]?.text ?? '' }
}

const proposal = (projectId: number, extra: object = {}) => ({
  projectId,
  title: 'How are mails sent now?',
  context: 'The queue cannot reach the mail provider from the new region.',
  options: [
    { name: 'Queue', cons: 'Blocked by the network.' },
    { name: 'Direct call', pros: 'Works today.' },
  ],
  chosen: 'Direct call',
  ...extra,
})

/** Calls one of the assistant's design reads, as the model would. */
function readAction(name: string, input: object, user: User) {
  const action = DESIGN_ACTIONS.find((item) => item.name === name)
  if (action?.kind !== AssistantToolKind.Read) throw new Error(`${name} is not a read`)
  return action.read(input, user, {} as ActionContext) as Promise<Record<string, unknown>>
}

test.group('MCP propose_decision', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('is listed only to a write token with design-records on', async ({ client, assert }) => {
    const { user, project } = await setup('propose-listed@example.com')
    const reader = await createToken(client, user, ['read'])
    const writer = await createToken(client, user, ['read', 'write'])

    assert.notInclude(await toolNames(client, reader), McpTool.ProposeDecision)
    assert.includeMembers(await toolNames(client, writer), [...WRITE_TOOLS])

    // A read token calling it anyway gets a tool error and nothing is stored.
    const refused = await callTool(client, reader, McpTool.ProposeDecision, proposal(project.id))
    assert.isTrue(refused.isError)
    assert.include(refused.text, 'not found')
    assert.lengthOf(await Decision.query().where('projectId', project.id), 1)

    await updateFlag(FeatureFlagKey.DesignRecords, { ...ON, enabled: false }, user)
    assert.notInclude(await toolNames(client, writer), McpTool.ProposeDecision)
  })

  test('stores a proposed decision of an agent whatever status is sent, and supersedes nothing', async ({
    client,
    assert,
  }) => {
    const { user, project, accepted } = await setup('propose-store@example.com')
    const writer = await createToken(client, user, ['read', 'write'])

    const answer = await callTool(
      client,
      writer,
      McpTool.ProposeDecision,
      proposal(project.id, { status: 'accepted', origin: 'owner', supersedesId: accepted.id }),
    )
    assert.isUndefined(answer.isError)
    const stored = await Decision.findOrFail(JSON.parse(answer.text).id)
    assert.include(stored.toJSON(), {
      status: 'proposed',
      origin: 'agent',
      supersedesId: accepted.id,
      chosen: 'Direct call',
    })
    await accepted.refresh()
    assert.equal(accepted.status, 'accepted')
    assert.isNull(accepted.supersededById)
  })

  test('refuses a foreign project, an incoherent decision and a foreign supersedesId', async ({
    client,
    assert,
  }) => {
    const f = await setup('propose-refuse@example.com')
    const other = await setup('propose-refuse-other@example.com')
    const writer = await createToken(client, f.user, ['read', 'write'])
    const call = (args: object) => callTool(client, writer, McpTool.ProposeDecision, args)

    const foreign = await call(proposal(other.project.id))
    assert.isTrue(foreign.isError)
    assert.equal(foreign.text, 'Project not found')

    const incoherent = await call(proposal(f.project.id, { chosen: 'Carrier pigeon' }))
    assert.isTrue(incoherent.isError)
    assert.equal(incoherent.text, 'The chosen option is not one of the options.')

    const replaced = await call(proposal(f.project.id, { supersedesId: other.accepted.id }))
    assert.isTrue(replaced.isError)
    assert.equal(replaced.text, 'This is not a standing decision of the project.')

    assert.lengthOf(
      await Decision.query().whereIn('projectId', [f.project.id, other.project.id]),
      2,
    )
  })

  test('refuses another proposal while too many wait for the owner', async ({ client, assert }) => {
    const { user, project } = await setup('propose-cap@example.com')
    const writer = await createToken(client, user, ['read', 'write'])
    for (let index = 0; index < AGENT_PROPOSALS_WAITING_MAX; index++) {
      await Decision.create({
        projectId: project.id,
        userId: user.id,
        title: `Waiting ${index}`,
        context: null,
        options: [{ name: 'A', pros: null, cons: null }],
        chosen: null,
        consequences: null,
        status: 'proposed',
        supersededById: null,
        origin: 'agent',
      })
    }

    const refused = await callTool(client, writer, McpTool.ProposeDecision, proposal(project.id))
    assert.isTrue(refused.isError)
    assert.include(refused.text, 'the owner must review them')
  })

  test('counts for nothing until the owner keeps it', async ({ client, assert }) => {
    const { user, project, architecture } = await setup('propose-readers@example.com')
    const writer = await createToken(client, user, ['read', 'write'])
    const answer = await callTool(client, writer, McpTool.ProposeDecision, proposal(project.id))
    const id: number = JSON.parse(answer.text).id
    const title = 'How are mails sent now?'

    const readers = async () => {
      const source = await designReviewSource(architecture, 'en')
      return {
        mcp: (await callTool(client, writer, McpTool.ListDecisions, { projectId: project.id }))
          .text,
        prompt: JSON.stringify(await projectDesign(architecture)),
        review: 'problem' in source ? '' : JSON.stringify(source.decisions),
        assistant: JSON.stringify(
          await readAction('read_project_design', { projectId: project.id }, user),
        ),
        decision: await readAction('read_decision', { decisionId: id }, user),
      }
    }

    const before = await readers()
    assert.notInclude(before.mcp, title)
    assert.notInclude(before.prompt, title)
    assert.notInclude(before.review, title)
    assert.notInclude(before.assistant, title)
    assert.property(before.decision, 'error')

    // The owner sees it, with where it comes from.
    const listed = await client.get(`/projects/${project.id}/decisions`).headers(json).loginAs(user)
    listed.assertStatus(200)
    assert.deepInclude(listed.body().data[0], { id, origin: 'agent', supersedesId: null })

    // Nothing can set `agent`; `owner` keeps it.
    const back = await client
      .patch(`/decisions/${id}`)
      .headers(json)
      .loginAs(user)
      .json({ origin: 'agent' })
    back.assertStatus(422)
    const kept = await client
      .patch(`/decisions/${id}`)
      .headers(json)
      .loginAs(user)
      .json({ origin: 'owner' })
    kept.assertStatus(200)
    assert.include(kept.body().decision, { origin: 'owner', status: 'proposed' })

    const after = await readers()
    assert.include(after.mcp, title)
    assert.include(after.prompt, title)
    assert.include(after.review, title)
    assert.include(after.assistant, title)
    assert.equal(after.decision.title, title)

    // Accepted, it reaches the generated files too.
    await Decision.query().where('id', id).update({ status: 'accepted' })
    const files = await agentContextDesign(project.id, user.id)
    assert.include(JSON.stringify(files.decisions), title)
  })
})
