import db from '@adonisjs/lucid/services/db'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import AgentConfig from '#app/agent-configs/models/agent-config'
import type { CreatedApiTokenOutput } from '#app/api-tokens/validators/api-tokens-output'
import Decision from '#app/decisions/models/decision'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import { DESIGN_TOOLS, McpTool } from '#app/mcp/constants/mcp'
import Project from '#app/projects/models/project'
import Requirement from '#app/requirements/models/requirement'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

type Client = TestContext['client']

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }

/**
 * An account with a project that records a `should`, then a `must`, and three decisions: one
 * accepted (linked to the `must`), one still open and one superseded.
 */
async function setup(email: string) {
  const user = await User.create({ email, password: 'a-very-strong-passphrase' })
  const project = await Project.create({ userId: user.id, name: 'Shop', description: null })
  const requirement = (priority: 'must' | 'should', statement: string, measure: string | null) =>
    Requirement.create({
      projectId: project.id,
      userId: user.id,
      category: 'availability',
      priority,
      statement,
      measure,
    })
  await requirement('should', 'Hosting stays cheap.', null)
  const must = await requirement('must', 'Checkout stays up when mail is down.', '99.9 % a month')
  const decision = (title: string, status: Decision['status'], chosen: string) =>
    Decision.create({
      projectId: project.id,
      userId: user.id,
      title,
      context: null,
      options: [{ name: chosen, pros: 'Failures stay out.', cons: null }],
      chosen,
      consequences: status === 'accepted' ? 'One more worker to run.' : null,
      status,
      supersededById: null,
    })
  const accepted = await decision('How are mails sent?', 'accepted', 'Queue')
  await accepted.related('requirements').attach([must.id])
  await decision('Which cache?', 'proposed', 'Redis')
  await decision('Mails in the request', 'superseded', 'Direct call')
  return { user, project, must, accepted }
}

async function createToken(client: Client, user: User) {
  const response = await client
    .post('/account/api-tokens')
    .headers(json)
    .loginAs(user)
    .json({ name: 'Agent', abilities: ['read'], expiresInDays: 30 })
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

async function callTool(client: Client, secret: string, name: McpTool, args: object) {
  const response = await rpc(client, secret, 'tools/call', { name, arguments: args })
  response.assertStatus(200)
  const result = response.body().result as { content: { text: string }[]; isError?: true }
  return { ...result, text: result.content[0]?.text ?? '' }
}

test.group('Requirements and decisions for coding agents - MCP', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('the tools are listed only with design-records', async ({ client, assert }) => {
    const { user } = await setup('design-mcp-flag@example.com')
    await updateFlag(FeatureFlagKey.McpServer, ON, user)
    const secret = await createToken(client, user)
    const names = async () =>
      (await rpc(client, secret, 'tools/list'))
        .body()
        .result.tools.map((tool: { name: string }) => tool.name)

    for (const tool of DESIGN_TOOLS) assert.notInclude(await names(), tool)
    await updateFlag(FeatureFlagKey.DesignRecords, ON, user)
    assert.includeMembers(await names(), [...DESIGN_TOOLS])
  })

  test("lists the caller's requirements and the decisions still standing", async ({
    client,
    assert,
  }) => {
    const f = await setup('design-mcp-read@example.com')
    const other = await setup('design-mcp-read-other@example.com')
    await updateFlag(FeatureFlagKey.McpServer, ON, f.user)
    await updateFlag(FeatureFlagKey.DesignRecords, ON, f.user)
    const secret = await createToken(client, f.user)
    const args = { projectId: f.project.id }

    const requirements = await callTool(client, secret, McpTool.ListRequirements, args)
    assert.deepEqual(
      JSON.parse(requirements.text).map((item: { priority: string }) => item.priority),
      ['must', 'should'],
    )
    assert.include(requirements.text, '99.9 % a month')

    const standing = JSON.parse((await callTool(client, secret, McpTool.ListDecisions, args)).text)
    assert.deepEqual(
      standing.map((item: { status: string }) => item.status),
      ['accepted', 'proposed'],
    )
    assert.include(standing[0], { title: 'How are mails sent?', chosen: 'Queue' })
    assert.deepEqual(standing[0].requirementIds, [f.must.id])
    assert.equal(standing[0].options[0].pros, 'Failures stay out.')

    const all = await callTool(client, secret, McpTool.ListDecisions, {
      ...args,
      includeSuperseded: true,
    })
    assert.lengthOf(JSON.parse(all.text), 3)

    for (const tool of DESIGN_TOOLS) {
      const refused = await callTool(client, secret, tool, { projectId: other.project.id })
      assert.isTrue(refused.isError)
      assert.equal(refused.text, 'Project not found')
    }
  })
})

test.group('Requirements and decisions for coding agents - generated files', (group) => {
  // One global transaction for both: default flags, and no skill to suggest.
  group.each.setup(async () => {
    const rollback = await withDefaultFlags()
    await db.from('skill_snapshots').delete()
    await db.from('skills').delete()
    return rollback
  })

  test('AGENTS.md carries the requirements and the accepted decisions, and goes stale with them', async ({
    client,
    assert,
  }) => {
    const f = await setup('design-agents-md@example.com')
    const config = await AgentConfig.create({
      userId: f.user.id,
      projectId: f.project.id,
      name: 'Shop rules',
      targets: ['generic'],
    })
    const generate = async () => {
      const response = await client
        .post(`/agent-configs/${config.id}/generations`)
        .headers(json)
        .loginAs(f.user)
      response.assertStatus(201)
      const files = response.body().generation.files as { path: string; content: string }[]
      return files.find((file) => file.path === 'AGENTS.md')?.content ?? ''
    }

    // While the flag is off, nothing of the records is rendered.
    assert.notInclude(await generate(), 'Checkout stays up')

    await updateFlag(FeatureFlagKey.DesignRecords, ON, f.user)
    const agents = await generate()
    assert.include(
      agents,
      '- Must: Checkout stays up when mail is down. Met when: 99.9 % a month\n- Should: Hosting stays cheap.',
    )
    assert.include(agents, '- **How are mails sent?** Queue. One more worker to run.')
    assert.notInclude(agents, 'Which cache?')
    assert.notInclude(agents, 'Mails in the request')

    const detail = () => client.get(`/agent-configs/${config.id}`).headers(json).loginAs(f.user)
    assert.isFalse((await detail()).body().impact.stale)
    await f.accepted.merge({ status: 'superseded' }).save()
    const impact = (await detail()).body().impact
    assert.isTrue(impact.stale)
    assert.deepEqual(impact.files[0], {
      path: 'AGENTS.md',
      sections: ['Project'],
      change: 'modified',
    })
  })
})
