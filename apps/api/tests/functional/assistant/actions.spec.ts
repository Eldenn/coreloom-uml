import { readFileSync } from 'node:fs'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { CATALOG_VERSION, MARKER_PREFIX } from '@coreloom-uml/catalog'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { LanguageModel } from '@coreloom-uml/llm'
import { type ModelStep, toolCallingModel } from '@coreloom-uml/llm/testing'
import type { ApiClient } from '@japa/api-client'
import type { Assert } from '@japa/assert'
import { test } from '@japa/runner'
import { AGENT_GENERATIONS_KEPT } from '#app/agent-configs/constants/agent-config'
import AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import AgentConfigReadyRule from '#app/agent-configs/models/agent-config-ready-rule'
import AgentConfigRole from '#app/agent-configs/models/agent-config-role'
import AgentConfigRule from '#app/agent-configs/models/agent-config-rule'
import Architecture from '#app/architectures/models/architecture'
import { AssistantRole } from '#app/assistant/constants/assistant'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import { conversationHistory } from '#app/assistant/services/assistant-context'
import { CODE_MAP_LIMITS } from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import CodeMapSuggestion from '#app/code-maps/models/code-map-suggestion'
import DiagramCodeLink from '#app/code-maps/models/diagram-code-link'
import GithubCodeMapFollow from '#app/code-maps/models/github-code-map-follow'
import CodeReview from '#app/code-reviews/models/code-review'
import CodeReviewFinding from '#app/code-reviews/models/code-review-finding'
import Diagram from '#app/diagrams/models/diagram'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import ImportGithubCodeMapJob from '#app/jobs/import-github-code-map_job'
import LanguageModels from '#app/llm/services/language-models'
import { saveCodexTokens } from '#app/llm-connections/services/codex-connections'
import Project from '#app/projects/models/project'
import { applyVisibility, readAccessCode } from '#app/sharing/services/sharing'
import User from '#app/users/models/user'
import env from '#start/env'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
/** The fixture key: it must never show up in a response, a log line or the database. */
const KEY = 'sk-fixture-actions-never-stored'
const chat = {
  provider: { kind: 'mistral', model: 'mistral-small-latest' },
  apiKey: KEY,
  message: 'Tidy up my work',
  locale: 'en',
  // The owner let the assistant decide what the message needs.
  auto: true,
}
const SECTION = 'Architecture'
const E2B_KEY = env.get('E2B_API_KEY')
/** graphify's own output on part of this repository (see `packages/codemap/fixtures`). */
const GRAPH = readFileSync(app.makePath('../../packages/codemap/fixtures/adonis-graph.json'))

const call = (tool: string, input: unknown): ModelStep => ({ calls: [{ tool, input }] })

function useModel(model: LanguageModel) {
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
}

async function makeUser(email: string, { actions = true } = {}) {
  const user = await User.create({ email, password: 'a-very-strong-passphrase' })
  await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
  if (actions) await updateFlag(FeatureFlagKey.AssistantActions, ON, user)
  return user
}

/** An account with a project, an architecture and agent conventions holding one rule. */
async function setup(email: string, options: { actions?: boolean } = {}) {
  const user = await makeUser(email, options)
  const conversation = await AssistantConversation.create({ userId: user.id, title: '' })
  const project = await Project.create({ userId: user.id, name: 'Shop' })
  const architecture = await Architecture.create({
    userId: user.id,
    projectId: project.id,
    title: 'Zephyr',
    visibility: 'private',
  })
  await architecture.related('diagrams').create({ title: 'Main', kind: 'class', position: 0 })
  const config = await AgentConfig.create({
    userId: user.id,
    projectId: project.id,
    name: 'Shop rules',
    targets: ['generic'],
  })
  const rule = await AgentConfigRule.create({
    agentConfigId: config.id,
    section: SECTION,
    text: 'Use pnpm',
    source: 'manual',
    position: 0,
  })
  await config.refresh()
  const base = `/assistant/conversations/${conversation.id}/messages`
  return { user, conversation, project, architecture, config, rule, path: base }
}

const stored = (conversationId: number) =>
  AssistantMessage.query().where('conversationId', conversationId).orderBy('id', 'asc')

const answerPath = (
  conversationId: number,
  messageId: number,
  index: number,
  decision: 'accept' | 'reject',
) => `/assistant/conversations/${conversationId}/messages/${messageId}/actions/${index}/${decision}`

function firstAction(message: AssistantMessage) {
  const action = message.actions?.[0]
  if (!action) throw new Error('The message holds no action')
  return action
}

type Fixture = Awaited<ReturnType<typeof setup>>

/** Every write action: its input, the subject it shows, and how the accepted row looks. */
const WRITES: {
  name: string
  input: (f: Fixture) => Record<string, unknown>
  subject: (f: Fixture) => string | null
  destructive?: true
  check: (f: Fixture, result: { kind: string; id: number }, assert: Assert) => Promise<void>
}[] = [
  {
    name: 'create_project',
    input: () => ({ name: '  Storefront ' }),
    subject: () => null,
    async check(f, result, assert) {
      assert.equal(result.kind, 'project')
      const created = await Project.findOrFail(result.id)
      assert.equal(created.name, 'Storefront')
      assert.equal(created.userId, f.user.id)
    },
  },
  {
    name: 'rename_project',
    input: (f) => ({ projectId: f.project.id, name: 'Storefront' }),
    subject: () => 'Shop',
    async check(f, result, assert) {
      assert.deepEqual(result, { kind: 'project', id: f.project.id })
      await f.project.refresh()
      assert.equal(f.project.name, 'Storefront')
    },
  },
  {
    name: 'create_architecture',
    input: (f) => ({ title: 'Billing', projectId: f.project.id }),
    subject: () => 'Shop',
    async check(f, result, assert) {
      assert.equal(result.kind, 'architecture')
      const created = await Architecture.query()
        .where('id', result.id)
        .preload('diagrams')
        .firstOrFail()
      assert.equal(created.title, 'Billing')
      assert.equal(created.projectId, f.project.id)
      assert.lengthOf(created.diagrams, 1)
    },
  },
  {
    name: 'rename_architecture',
    input: (f) => ({ architectureId: f.architecture.id, title: 'Zephyr 2' }),
    subject: () => 'Zephyr',
    async check(f, result, assert) {
      assert.deepEqual(result, { kind: 'architecture', id: f.architecture.id })
      await f.architecture.refresh()
      assert.equal(f.architecture.title, 'Zephyr 2')
    },
  },
  {
    name: 'duplicate_architecture',
    input: (f) => ({ architectureId: f.architecture.id }),
    subject: () => 'Zephyr',
    async check(f, result, assert) {
      const copy = await Architecture.query()
        .where('id', result.id)
        .preload('diagrams')
        .firstOrFail()
      assert.equal(copy.title, 'Zephyr (copy)')
      assert.equal(copy.projectId, f.project.id)
      assert.deepEqual(
        copy.diagrams.map((diagram) => diagram.title),
        ['Main'],
      )
    },
  },
  {
    name: 'add_rule',
    input: (f) => ({ agentConfigId: f.config.id, section: SECTION, text: 'Write tests first' }),
    subject: () => 'Shop rules',
    async check(f, result, assert) {
      assert.deepEqual(result, { kind: 'agent-config', id: f.config.id })
      const rules = await AgentConfigRule.query().where('agentConfigId', f.config.id)
      assert.sameMembers(
        rules.map((rule) => rule.text),
        ['Use pnpm', 'Write tests first'],
      )
      const revision = f.config.revision
      await f.config.refresh()
      assert.equal(f.config.revision, revision + 1)
    },
  },
  {
    name: 'edit_rule',
    input: (f) => ({ agentConfigId: f.config.id, ruleId: f.rule.id, text: 'Use pnpm 10' }),
    subject: () => 'Use pnpm',
    async check(f, _result, assert) {
      await f.rule.refresh()
      assert.equal(f.rule.text, 'Use pnpm 10')
      const revision = f.config.revision
      await f.config.refresh()
      assert.equal(f.config.revision, revision + 1)
    },
  },
  {
    name: 'remove_rule',
    input: (f) => ({ agentConfigId: f.config.id, ruleId: f.rule.id }),
    subject: () => 'Use pnpm',
    destructive: true,
    async check(f, _result, assert) {
      assert.isNull(await AgentConfigRule.find(f.rule.id))
      const revision = f.config.revision
      await f.config.refresh()
      assert.equal(f.config.revision, revision + 1)
    },
  },
  {
    name: 'set_ready_rule',
    input: (f) => ({ agentConfigId: f.config.id, slot: 'typescript.any', rule: 'agree' }),
    subject: () => 'Shop rules',
    async check(f, _result, assert) {
      const rows = await AgentConfigReadyRule.query().where('agentConfigId', f.config.id)
      assert.deepEqual(
        rows.map((row) => [row.slot, row.rule, row.value]),
        [['typescript.any', 'agree', null]],
      )
    },
  },
]

/** Sends the message to a model that calls `steps`, and answers the response. */
async function send(
  client: ApiClient,
  fixture: { user: User; path: string },
  steps: ModelStep[],
  body: Record<string, unknown> = {},
) {
  const model = toolCallingModel(steps)
  useModel(model)
  const response = await client
    .post(fixture.path)
    .headers(json)
    .loginAs(fixture.user)
    .json({ ...chat, ...body })
  return { response, model }
}

function toolResults(model: ReturnType<typeof toolCallingModel>): string {
  return JSON.stringify(
    model.doGenerateCalls.flatMap((item) => item.prompt.filter((m) => m.role === 'tool')),
  )
}

test.group('Assistant actions - proposing', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('with the flag off, the message is a plain chat with no tool', async ({
    client,
    assert,
  }) => {
    const fixture = await setup('actions-off@example.com', { actions: false })
    const { response, model } = await send(client, fixture, [{ text: 'Hello.' }])

    response.assertStatus(200)
    assert.isNull(response.body().handoff)
    assert.lengthOf(response.body().messages, 2)
    assert.isNull(response.body().messages[1].actions)
    assert.isUndefined(model.doGenerateCalls[0]?.tools)
  })

  test('reads with a read tool, then stores a reply with no action', async ({ client, assert }) => {
    const fixture = await setup('actions-read@example.com')
    const { response, model } = await send(
      client,
      fixture,
      [call('list_projects', {}), { text: 'You have one project, Shop.' }],
      { page: { kind: 'project', id: fixture.project.id } },
    )

    response.assertStatus(200)
    assert.equal(response.body().messages[1].content, 'You have one project, Shop.')
    assert.isNull(response.body().messages[1].actions)
    assert.include(toolResults(model), 'Shop')
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    assert.include(prompt, `<page kind=\\"project\\" id=\\"${fixture.project.id}\\"`)
    const [, answered] = await stored(fixture.conversation.id)
    assert.isNull(answered?.actions)
  })

  test('reads agent conventions and finds ready-made rules', async ({ client, assert }) => {
    const fixture = await setup('actions-read-config@example.com')
    const { response, model } = await send(client, fixture, [
      call('read_agent_config', { agentConfigId: fixture.config.id }),
      call('find_ready_rules', { query: 'any' }),
      { text: 'Read.' },
    ])

    response.assertStatus(200)
    const shown = toolResults(model)
    assert.include(shown, 'Use pnpm')
    assert.include(shown, 'typescript.any')
  })

  test("never reads another account's agent conventions", async ({ client, assert }) => {
    const fixture = await setup('actions-read-own@example.com')
    const other = await setup('actions-read-other@example.com')
    const { model } = await send(client, fixture, [
      call('read_agent_config', { agentConfigId: other.config.id }),
      call('list_architectures', { projectId: other.project.id }),
      { text: 'Nothing.' },
    ])

    const shown = toolResults(model)
    assert.include(shown, 'Not found')
    assert.notInclude(shown, 'Use pnpm')
    assert.notInclude(shown, 'Zephyr')
  })

  for (const write of WRITES) {
    test(`${write.name}: proposed, then accepted once`, async ({ client, assert }) => {
      const fixture = await setup(`actions-${write.name}@example.com`)
      const input = write.input(fixture)
      const { response } = await send(client, fixture, [
        call(write.name, input),
        { text: 'I proposed it.' },
      ])

      response.assertStatus(200)
      assert.isNull(response.body().handoff)
      const answered = response.body().messages[1]
      assert.lengthOf(answered.actions, 1)
      const [action] = answered.actions
      assert.equal(action.name, write.name)
      assert.equal(action.status, 'pending')
      assert.equal(action.index, 0)
      assert.equal(action.subject, write.subject(fixture))
      assert.equal(action.destructive, write.destructive === true)
      assert.isNull(action.result)

      const accept = answerPath(fixture.conversation.id, answered.id, 0, 'accept')
      const accepted = await client.post(accept).headers(json).loginAs(fixture.user)
      accepted.assertStatus(200)
      assert.equal(accepted.body().action.status, 'accepted')
      await write.check(fixture, accepted.body().action.result, assert)

      const again = await client.post(accept).headers(json).loginAs(fixture.user)
      again.assertStatus(409)
      assert.equal(again.body().error.code, 'not_pending')
      assert.equal(again.body().action.status, 'accepted')
    })
  }

  test('a rejected action writes nothing and cannot be accepted after', async ({
    client,
    assert,
  }) => {
    const fixture = await setup('actions-reject@example.com')
    const { response } = await send(client, fixture, [
      call('rename_project', { projectId: fixture.project.id, name: 'Storefront' }),
      { text: 'Proposed.' },
    ])
    const messageId = response.body().messages[1].id

    const rejected = await client
      .post(answerPath(fixture.conversation.id, messageId, 0, 'reject'))
      .headers(json)
      .loginAs(fixture.user)
    rejected.assertStatus(200)
    assert.equal(rejected.body().action.status, 'rejected')
    ;(
      await client
        .post(answerPath(fixture.conversation.id, messageId, 0, 'accept'))
        .headers(json)
        .loginAs(fixture.user)
    ).assertStatus(409)
    await fixture.project.refresh()
    assert.equal(fixture.project.name, 'Shop')
  })

  test('without `auto`, the message is a plain chat even with the flag on', async ({
    client,
    assert,
  }) => {
    const fixture = await setup('actions-not-auto@example.com')
    const { response, model } = await send(client, fixture, [{ text: 'Hello.' }], {
      auto: undefined,
    })

    response.assertStatus(200)
    assert.isNull(response.body().handoff)
    assert.lengthOf(model.doGenerateCalls[0]?.tools ?? [], 0)
  })

  test('a rule the catalog would refuse is not proposed: the model is told why', async ({
    client,
    assert,
  }) => {
    const fixture = await setup('actions-refused-early@example.com')
    const agentConfigId = fixture.config.id
    const { response, model } = await send(client, fixture, [
      {
        calls: [
          { tool: 'add_rule', input: { agentConfigId, section: 'No such section', text: 'x' } },
          { tool: 'set_ready_rule', input: { agentConfigId, slot: 'no.such-slot', rule: 'x' } },
        ],
      },
      { text: 'Neither can be done.' },
    ])

    response.assertStatus(200)
    assert.isNull(response.body().messages[1].actions)
    assert.include(toolResults(model), 'Unknown section')
    assert.include(toolResults(model), 'Unknown slot')
  })

  test("an action on another account's work is never proposed", async ({ client, assert }) => {
    const fixture = await setup('actions-foreign@example.com')
    const other = await setup('actions-foreign-other@example.com')
    const { response, model } = await send(client, fixture, [
      {
        calls: [
          { tool: 'rename_project', input: { projectId: other.project.id, name: 'Mine' } },
          {
            tool: 'rename_architecture',
            input: { architectureId: other.architecture.id, title: 'Mine' },
          },
          {
            tool: 'add_rule',
            input: { agentConfigId: other.config.id, section: SECTION, text: 'Mine' },
          },
          {
            tool: 'remove_rule',
            input: { agentConfigId: fixture.config.id, ruleId: other.rule.id },
          },
        ],
      },
      { text: 'None of these exist.' },
    ])

    response.assertStatus(200)
    assert.isNull(response.body().messages[1].actions)
    assert.include(toolResults(model), 'Not found')
    assert.notInclude(toolResults(model), 'Shop')
  })

  test('the proposals of one message are capped', async ({ client, assert }) => {
    const fixture = await setup('actions-cap@example.com')
    const calls = Array.from({ length: 12 }, (_, n) => ({
      tool: 'create_project',
      input: { name: `P${n}` },
    }))
    const { response } = await send(client, fixture, [{ calls }, { text: 'Many.' }])

    response.assertStatus(200)
    assert.lengthOf(response.body().messages[1].actions, 10)
  })

  test('a blank reply with actions is stored; a blank one without is a 502', async ({
    client,
    assert,
  }) => {
    const fixture = await setup('actions-blank@example.com')
    const proposed = await send(client, fixture, [
      call('create_project', { name: 'Storefront' }),
      { text: '  ' },
    ])
    proposed.response.assertStatus(200)
    assert.equal(proposed.response.body().messages[1].content, '')

    const blank = await send(client, fixture, [{ text: '  ' }])
    blank.response.assertStatus(502)
    assert.equal(blank.response.body().reason, 'unknown')
    assert.lengthOf(await stored(fixture.conversation.id), 2)
  })

  test('the history carries one line per message of actions, never their input', async ({
    client,
    assert,
  }) => {
    const fixture = await setup('actions-history@example.com')
    const { response } = await send(client, fixture, [
      {
        calls: [
          { tool: 'rename_project', input: { projectId: fixture.project.id, name: 'Secret' } },
          {
            tool: 'add_rule',
            input: { agentConfigId: fixture.config.id, section: SECTION, text: 'Hidden' },
          },
        ],
      },
      { text: 'Proposed two.' },
    ])
    const messageId = response.body().messages[1].id
    ;(
      await client
        .post(answerPath(fixture.conversation.id, messageId, 0, 'accept'))
        .headers(json)
        .loginAs(fixture.user)
    ).assertStatus(200)

    const history = await conversationHistory(fixture.conversation)
    const last = history.at(-1)
    assert.equal(last?.role, AssistantRole.Assistant)
    assert.equal(
      last?.text,
      'Proposed two.\nproposed: rename_project (accepted), add_rule (pending)',
    )
  })

  test('the key and the inputs never reach a log, and the key never the database', async ({
    client,
    assert,
  }) => {
    const fixture = await setup('actions-leaks@example.com')
    const logs = captureLogs()
    const { response } = await send(client, fixture, [
      call('rename_project', { projectId: fixture.project.id, name: 'Confidential name' }),
      { text: 'Proposed.' },
    ])
    logs.restore()

    response.assertStatus(200)
    const logged = logs.lines.join('\n')
    assert.include(logged, 'rename_project')
    assert.notInclude(logged, KEY)
    assert.notInclude(logged, 'Confidential name')
    assert.notInclude(logged, 'Tidy up my work')
    assert.notInclude(JSON.stringify(response.body()), KEY)
    assert.notInclude(await dumpDatabase(), KEY)
  })
})

test.group('Assistant actions - accepting', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  async function proposed(
    client: ApiClient,
    email: string,
    name: string,
    input: (f: Fixture) => object,
  ) {
    const fixture = await setup(email)
    const { response } = await send(client, fixture, [
      call(name, input(fixture)),
      { text: 'Proposed.' },
    ])
    response.assertStatus(200)
    const message = await AssistantMessage.findOrFail(response.body().messages[1].id)
    return {
      fixture,
      message,
      accept: () =>
        client
          .post(answerPath(fixture.conversation.id, message.id, 0, 'accept'))
          .headers(json)
          .loginAs(fixture.user),
    }
  }

  test("a stored target changed to another account's is failed, and nothing is written", async ({
    client,
    assert,
  }) => {
    const other = await setup('actions-swap-other@example.com')
    const { message, accept } = await proposed(
      client,
      'actions-swap@example.com',
      'rename_project',
      (f) => ({ projectId: f.project.id, name: 'Taken' }),
    )
    const action = firstAction(message)
    message.actions = [{ ...action, input: { projectId: other.project.id, name: 'Taken' } }]
    await message.save()

    const response = await accept()

    response.assertStatus(409)
    assert.equal(response.body().error.code, 'not_found')
    assert.equal(response.body().action.status, 'failed')
    assert.equal(response.body().action.failure, 'not_found')
    await other.project.refresh()
    assert.equal(other.project.name, 'Shop')
    await message.refresh()
    assert.equal(message.actions?.[0]?.status, 'failed')
  })

  test('a target deleted since the proposal is failed', async ({ client, assert }) => {
    const { fixture, accept } = await proposed(
      client,
      'actions-gone@example.com',
      'rename_architecture',
      (f) => ({ architectureId: f.architecture.id, title: 'Later' }),
    )
    await fixture.architecture.delete()

    const response = await accept()

    response.assertStatus(409)
    assert.equal(response.body().action.failure, 'not_found')
  })

  test('an input the route would refuse is a 422 and failed', async ({ client, assert }) => {
    const { fixture, message, accept } = await proposed(
      client,
      'actions-invalid@example.com',
      'add_rule',
      (f) => ({ agentConfigId: f.config.id, section: SECTION, text: 'Fine' }),
    )
    const action = firstAction(message)
    message.actions = [{ ...action, input: { ...action.input, text: `${MARKER_PREFIX}begin` } }]
    await message.save()

    const response = await accept()

    response.assertStatus(422)
    assert.equal(response.body().error.code, 'invalid')
    assert.equal(response.body().action.status, 'failed')
    assert.lengthOf(await AgentConfigRule.query().where('agentConfigId', fixture.config.id), 1)
  })

  test('an unknown section is refused by the route service: 422 and failed', async ({
    client,
    assert,
  }) => {
    const { message, accept } = await proposed(
      client,
      'actions-section@example.com',
      'add_rule',
      (f) => ({ agentConfigId: f.config.id, section: SECTION, text: 'Fine' }),
    )
    // The catalog lost the section since the proposal.
    const action = firstAction(message)
    message.actions = [{ ...action, input: { ...action.input, section: 'Nowhere' } }]
    await message.save()

    const response = await accept()

    response.assertStatus(422)
    assert.include(response.body().error.message, 'Unknown section')
    assert.equal(response.body().action.failure, 'invalid')
  })

  test('an action the registry no longer knows is failed', async ({ client, assert }) => {
    const { message, accept } = await proposed(
      client,
      'actions-unknown@example.com',
      'create_project',
      () => ({ name: 'X' }),
    )
    message.actions = [{ ...firstAction(message), name: 'drop_everything' }]
    await message.save()

    const response = await accept()

    response.assertStatus(409)
    assert.equal(response.body().action.failure, 'not_found')
  })

  test("404 for another account's conversation, a missing action, or a flag off", async ({
    client,
  }) => {
    const { fixture, message } = await proposed(
      client,
      'actions-404@example.com',
      'create_project',
      () => ({ name: 'X' }),
    )
    const other = await makeUser('actions-404-other@example.com')
    const path = answerPath(fixture.conversation.id, message.id, 0, 'accept')

    ;(await client.post(path).headers(json).loginAs(other)).assertStatus(404)
    ;(
      await client
        .post(answerPath(fixture.conversation.id, message.id, 5, 'accept'))
        .headers(json)
        .loginAs(fixture.user)
    ).assertStatus(404)
    await updateFlag(
      FeatureFlagKey.AssistantActions,
      { enabled: false, rollout: 0, rules: [] },
      fixture.user,
    )
    ;(await client.post(path).headers(json).loginAs(fixture.user)).assertStatus(404)
  })

  test('refuses an API token (401)', async ({ client }) => {
    const { fixture, message } = await proposed(
      client,
      'actions-token@example.com',
      'create_project',
      () => ({ name: 'X' }),
    )
    const token = await User.accessTokens.create(fixture.user, ['read', 'write'], { name: 'ci' })
    const auth = { authorization: `Bearer ${token.value?.release()}` }
    ;(
      await client
        .post(answerPath(fixture.conversation.id, message.id, 0, 'accept'))
        .headers({ ...json, ...auth })
    ).assertStatus(401)
    ;(
      await client
        .post(fixture.path)
        .headers({ ...json, ...auth })
        .json(chat)
    ).assertStatus(401)
  })
})

test.group('Assistant actions - handing over', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => {
    app.container.restore(LanguageModels)
    env.set('E2B_API_KEY' as never, E2B_KEY as never)
  })

  test('work_on_diagrams hands over and stores nothing', async ({ client, assert }) => {
    const fixture = await setup('actions-diagrams@example.com')
    const { response } = await send(client, fixture, [
      call('create_project', { name: 'Dropped' }),
      call('work_on_diagrams', { architectureId: fixture.architecture.id }),
    ])

    response.assertStatus(200)
    assert.deepEqual(response.body(), {
      messages: [],
      handoff: { kind: 'diagrams', architectureId: fixture.architecture.id },
    })
    assert.lengthOf(await stored(fixture.conversation.id), 0)
  })

  test("work_on_diagrams on another account's architecture is refused", async ({
    client,
    assert,
  }) => {
    const fixture = await setup('actions-diagrams-own@example.com')
    const other = await setup('actions-diagrams-other@example.com')
    const { response, model } = await send(client, fixture, [
      call('work_on_diagrams', { architectureId: other.architecture.id }),
      { text: 'No such architecture.' },
    ])

    response.assertStatus(200)
    assert.isNull(response.body().handoff)
    assert.include(toolResults(model), 'Not found')
  })

  test('research_web hands over, only with web-research on', async ({ client, assert }) => {
    env.set('E2B_API_KEY' as never, 'e2b_fixture' as never)
    const fixture = await setup('actions-web@example.com')

    const off = await send(client, fixture, [{ text: 'No research here.' }])
    off.response.assertStatus(200)
    const offered = off.model.doGenerateCalls[0]?.tools?.map((item) => item.name) ?? []
    assert.include(offered, 'work_on_diagrams')
    assert.notInclude(offered, 'research_web')

    await updateFlag(FeatureFlagKey.WebResearch, ON, fixture.user)
    const { response } = await send(client, fixture, [
      call('research_web', { agentConfigId: fixture.config.id }),
    ])
    response.assertStatus(200)
    assert.deepEqual(response.body().handoff, { kind: 'web', agentConfigId: fixture.config.id })
    assert.lengthOf(await stored(fixture.conversation.id), 2)
  })

  test('the ChatGPT subscription gets a plain chat', async ({ client, assert }) => {
    const fixture = await setup('actions-codex@example.com')
    await updateFlag(FeatureFlagKey.LlmSubscriptionChatgpt, ON, fixture.user)
    await saveCodexTokens(fixture.user, {
      accessToken: 'codex-access',
      refreshToken: 'codex-refresh',
      expiresAt: new Date(Date.now() + 3600_000),
      accountId: 'acct-1',
    })
    const { response, model } = await send(client, fixture, [{ text: 'Plain.' }], {
      provider: { kind: 'openai-codex', model: 'gpt-5.5' },
      apiKey: null,
    })

    response.assertStatus(200)
    assert.isNull(response.body().handoff)
    assert.isUndefined(model.doGenerateCalls[0]?.tools)
  })
})

test.group('Assistant actions - deleting and sharing', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => {
    drive.fake()
    return () => drive.restore()
  })
  group.each.teardown(() => app.container.restore(LanguageModels))

  /** A stored code map of the fixture's project, with its file in Drive. */
  async function codeMapOf(f: Fixture, key: string) {
    await drive.use().put(key, 'map')
    return CodeMap.create({
      projectId: f.project.id,
      userId: f.user.id,
      source: 'upload',
      extractor: 'graphify',
      extractorVersion: '0.9.108',
      status: 'ready',
      nodeCount: 0,
      edgeCount: 0,
      storageKey: key,
    })
  }

  /** Proposes one call and answers the stored message and its first action. */
  async function propose(client: ApiClient, f: Fixture, tool: string, input: object) {
    const { response, model } = await send(client, f, [call(tool, input), { text: 'Proposed.' }])
    response.assertStatus(200)
    const message = response.body().messages[1]
    const answer = (decision: 'accept' | 'reject') =>
      client
        .post(answerPath(f.conversation.id, message.id, 0, decision))
        .headers(json)
        .loginAs(f.user)
    return { message, action: message.actions?.[0], model, answer }
  }

  async function makeProtected(architecture: Architecture) {
    await architecture.refresh()
    applyVisibility(architecture, 'protected')
    await architecture.save()
    return {
      token: architecture.shareToken as string,
      code: readAccessCode(architecture) as string,
    }
  }

  test('delete_project: proposed with what goes with it, its files deleted only on accept', async ({
    client,
    assert,
  }) => {
    const f = await setup('actions-delete-project@example.com')
    await f.architecture
      .related('diagrams')
      .create({ title: 'Flow', kind: 'sequence', position: 1 })
    await codeMapOf(f, 'code-maps/test/a.json.gz')
    await codeMapOf(f, 'code-maps/test/b.json.gz')

    const { action, answer } = await propose(client, f, 'delete_project', {
      projectId: f.project.id,
    })
    assert.equal(action.subject, 'Shop')
    assert.isTrue(action.destructive)
    assert.deepEqual(action.impact, { architectures: 1, diagrams: 2, agentConfigs: 1, codeMaps: 2 })
    assert.isNull(action.before)
    assert.isTrue(await drive.use().exists('code-maps/test/a.json.gz'))

    const accepted = await answer('accept')
    accepted.assertStatus(200)
    assert.equal(accepted.body().action.status, 'accepted')
    assert.isNull(accepted.body().action.result)
    assert.isNull(await Project.find(f.project.id))
    assert.isNull(await Architecture.find(f.architecture.id))
    assert.isNull(await AgentConfig.find(f.config.id))
    assert.lengthOf(await CodeMap.query().where('projectId', f.project.id), 0)
    assert.isFalse(await drive.use().exists('code-maps/test/a.json.gz'))
    assert.isFalse(await drive.use().exists('code-maps/test/b.json.gz'))
  })

  test('delete_project rejected: the project and its files stay', async ({ client, assert }) => {
    const f = await setup('actions-delete-project-no@example.com')
    await codeMapOf(f, 'code-maps/test/c.json.gz')
    const { answer } = await propose(client, f, 'delete_project', { projectId: f.project.id })

    const rejected = await answer('reject')
    rejected.assertStatus(200)
    assert.equal(rejected.body().action.status, 'rejected')
    assert.isNotNull(await Project.find(f.project.id))
    assert.isTrue(await drive.use().exists('code-maps/test/c.json.gz'))
  })

  test('delete_architecture: proposed with its diagrams, then the row is gone', async ({
    client,
    assert,
  }) => {
    const f = await setup('actions-delete-architecture@example.com')
    const { action, answer } = await propose(client, f, 'delete_architecture', {
      architectureId: f.architecture.id,
    })
    assert.equal(action.subject, 'Zephyr')
    assert.isTrue(action.destructive)
    assert.deepEqual(action.impact, { diagrams: 1 })

    const accepted = await answer('accept')
    accepted.assertStatus(200)
    assert.isNull(accepted.body().action.result)
    assert.isNull(await Architecture.find(f.architecture.id))
    assert.isNotNull(await Project.find(f.project.id))
  })

  test('delete_agent_config: proposed with its rules, then the row is gone', async ({
    client,
    assert,
  }) => {
    const f = await setup('actions-delete-config@example.com')
    const { action, answer } = await propose(client, f, 'delete_agent_config', {
      agentConfigId: f.config.id,
    })
    assert.equal(action.subject, 'Shop rules')
    assert.deepEqual(action.impact, { rules: 1 })

    const accepted = await answer('accept')
    accepted.assertStatus(200)
    assert.isNull(accepted.body().action.result)
    assert.isNull(await AgentConfig.find(f.config.id))
    assert.isNull(await AgentConfigRule.find(f.rule.id))
  })

  test('a deletion that would take more than its card says is not applied: the card is refreshed', async ({
    client,
    assert,
  }) => {
    const f = await setup('actions-delete-grown@example.com')
    const { action, answer } = await propose(client, f, 'delete_project', {
      projectId: f.project.id,
    })
    assert.equal(action.impact.architectures, 1)
    await Architecture.create({
      userId: f.user.id,
      projectId: f.project.id,
      title: 'Added since',
      visibility: 'private',
    })

    const refused = await answer('accept')
    refused.assertStatus(409)
    assert.equal(refused.body().error.code, 'changed')
    assert.equal(refused.body().action.status, 'pending')
    assert.equal(refused.body().action.impact.architectures, 2)
    assert.isNotNull(await Project.find(f.project.id))

    // The owner has now seen what goes: the same card can be accepted.
    const accepted = await answer('accept')
    accepted.assertStatus(200)
    assert.isNull(await Project.find(f.project.id))
  })

  test('delete_agent_config counts the ready-made rules it holds too', async ({
    client,
    assert,
  }) => {
    const f = await setup('actions-delete-config-ready@example.com')
    await AgentConfigReadyRule.create({
      agentConfigId: f.config.id,
      slot: 'testing.levels',
      rule: 'unit',
      value: null,
    })
    const { action } = await propose(client, f, 'delete_agent_config', {
      agentConfigId: f.config.id,
    })
    assert.deepEqual(action.impact, { rules: 1, readyRules: 1 })
  })

  test('leaving protected is destructive: the access code and every grant are lost', async ({
    client,
    assert,
  }) => {
    const f = await setup('actions-sharing-leave@example.com')
    await makeProtected(f.architecture)
    const { action } = await propose(client, f, 'set_architecture_sharing', {
      architectureId: f.architecture.id,
      visibility: 'private',
    })
    assert.isTrue(action.destructive)
  })

  test('a sharing change proposed from another visibility than the current one is not applied', async ({
    client,
    assert,
  }) => {
    const f = await setup('actions-sharing-stale@example.com')
    const { answer } = await propose(client, f, 'set_architecture_sharing', {
      architectureId: f.architecture.id,
      visibility: 'public',
    })
    await makeProtected(f.architecture)

    const refused = await answer('accept')
    refused.assertStatus(409)
    assert.equal(refused.body().error.code, 'changed')
    assert.equal(refused.body().action.before, 'protected')
    assert.isTrue(refused.body().action.destructive)
    await f.architecture.refresh()
    assert.equal(f.architecture.visibility, 'protected')
  })

  test('an action stored before impact and before existed answers them as null', async ({
    client,
    assert,
  }) => {
    const f = await setup('actions-old-shape@example.com')
    const { message, answer } = await propose(client, f, 'rename_project', {
      projectId: f.project.id,
      name: 'Later',
    })
    const row = await AssistantMessage.findOrFail(message.id)
    const { impact: _impact, before: _before, ...old } = firstAction(row)
    row.actions = [old]
    await row.save()

    const rejected = await answer('reject')
    rejected.assertStatus(200)
    assert.isNull(rejected.body().action.impact)
    assert.isNull(rejected.body().action.before)
  })

  test('a deletion with nothing in it stores no impact', async ({ client, assert }) => {
    const f = await setup('actions-delete-empty@example.com')
    const empty = await Project.create({ userId: f.user.id, name: 'Empty' })
    const { action } = await propose(client, f, 'delete_project', { projectId: empty.id })
    assert.isNull(action.impact)
  })

  test('a deletion retargeted to another account fails not_found and deletes nothing', async ({
    client,
    assert,
  }) => {
    const f = await setup('actions-delete-swap@example.com')
    const other = await setup('actions-delete-swap-other@example.com')
    await codeMapOf(other, 'code-maps/test/other.json.gz')
    const { message, answer } = await propose(client, f, 'delete_project', {
      projectId: f.project.id,
    })
    const row = await AssistantMessage.findOrFail(message.id)
    row.actions = [{ ...firstAction(row), input: { projectId: other.project.id } }]
    await row.save()

    const response = await answer('accept')
    response.assertStatus(409)
    assert.equal(response.body().action.failure, 'not_found')
    assert.isNotNull(await Project.find(other.project.id))
    assert.isTrue(await drive.use().exists('code-maps/test/other.json.gz'))
  })

  test("a deletion or a sharing change of another account's work is never proposed", async ({
    client,
    assert,
  }) => {
    const f = await setup('actions-delete-foreign@example.com')
    const other = await setup('actions-delete-foreign-other@example.com')
    const { response, model } = await send(client, f, [
      {
        calls: [
          { tool: 'delete_project', input: { projectId: other.project.id } },
          { tool: 'delete_architecture', input: { architectureId: other.architecture.id } },
          { tool: 'delete_agent_config', input: { agentConfigId: other.config.id } },
          {
            tool: 'set_architecture_sharing',
            input: { architectureId: other.architecture.id, visibility: 'public' },
          },
          { tool: 'regenerate_share_link', input: { architectureId: other.architecture.id } },
          { tool: 'regenerate_access_code', input: { architectureId: other.architecture.id } },
        ],
      },
      { text: 'None of these exist.' },
    ])

    response.assertStatus(200)
    assert.isNull(response.body().messages[1].actions)
    assert.include(toolResults(model), 'Not found')
    assert.notInclude(toolResults(model), 'Zephyr')
  })

  test('set_architecture_sharing: stores the visibility before, then changes it', async ({
    client,
    assert,
  }) => {
    const f = await setup('actions-sharing@example.com')
    const { action, answer } = await propose(client, f, 'set_architecture_sharing', {
      architectureId: f.architecture.id,
      visibility: 'protected',
    })
    assert.equal(action.subject, 'Zephyr')
    assert.isFalse(action.destructive)
    assert.equal(action.before, 'private')
    assert.isNull(action.impact)

    const accepted = await answer('accept')
    accepted.assertStatus(200)
    assert.deepEqual(accepted.body().action.result, {
      kind: 'architecture',
      id: f.architecture.id,
    })
    await f.architecture.refresh()
    assert.equal(f.architecture.visibility, 'protected')
    assert.isString(f.architecture.shareToken)
    assert.isString(readAccessCode(f.architecture))
  })

  test('set_architecture_sharing to the visibility it has is refused', async ({
    client,
    assert,
  }) => {
    const f = await setup('actions-sharing-noop@example.com')
    const { response, model } = await send(client, f, [
      call('set_architecture_sharing', {
        architectureId: f.architecture.id,
        visibility: 'private',
      }),
      { text: 'Already private.' },
    ])
    response.assertStatus(200)
    assert.isNull(response.body().messages[1].actions)
    assert.include(toolResults(model), 'already private')
  })

  test('regenerate_share_link: the old link no longer opens', async ({ client, assert }) => {
    const f = await setup('actions-link@example.com')
    applyVisibility(f.architecture, 'public')
    await f.architecture.save()
    const old = f.architecture.shareToken as string
    const { action, answer } = await propose(client, f, 'regenerate_share_link', {
      architectureId: f.architecture.id,
    })
    assert.isTrue(action.destructive)
    assert.equal(action.subject, 'Zephyr')

    const accepted = await answer('accept')
    accepted.assertStatus(200)
    await f.architecture.refresh()
    assert.notEqual(f.architecture.shareToken, old)
    ;(await client.get(`/shared/${old}`).headers(json)).assertStatus(404)
    ;(await client.get(`/shared/${f.architecture.shareToken}`).headers(json)).assertStatus(200)
  })

  test('regenerate_access_code: the old code no longer unlocks', async ({ client, assert }) => {
    const f = await setup('actions-code@example.com')
    const { token, code } = await makeProtected(f.architecture)
    const { action, answer } = await propose(client, f, 'regenerate_access_code', {
      architectureId: f.architecture.id,
    })
    assert.isTrue(action.destructive)

    const accepted = await answer('accept')
    accepted.assertStatus(200)
    await f.architecture.refresh()
    const fresh = readAccessCode(f.architecture) as string
    assert.notEqual(fresh, code)
    ;(await client.post(`/shared/${token}/unlock`).headers(json).json({ code })).assertStatus(422)
  })

  test('regenerate_access_code: refused when not protected, conflict when it stopped being', async ({
    client,
    assert,
  }) => {
    const f = await setup('actions-code-conflict@example.com')
    const refused = await send(client, f, [
      call('regenerate_access_code', { architectureId: f.architecture.id }),
      { text: 'Not protected.' },
    ])
    refused.response.assertStatus(200)
    assert.isNull(refused.response.body().messages[1].actions)
    assert.include(toolResults(refused.model), 'Only a protected architecture')

    await makeProtected(f.architecture)
    const { answer } = await propose(client, f, 'regenerate_access_code', {
      architectureId: f.architecture.id,
    })
    applyVisibility(f.architecture, 'public')
    await f.architecture.save()

    const response = await answer('accept')
    response.assertStatus(409)
    assert.equal(response.body().error.code, 'conflict')
    assert.equal(response.body().action.failure, 'conflict')
    await f.architecture.refresh()
    assert.equal(f.architecture.visibility, 'public')
  })

  test('list_architectures answers the visibility; no link, token or code ever reaches the model or a message', async ({
    client,
    assert,
  }) => {
    const f = await setup('actions-secrets@example.com')
    const first = await makeProtected(f.architecture)
    const sent = await send(client, f, [
      {
        calls: [
          { tool: 'list_architectures', input: {} },
          { tool: 'regenerate_share_link', input: { architectureId: f.architecture.id } },
          { tool: 'regenerate_access_code', input: { architectureId: f.architecture.id } },
          {
            tool: 'set_architecture_sharing',
            input: { architectureId: f.architecture.id, visibility: 'public' },
          },
        ],
      },
      { text: 'Proposed.' },
    ])
    sent.response.assertStatus(200)
    assert.include(toolResults(sent.model), 'protected')
    const messageId = sent.response.body().messages[1].id
    const bodies: unknown[] = []
    for (const index of [0, 1, 2]) {
      const accepted = await client
        .post(answerPath(f.conversation.id, messageId, index, 'accept'))
        .headers(json)
        .loginAs(f.user)
      accepted.assertStatus(200)
      bodies.push(accepted.body())
    }
    await f.architecture.refresh()
    const after = { token: f.architecture.shareToken as string }
    const later = await send(client, f, [call('list_architectures', {}), { text: 'Listed.' }])

    const secrets = [first.token, first.code, after.token]
    const messages = JSON.stringify(await stored(f.conversation.id))
    const shown = [
      toolResults(sent.model),
      toolResults(later.model),
      JSON.stringify(sent.model.doGenerateCalls),
      JSON.stringify(later.model.doGenerateCalls),
      JSON.stringify(bodies),
      messages,
    ].join('\n')
    for (const secret of secrets) assert.notInclude(shown, secret)
  })
})

test.group('Assistant actions - roles and generations', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  const ROLE = {
    slug: 'reviewer',
    name: 'Reviewer',
    description: 'Reviews the changes',
    mission: 'Read every change and say what is wrong with it.',
    rights: ['read' as const],
    scope: ['apps/api'],
    forbidden: [],
    done: { commands: [], text: null },
    escalation: null,
    source: null,
  }

  /** The fixture with `agent-roles` on (unless told otherwise) and one role. */
  async function withRoles(email: string, { roles = true } = {}) {
    const f = await setup(email)
    if (roles) await updateFlag(FeatureFlagKey.AgentRoles, ON, f.user)
    const role = await AgentConfigRole.create({ ...ROLE, agentConfigId: f.config.id })
    return { ...f, role }
  }

  async function propose(client: ApiClient, f: Fixture, tool: string, input: object) {
    const { response, model } = await send(client, f, [call(tool, input), { text: 'Proposed.' }])
    response.assertStatus(200)
    const message = response.body().messages[1]
    const answer = (decision: 'accept' | 'reject') =>
      client
        .post(answerPath(f.conversation.id, message.id, 0, decision))
        .headers(json)
        .loginAs(f.user)
    return { message, action: message.actions?.[0], model, answer }
  }

  async function revisionOf(f: Fixture) {
    await f.config.refresh()
    return f.config.revision
  }

  test('add_role_from_preset: proposed with the conventions, then the role is copied', async ({
    client,
    assert,
  }) => {
    const f = await withRoles('roles-preset@example.com')
    const revision = await revisionOf(f)
    const { action, answer } = await propose(client, f, 'add_role_from_preset', {
      agentConfigId: f.config.id,
      preset: 'code-reviewer',
    })
    assert.equal(action.subject, 'Shop rules')
    assert.isFalse(action.destructive)

    const accepted = await answer('accept')
    accepted.assertStatus(200)
    assert.deepEqual(accepted.body().action.result, { kind: 'agent-config', id: f.config.id })
    const role = await AgentConfigRole.query()
      .where({ agentConfigId: f.config.id, slug: 'code-reviewer' })
      .firstOrFail()
    assert.equal(role.source?.preset, 'code-reviewer')
    assert.equal(await revisionOf(f), revision + 1)
  })

  test('add_role: proposed with its fields, then the role is stored', async ({
    client,
    assert,
  }) => {
    const f = await withRoles('roles-add@example.com')
    const revision = await revisionOf(f)
    const { action, answer } = await propose(client, f, 'add_role', {
      agentConfigId: f.config.id,
      slug: 'api-dev',
      name: 'API developer',
      description: 'Builds the API',
      mission: 'Build the endpoints.',
      rights: ['read', 'write'],
      scope: ['apps/api'],
    })
    assert.equal(action.subject, 'Shop rules')
    assert.equal(action.input.name, 'API developer')

    ;(await answer('accept')).assertStatus(200)
    const role = await AgentConfigRole.query()
      .where({ agentConfigId: f.config.id, slug: 'api-dev' })
      .firstOrFail()
    assert.deepEqual(role.scope, ['apps/api'])
    assert.deepEqual(role.rights, ['read', 'write'])
    assert.equal(await revisionOf(f), revision + 1)
  })

  test('edit_role: names the role, keeps a fingerprint, then changes only the fields given', async ({
    client,
    assert,
  }) => {
    const f = await withRoles('roles-edit@example.com')
    const revision = await revisionOf(f)
    const { action, answer } = await propose(client, f, 'edit_role', {
      agentConfigId: f.config.id,
      roleId: f.role.id,
      name: 'Code reviewer',
    })
    assert.equal(action.subject, 'Reviewer')
    assert.isString(action.before)
    assert.notInclude(action.before, 'Read every change')
    assert.isFalse(action.destructive)

    ;(await answer('accept')).assertStatus(200)
    await f.role.refresh()
    assert.equal(f.role.name, 'Code reviewer')
    assert.equal(f.role.mission, ROLE.mission)
    assert.equal(await revisionOf(f), revision + 1)
  })

  test('remove_role: destructive, then the role is gone', async ({ client, assert }) => {
    const f = await withRoles('roles-remove@example.com')
    const revision = await revisionOf(f)
    const { action, answer } = await propose(client, f, 'remove_role', {
      agentConfigId: f.config.id,
      roleId: f.role.id,
    })
    assert.equal(action.subject, 'Reviewer')
    assert.isTrue(action.destructive)

    ;(await answer('accept')).assertStatus(200)
    assert.isNull(await AgentConfigRole.find(f.role.id))
    assert.equal(await revisionOf(f), revision + 1)
  })

  test('generate_files: proposed with the revision, then a generation is rendered', async ({
    client,
    assert,
  }) => {
    const f = await withRoles('roles-generate@example.com')
    const revision = await revisionOf(f)
    const { action, answer } = await propose(client, f, 'generate_files', {
      agentConfigId: f.config.id,
    })
    assert.equal(action.subject, 'Shop rules')
    assert.equal(action.before, String(revision))
    assert.isNull(action.impact)
    assert.isFalse(action.destructive)

    const accepted = await answer('accept')
    accepted.assertStatus(200)
    assert.deepEqual(accepted.body().action.result, { kind: 'agent-config', id: f.config.id })
    const generation = await AgentConfigGeneration.query()
      .where('agentConfigId', f.config.id)
      .firstOrFail()
    assert.equal(generation.revision, revision)
    assert.equal(generation.catalogVersion, CATALOG_VERSION)
    assert.isAbove(generation.files.length, 0)
  })

  test('a rejected role action writes nothing', async ({ client, assert }) => {
    const f = await withRoles('roles-reject@example.com')
    const { answer } = await propose(client, f, 'remove_role', {
      agentConfigId: f.config.id,
      roleId: f.role.id,
    })
    ;(await answer('reject')).assertStatus(200)
    assert.isNotNull(await AgentConfigRole.find(f.role.id))
  })

  test('with agent-roles off, no role tool is offered; generate_files still is', async ({
    client,
    assert,
  }) => {
    const f = await withRoles('roles-off@example.com', { roles: false })
    const { model } = await send(client, f, [{ text: 'Nothing.' }])
    const offered = model.doGenerateCalls[0]?.tools?.map((item) => item.name) ?? []
    for (const name of [
      'find_role_presets',
      'add_role_from_preset',
      'add_role',
      'edit_role',
      'remove_role',
    ])
      assert.notInclude(offered, name)
    assert.include(offered, 'generate_files')
    assert.include(offered, 'read_agent_config')
  })

  test('a role action accepted after agent-roles was turned off fails not_found', async ({
    client,
    assert,
  }) => {
    const f = await withRoles('roles-off-later@example.com')
    const { answer } = await propose(client, f, 'remove_role', {
      agentConfigId: f.config.id,
      roleId: f.role.id,
    })
    await updateFlag(FeatureFlagKey.AgentRoles, { enabled: false, rollout: 0, rules: [] }, f.user)

    const refused = await answer('accept')
    refused.assertStatus(409)
    assert.equal(refused.body().error.code, 'not_found')
    assert.equal(refused.body().action.failure, 'not_found')
    assert.isNotNull(await AgentConfigRole.find(f.role.id))
  })

  test('an unknown preset, a slug taken or an invalid role is not proposed', async ({
    client,
    assert,
  }) => {
    const f = await withRoles('roles-refused@example.com')
    const agentConfigId = f.config.id
    await AgentConfigRole.create({ ...ROLE, slug: 'tester', agentConfigId })
    const role = {
      agentConfigId,
      name: 'Pusher',
      description: 'Pushes',
      mission: 'Push.',
    }
    const { response, model } = await send(client, f, [
      {
        calls: [
          { tool: 'add_role_from_preset', input: { agentConfigId, preset: 'no-such-preset' } },
          { tool: 'add_role', input: { ...role, slug: 'reviewer', rights: ['read'] } },
          { tool: 'add_role', input: { ...role, slug: 'pusher', rights: ['read', 'push'] } },
          { tool: 'edit_role', input: { agentConfigId, roleId: f.role.id, slug: 'tester' } },
        ],
      },
      { text: 'None.' },
    ])

    response.assertStatus(200)
    assert.isNull(response.body().messages[1].actions)
    const shown = toolResults(model)
    assert.include(shown, 'Unknown preset')
    assert.include(shown, 'A role with this slug already exists')
    assert.include(shown, 'push needs commit')
  })

  test('a slug taken between the proposal and the accept is a conflict', async ({
    client,
    assert,
  }) => {
    const f = await withRoles('roles-slug-later@example.com')
    const { answer } = await propose(client, f, 'add_role_from_preset', {
      agentConfigId: f.config.id,
      preset: 'code-reviewer',
    })
    await AgentConfigRole.create({ ...ROLE, slug: 'code-reviewer', agentConfigId: f.config.id })

    const refused = await answer('accept')
    refused.assertStatus(409)
    assert.equal(refused.body().error.code, 'conflict')
    assert.lengthOf(await AgentConfigRole.query().where('agentConfigId', f.config.id), 2)
  })

  test('generate_files after the conventions changed: the card shows the new revision', async ({
    client,
    assert,
  }) => {
    const f = await withRoles('roles-generate-stale@example.com')
    const revision = await revisionOf(f)
    const { answer } = await propose(client, f, 'generate_files', { agentConfigId: f.config.id })
    f.config.revision += 1
    await f.config.save()

    const refused = await answer('accept')
    refused.assertStatus(409)
    assert.equal(refused.body().error.code, 'changed')
    assert.equal(refused.body().action.before, String(revision + 1))
    assert.lengthOf(await AgentConfigGeneration.query().where('agentConfigId', f.config.id), 0)

    ;(await answer('accept')).assertStatus(200)
    const generation = await AgentConfigGeneration.query()
      .where('agentConfigId', f.config.id)
      .firstOrFail()
    assert.equal(generation.revision, revision + 1)
  })

  test('generate_files at the limit says the oldest generation is dropped', async ({
    client,
    assert,
  }) => {
    const f = await withRoles('roles-generate-limit@example.com')
    const rows = Array.from({ length: AGENT_GENERATIONS_KEPT }, () => ({
      agentConfigId: f.config.id,
      revision: 1,
      catalogVersion: CATALOG_VERSION,
      inputs: {} as AgentConfigGeneration['inputs'],
      files: [],
      recommendations: [],
      skills: { compatible: [], conflicting: [] },
    }))
    const [oldest] = await AgentConfigGeneration.createMany(rows)
    const { action, answer } = await propose(client, f, 'generate_files', {
      agentConfigId: f.config.id,
    })
    assert.deepEqual(action.impact, { droppedGenerations: 1 })
    assert.isTrue(action.destructive)

    ;(await answer('accept')).assertStatus(200)
    assert.isNull(await AgentConfigGeneration.find(oldest.id))
    assert.lengthOf(
      await AgentConfigGeneration.query().where('agentConfigId', f.config.id),
      AGENT_GENERATIONS_KEPT,
    )
  })

  test('a role edited by hand since the proposal is not applied: the card is refreshed', async ({
    client,
    assert,
  }) => {
    const f = await withRoles('roles-edit-stale@example.com')
    const { action, answer } = await propose(client, f, 'edit_role', {
      agentConfigId: f.config.id,
      roleId: f.role.id,
      name: 'Code reviewer',
    })
    f.role.mission = 'Something else entirely.'
    await f.role.save()

    const refused = await answer('accept')
    refused.assertStatus(409)
    assert.equal(refused.body().error.code, 'changed')
    assert.notEqual(refused.body().action.before, action.before)
    await f.role.refresh()
    assert.equal(f.role.name, 'Reviewer')
  })

  test('a role renamed by hand since the proposal: the refreshed card carries its new name', async ({
    client,
    assert,
  }) => {
    const f = await withRoles('roles-remove-renamed@example.com')
    const { answer } = await propose(client, f, 'remove_role', {
      agentConfigId: f.config.id,
      roleId: f.role.id,
    })
    f.role.name = 'Release manager'
    await f.role.save()

    const refused = await answer('accept')
    refused.assertStatus(409)
    assert.equal(refused.body().error.code, 'changed')
    assert.equal(refused.body().action.subject, 'Release manager')
  })

  test("another account's conventions or role are never proposed nor applied", async ({
    client,
    assert,
  }) => {
    const f = await withRoles('roles-own@example.com')
    const other = await withRoles('roles-other@example.com')
    const { response, model } = await send(client, f, [
      {
        calls: [
          {
            tool: 'add_role_from_preset',
            input: { agentConfigId: other.config.id, preset: 'code-reviewer' },
          },
          { tool: 'remove_role', input: { agentConfigId: f.config.id, roleId: other.role.id } },
          { tool: 'generate_files', input: { agentConfigId: other.config.id } },
        ],
      },
      { text: 'None.' },
    ])
    response.assertStatus(200)
    assert.isNull(response.body().messages[1].actions)
    assert.include(toolResults(model), 'Not found')

    const { message, answer } = await propose(client, f, 'remove_role', {
      agentConfigId: f.config.id,
      roleId: f.role.id,
    })
    const row = await AssistantMessage.findOrFail(message.id)
    const stored = firstAction(row)
    row.actions = [{ ...stored, input: { agentConfigId: other.config.id, roleId: other.role.id } }]
    await row.save()
    const refused = await answer('accept')
    refused.assertStatus(409)
    assert.equal(refused.body().error.code, 'not_found')
    assert.isNotNull(await AgentConfigRole.find(other.role.id))
  })

  test('read_agent_config answers roles only with agent-roles on, never a file', async ({
    client,
    assert,
  }) => {
    const f = await withRoles('roles-read@example.com')
    await AgentConfigGeneration.create({
      agentConfigId: f.config.id,
      revision: 1,
      catalogVersion: CATALOG_VERSION,
      inputs: {} as AgentConfigGeneration['inputs'],
      files: [{ path: 'AGENTS.md', kind: 'instructions', content: 'GENERATED-SECRET-CONTENT' }],
      recommendations: [],
      skills: { compatible: [], conflicting: [] },
    } as never)
    const on = await send(client, f, [
      call('read_agent_config', { agentConfigId: f.config.id }),
      call('find_role_presets', { query: 'code reviewer' }),
      { text: 'Read.' },
    ])
    const shown = toolResults(on.model)
    assert.include(shown, 'reviewer')
    assert.include(shown, 'code-reviewer')
    assert.include(shown, 'revision')
    assert.notInclude(shown, 'GENERATED-SECRET-CONTENT')

    await updateFlag(FeatureFlagKey.AgentRoles, { enabled: false, rollout: 0, rules: [] }, f.user)
    const off = await send(client, f, [
      call('read_agent_config', { agentConfigId: f.config.id }),
      { text: 'Read.' },
    ])
    const hidden = toolResults(off.model)
    assert.notInclude(hidden, 'reviewer')
    assert.include(hidden, 'revision')
  })
})

test.group('Assistant actions - code maps', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => {
    drive.fake()
    return () => drive.restore()
  })
  group.each.setup(() => {
    const previous = env.get('ANALYZER_URL')
    env.set('ANALYZER_URL', 'http://analyzer.test:8080')
    return () => env.set('ANALYZER_URL', previous ?? '')
  })
  /** The import job is never queued for real: the calls are recorded instead. */
  let dispatched: unknown[] = []
  group.each.setup(() => {
    dispatched = []
    const own = Object.getOwnPropertyDescriptor(ImportGithubCodeMapJob, 'dispatch')
    Object.defineProperty(ImportGithubCodeMapJob, 'dispatch', {
      configurable: true,
      writable: true,
      value: async (data: unknown) => {
        dispatched.push(data)
      },
    })
    return () => {
      if (own) Object.defineProperty(ImportGithubCodeMapJob, 'dispatch', own)
      else delete (ImportGithubCodeMapJob as unknown as Record<string, unknown>).dispatch
    }
  })
  group.each.teardown(() => app.container.restore(LanguageModels))

  const CODE_TOOLS = [
    'list_code_maps',
    'read_code_conformance',
    'list_diagram_code_links',
    'import_code_map_from_github',
    'delete_code_map',
    'stop_following_repository',
    'set_diagram_code_links',
    'resolve_review_finding',
    'delete_code_review',
  ]
  const APP_DIR = 'apps/api/app'

  /** The fixture with `code-maps` on, a map of this repository's API and a package diagram. */
  async function withCode(client: ApiClient, email: string) {
    const f = await setup(email)
    await updateFlag(FeatureFlagKey.CodeMaps, ON, f.user)
    const uploaded = await client
      .post(`/projects/${f.project.id}/code-maps`)
      .headers(json)
      .loginAs(f.user)
      .file('file', GRAPH, { filename: 'graph.json' })
      .field('repositoryUrl', 'https://github.com/acme/shop')
      .field('commitSha', 'abc1234def')
    uploaded.assertStatus(201)
    const codeMap = await CodeMap.findOrFail(uploaded.body().codeMap.id)
    const diagram = await Diagram.create({
      architectureId: f.architecture.id,
      title: 'Packages',
      kind: 'package',
      format: 'mermaid',
      content: {
        kind: 'package',
        elements: [
          { id: 'app', kind: 'package', label: 'apps/api/app' },
          { id: 'architectures', kind: 'package', label: 'architectures', parent: 'app' },
          { id: 'projects', kind: 'package', label: 'projects', parent: 'app' },
          { id: 'billing', kind: 'package', label: 'billing', parent: 'app' },
        ],
        relations: [],
      },
      position: 1,
      version: 1,
    })
    return { ...f, codeMap, diagram }
  }
  type CodeFixture = Awaited<ReturnType<typeof withCode>>

  /** A done review of the diagram with one open finding per comment. */
  async function reviewOf(f: CodeFixture, comments = ['Projects reach into architectures.']) {
    const review = await CodeReview.create({
      projectId: f.project.id,
      userId: f.user.id,
      codeMapId: f.codeMap.id,
      repositoryUrl: 'https://github.com/acme/shop',
      branch: 'main',
      commitSha: 'abc1234',
      providerKind: 'mistral',
      model: 'test-model',
      includeSnippets: false,
      locale: 'en',
      diagrams: [
        {
          diagramId: f.diagram.id,
          title: f.diagram.title,
          kind: f.diagram.kind,
          status: 'done',
          reason: null,
          findingCount: comments.length,
          dropped: 0,
          truncated: false,
          source: null,
          reviewedAt: '2026-11-17T05:00:00.000Z',
        },
      ],
    })
    const findings = []
    for (const comment of comments) {
      findings.push(
        await CodeReviewFinding.create({
          codeReviewId: review.id,
          diagramId: f.diagram.id,
          elementId: 'projects',
          status: 'deviates',
          severity: 'high',
          comment,
          evidence: [{ key: `${APP_DIR}/projects/` }],
          resolution: 'open',
        }),
      )
    }
    return { review, findings }
  }

  async function propose(client: ApiClient, f: Fixture, tool: string, input: object) {
    const { response, model } = await send(client, f, [call(tool, input), { text: 'Proposed.' }])
    response.assertStatus(200)
    const message = response.body().messages[1]
    const answer = (decision: 'accept' | 'reject') =>
      client
        .post(answerPath(f.conversation.id, message.id, 0, decision))
        .headers(json)
        .loginAs(f.user)
    return { message, action: message.actions?.[0], model, answer }
  }

  /** Proposes calls that must all be refused: no action is stored, the model is told. */
  async function refused(client: ApiClient, f: Fixture, calls: { tool: string; input: unknown }[]) {
    const { response, model } = await send(client, f, [{ calls }, { text: 'None.' }])
    response.assertStatus(200)
    return { actions: response.body().messages[1].actions, told: toolResults(model) }
  }

  const linksOf = async (diagram: Diagram) =>
    (await DiagramCodeLink.query().where('diagramId', diagram.id).orderBy('elementId')).map(
      (link) => [link.elementId, link.codeKey, link.status],
    )

  test('with code-maps off, none of the nine tools is offered', async ({ client, assert }) => {
    const f = await setup('code-off@example.com')
    const { model } = await send(client, f, [{ text: 'Nothing.' }])
    const offered = model.doGenerateCalls[0]?.tools?.map((item) => item.name) ?? []
    for (const name of CODE_TOOLS) assert.notInclude(offered, name)
    assert.include(offered, 'list_projects')
  })

  test('a code action accepted after code-maps was turned off fails not_found', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-off-later@example.com')
    const { answer } = await propose(client, f, 'delete_code_map', { codeMapId: f.codeMap.id })
    await updateFlag(FeatureFlagKey.CodeMaps, { enabled: false, rollout: 0, rules: [] }, f.user)

    const response = await answer('accept')
    response.assertStatus(409)
    assert.equal(response.body().action.failure, 'not_found')
    assert.isNotNull(await CodeMap.find(f.codeMap.id))
  })

  test("the reads answer the caller's maps, conformance and links, never another account's", async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-reads@example.com')
    const other = await withCode(client, 'code-reads-other@example.com')
    await GithubCodeMapFollow.create({
      projectId: f.project.id,
      userId: f.user.id,
      repositoryId: 42,
      repositoryUrl: 'https://github.com/acme/followed',
      branch: 'main',
    })
    const { findings } = await reviewOf(f)
    await reviewOf(other, ['OTHER-ACCOUNT-FINDING'])
    await DiagramCodeLink.create({
      diagramId: f.diagram.id,
      elementId: 'projects',
      codeKey: `${APP_DIR}/projects/`,
      status: 'confirmed',
    })

    const { model } = await send(client, f, [
      {
        calls: [
          { tool: 'list_code_maps', input: { projectId: f.project.id } },
          { tool: 'read_code_conformance', input: { projectId: f.project.id } },
          {
            tool: 'list_diagram_code_links',
            input: { codeMapId: f.codeMap.id, diagramId: f.diagram.id },
          },
        ],
      },
      { text: 'Read.' },
    ])
    const shown = toolResults(model)
    assert.include(shown, 'https://github.com/acme/shop')
    assert.include(shown, 'abc1234def')
    assert.include(shown, 'https://github.com/acme/followed')
    // The open finding of the newest review, by id, and the match's own sentences and levels.
    assert.include(shown, 'Projects reach into architectures.')
    assert.include(shown, `\\"id\\":${findings[0]?.id}`)
    assert.include(shown, '\\"level\\":\\"error\\"')
    assert.include(shown, `${APP_DIR}/projects/`)
    assert.include(shown, `${APP_DIR}/architectures/`)
    assert.notInclude(shown, 'OTHER-ACCOUNT-FINDING')

    const foreign = await send(client, f, [
      {
        calls: [
          { tool: 'list_code_maps', input: { projectId: other.project.id } },
          { tool: 'read_code_conformance', input: { projectId: other.project.id } },
          {
            tool: 'list_diagram_code_links',
            input: { codeMapId: other.codeMap.id, diagramId: other.diagram.id },
          },
          // A diagram of another account against the caller's own map.
          {
            tool: 'list_diagram_code_links',
            input: { codeMapId: f.codeMap.id, diagramId: other.diagram.id },
          },
        ],
      },
      { text: 'Read.' },
    ])
    const hidden = toolResults(foreign.model)
    assert.notInclude(hidden, 'OTHER-ACCOUNT-FINDING')
    assert.notInclude(hidden, 'abc1234def')
    assert.equal(hidden.split('Not found').length - 1, 4)
  })

  test('import_code_map_from_github: stores the clean URL, queues the job only on accept', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-import@example.com')
    const { action, answer } = await propose(client, f, 'import_code_map_from_github', {
      projectId: f.project.id,
      url: ' https://github.com/acme/shop.git ',
      branch: 'develop',
      follow: false,
    })
    assert.equal(action.subject, 'Shop')
    assert.isFalse(action.destructive)
    assert.deepEqual(action.input, {
      projectId: f.project.id,
      url: 'https://github.com/acme/shop',
      branch: 'develop',
      follow: false,
    })
    assert.lengthOf(dispatched, 0)
    assert.lengthOf(await CodeMap.query().where('projectId', f.project.id), 1)

    const accepted = await answer('accept')
    accepted.assertStatus(200)
    assert.deepEqual(accepted.body().action.result, { kind: 'project', id: f.project.id })
    const pending = await CodeMap.query()
      .where('projectId', f.project.id)
      .where('status', 'pending')
      .firstOrFail()
    assert.equal(pending.repositoryUrl, 'https://github.com/acme/shop')
    assert.equal(pending.branch, 'develop')
    assert.equal(pending.source, 'github')
    // What the route queues.
    assert.deepEqual(dispatched, [{ codeMapId: pending.id }])
  })

  test('an import that drops the oldest map says so, and is destructive', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-import-full@example.com')
    for (let n = 1; n < CODE_MAP_LIMITS.perProject; n++) {
      await CodeMap.create({
        projectId: f.project.id,
        userId: f.user.id,
        source: f.codeMap.source,
        repositoryUrl: null,
        branch: null,
        commitSha: null,
        extractor: f.codeMap.extractor,
        extractorVersion: f.codeMap.extractorVersion,
        status: 'ready',
        failureReason: null,
        nodeCount: 0,
        edgeCount: 0,
        storageKey: null,
      })
    }
    const { action } = await propose(client, f, 'import_code_map_from_github', {
      projectId: f.project.id,
      url: 'https://github.com/acme/shop',
    })
    assert.deepEqual(action.impact, { droppedCodeMaps: 1 })
    assert.isTrue(action.destructive)
  })

  test('an import that changes the follow shows what is followed now, and is refreshed if that changed', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-import-follow@example.com')
    const follow = await GithubCodeMapFollow.create({
      projectId: f.project.id,
      userId: f.user.id,
      repositoryId: 7,
      repositoryUrl: 'https://github.com/acme/a',
      branch: null,
    })
    const { action, answer } = await propose(client, f, 'import_code_map_from_github', {
      projectId: f.project.id,
      url: 'https://github.com/acme/b',
      follow: false,
    })
    assert.equal(action.before, JSON.stringify(['https://github.com/acme/a', null]))

    await follow.merge({ repositoryUrl: 'https://github.com/acme/c' }).save()
    const stale = await answer('accept')
    stale.assertStatus(409)
    assert.equal(stale.body().error.code, 'changed')
    assert.lengthOf(dispatched, 0)
    assert.isNotNull(await GithubCodeMapFollow.findBy('projectId', f.project.id))
  })

  test('an import whose job cannot be queued is failed, with no map and the follow untouched', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-import-queue-down@example.com')
    await GithubCodeMapFollow.create({
      projectId: f.project.id,
      userId: f.user.id,
      repositoryId: 7,
      repositoryUrl: 'https://github.com/acme/a',
      branch: null,
    })
    const { answer } = await propose(client, f, 'import_code_map_from_github', {
      projectId: f.project.id,
      url: 'https://github.com/acme/b',
      follow: false,
    })
    Object.defineProperty(ImportGithubCodeMapJob, 'dispatch', {
      configurable: true,
      writable: true,
      value: async () => {
        throw new Error('queue down')
      },
    })

    const failed = await answer('accept')
    failed.assertStatus(503)
    assert.equal(failed.body().action.status, 'failed')
    assert.equal(failed.body().action.failure, 'unavailable')
    assert.isNull(failed.body().action.result)
    assert.lengthOf(await CodeMap.query().where('projectId', f.project.id), 1)
    assert.isNotNull(await GithubCodeMapFollow.findBy('projectId', f.project.id))
  })

  test('a stored import with a branch that is not one, or a link listed twice, is invalid at accept', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-import-tampered@example.com')
    const { message, answer } = await propose(client, f, 'import_code_map_from_github', {
      projectId: f.project.id,
      url: 'https://github.com/acme/shop',
      branch: 'main',
    })
    const row = await AssistantMessage.findOrFail(message.id)
    const [stored] = row.actions ?? []
    row.actions = [{ ...stored, input: { ...stored.input, branch: '--upload-pack=x' } }]
    await row.save()

    const refusedAccept = await answer('accept')
    refusedAccept.assertStatus(422)
    assert.equal(refusedAccept.body().action.failure, 'invalid')
    assert.lengthOf(dispatched, 0)
  })

  test('a rejected import or deletion writes nothing and queues nothing', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-reject@example.com')
    const imported = await propose(client, f, 'import_code_map_from_github', {
      projectId: f.project.id,
      url: 'https://github.com/acme/shop',
    })
    ;(await imported.answer('reject')).assertStatus(200)
    const deleted = await propose(client, f, 'delete_code_map', { codeMapId: f.codeMap.id })
    ;(await deleted.answer('reject')).assertStatus(200)

    assert.lengthOf(dispatched, 0)
    assert.lengthOf(await CodeMap.query().where('projectId', f.project.id), 1)
    assert.isTrue(await drive.use().exists(f.codeMap.storageKey as string))
  })

  test('a URL the route refuses is never proposed, and a token in it never stored', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-import-refused@example.com')
    const logs = captureLogs()
    const { actions, told } = await refused(client, f, [
      {
        tool: 'import_code_map_from_github',
        input: {
          projectId: f.project.id,
          url: 'https://octo:ghp_SECRETTOKEN42@github.com/acme/shop',
        },
      },
      {
        tool: 'import_code_map_from_github',
        input: { projectId: f.project.id, url: 'https://gitlab.com/acme/shop' },
      },
      {
        tool: 'import_code_map_from_github',
        input: { projectId: f.project.id, url: 'https://github.com/acme/shop/tree/main' },
      },
      {
        tool: 'import_code_map_from_github',
        input: {
          projectId: f.project.id,
          url: 'https://github.com/acme/shop',
          branch: '--upload-pack=x',
        },
      },
    ])
    logs.restore()
    assert.isNull(actions)
    assert.include(told, 'Not a GitHub repository')
    assert.include(told, 'Not a branch name')
    assert.notInclude(logs.lines.join('\n'), 'ghp_SECRETTOKEN42')
    assert.notInclude(await dumpDatabase(), 'ghp_SECRETTOKEN42')
    assert.lengthOf(dispatched, 0)
  })

  test('an import is refused at proposal without an analyzer, or to follow without the App', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-import-off@example.com')
    const follow = await refused(client, f, [
      {
        tool: 'import_code_map_from_github',
        input: { projectId: f.project.id, url: 'https://github.com/acme/shop', follow: true },
      },
    ])
    assert.isNull(follow.actions)
    assert.include(follow.told, 'GitHub App')

    env.set('ANALYZER_URL', '')
    const off = await refused(client, f, [
      {
        tool: 'import_code_map_from_github',
        input: { projectId: f.project.id, url: 'https://github.com/acme/shop' },
      },
    ])
    assert.isNull(off.actions)
    assert.include(off.told, 'not set up')
  })

  test('an import accepted while the project is being read fails conflict and queues nothing', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-import-running@example.com')
    const { answer } = await propose(client, f, 'import_code_map_from_github', {
      projectId: f.project.id,
      url: 'https://github.com/acme/shop',
    })
    await CodeMap.create({
      projectId: f.project.id,
      userId: f.user.id,
      source: 'github',
      repositoryUrl: 'https://github.com/acme/shop',
      extractor: 'graphify',
      extractorVersion: '0.9.108',
      status: 'pending',
      nodeCount: 0,
      edgeCount: 0,
      storageKey: null,
    })

    const response = await answer('accept')
    response.assertStatus(409)
    assert.equal(response.body().action.failure, 'conflict')
    assert.lengthOf(dispatched, 0)
    assert.lengthOf(await CodeMap.query().where('projectId', f.project.id), 2)
  })

  test('delete_code_map: says what goes with it, deletes the file only on accept', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-delete-map@example.com')
    await CodeMapSuggestion.create({
      codeMapId: f.codeMap.id,
      kind: 'sequence',
      title: 'Login',
      reason: 'The main flow',
      focus: [],
      status: 'open',
      position: 0,
    })
    await DiagramCodeLink.create({
      diagramId: f.diagram.id,
      elementId: 'projects',
      codeKey: `${APP_DIR}/projects/`,
      status: 'confirmed',
    })
    const { action, answer } = await propose(client, f, 'delete_code_map', {
      codeMapId: f.codeMap.id,
    })
    assert.isTrue(action.destructive)
    assert.include(action.subject, 'https://github.com/acme/shop')
    assert.include(action.subject, 'abc1234')
    assert.deepEqual(action.impact, { suggestions: 1 })
    const key = f.codeMap.storageKey as string
    assert.isTrue(await drive.use().exists(key))

    const accepted = await answer('accept')
    accepted.assertStatus(200)
    assert.isNull(accepted.body().action.result)
    assert.isNull(await CodeMap.find(f.codeMap.id))
    assert.isFalse(await drive.use().exists(key))
    // Links are the diagram's, not the map's: they stay.
    assert.lengthOf(await linksOf(f.diagram), 1)
  })

  test('stop_following_repository: shows the repository, then the follow is gone', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-unfollow@example.com')
    const none = await refused(client, f, [
      { tool: 'stop_following_repository', input: { projectId: f.project.id } },
    ])
    assert.isNull(none.actions)
    assert.include(none.told, 'follows no GitHub repository')

    await GithubCodeMapFollow.create({
      projectId: f.project.id,
      userId: f.user.id,
      repositoryId: 42,
      repositoryUrl: 'https://github.com/acme/shop',
      branch: null,
    })
    const { action, answer } = await propose(client, f, 'stop_following_repository', {
      projectId: f.project.id,
    })
    assert.equal(action.subject, 'Shop')
    assert.deepEqual(JSON.parse(action.before), ['https://github.com/acme/shop', null])

    const accepted = await answer('accept')
    accepted.assertStatus(200)
    assert.deepEqual(accepted.body().action.result, { kind: 'project', id: f.project.id })
    assert.isNull(await GithubCodeMapFollow.findBy('projectId', f.project.id))
  })

  test('set_diagram_code_links: only the links named change, the others stay', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-links@example.com')
    await DiagramCodeLink.createMany([
      { diagramId: f.diagram.id, elementId: 'app', codeKey: `${APP_DIR}/`, status: 'confirmed' },
      {
        diagramId: f.diagram.id,
        elementId: 'projects',
        codeKey: `${APP_DIR}/projects/`,
        status: 'confirmed',
      },
    ])
    const { action, answer } = await propose(client, f, 'set_diagram_code_links', {
      codeMapId: f.codeMap.id,
      diagramId: f.diagram.id,
      add: [{ elementId: 'architectures', codeKey: `${APP_DIR}/architectures/` }],
      remove: [{ elementId: 'app', codeKey: `${APP_DIR}/` }],
    })
    assert.equal(action.subject, 'Packages')
    assert.isFalse(action.destructive)
    assert.match(action.before, /^[0-9a-f]{16}$/)
    assert.lengthOf(await linksOf(f.diagram), 2)

    const accepted = await answer('accept')
    accepted.assertStatus(200)
    assert.deepEqual(accepted.body().action.result, { kind: 'project', id: f.project.id })
    assert.deepEqual(await linksOf(f.diagram), [
      ['architectures', `${APP_DIR}/architectures/`, 'confirmed'],
      ['projects', `${APP_DIR}/projects/`, 'confirmed'],
    ])
  })

  test('set_diagram_code_links: what could never apply is not proposed', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-links-refused@example.com')
    await DiagramCodeLink.create({
      diagramId: f.diagram.id,
      elementId: 'projects',
      codeKey: `${APP_DIR}/projects/`,
      status: 'confirmed',
    })
    const target = { codeMapId: f.codeMap.id, diagramId: f.diagram.id }
    const { actions, told } = await refused(client, f, [
      { tool: 'set_diagram_code_links', input: { ...target } },
      {
        tool: 'set_diagram_code_links',
        input: { ...target, add: [{ elementId: 'projects', codeKey: 'nowhere/' }] },
      },
      {
        tool: 'set_diagram_code_links',
        input: { ...target, add: [{ elementId: 'ghost', codeKey: `${APP_DIR}/projects/` }] },
      },
      {
        tool: 'set_diagram_code_links',
        input: { ...target, add: [{ elementId: 'projects', codeKey: `${APP_DIR}/projects/` }] },
      },
      {
        tool: 'set_diagram_code_links',
        input: { ...target, remove: [{ elementId: 'app', codeKey: `${APP_DIR}/` }] },
      },
    ])
    assert.isNull(actions)
    assert.include(told, 'at least one link')
    assert.include(told, 'not in this code map')
    assert.include(told, 'not an element of this diagram')
    assert.include(told, 'already linked')
    assert.include(told, 'no such link')
  })

  test('set_diagram_code_links: links changed by hand since are not overwritten (409 changed)', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-links-changed@example.com')
    const { answer } = await propose(client, f, 'set_diagram_code_links', {
      codeMapId: f.codeMap.id,
      diagramId: f.diagram.id,
      add: [{ elementId: 'architectures', codeKey: `${APP_DIR}/architectures/` }],
    })
    await DiagramCodeLink.create({
      diagramId: f.diagram.id,
      elementId: 'projects',
      codeKey: `${APP_DIR}/projects/`,
      status: 'ignored',
    })

    const response = await answer('accept')
    response.assertStatus(409)
    assert.equal(response.body().error.code, 'changed')
    assert.equal(response.body().action.status, 'pending')
    assert.deepEqual(await linksOf(f.diagram), [['projects', `${APP_DIR}/projects/`, 'ignored']])
  })

  test('resolve_review_finding: before → after, refused as a no-op, stale when resolved by hand', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-finding@example.com')
    const long = `The projects folder reaches into architectures. ${'More detail. '.repeat(30)}`
    const { findings } = await reviewOf(f, [long, 'Second finding'])
    const [first, second] = findings as [CodeReviewFinding, CodeReviewFinding]

    const { action, answer } = await propose(client, f, 'resolve_review_finding', {
      findingId: first.id,
      resolution: 'done',
    })
    assert.equal(action.subject, long)
    assert.equal(action.before, 'open')
    const accepted = await answer('accept')
    accepted.assertStatus(200)
    await first.refresh()
    assert.equal(first.resolution, 'done')

    const noop = await refused(client, f, [
      { tool: 'resolve_review_finding', input: { findingId: first.id, resolution: 'done' } },
    ])
    assert.isNull(noop.actions)
    assert.include(noop.told, 'already')

    const stale = await propose(client, f, 'resolve_review_finding', {
      findingId: second.id,
      resolution: 'done',
    })
    second.resolution = 'dismissed'
    await second.save()
    const response = await stale.answer('accept')
    response.assertStatus(409)
    assert.equal(response.body().error.code, 'changed')
    assert.equal(response.body().action.before, 'dismissed')
    await second.refresh()
    assert.equal(second.resolution, 'dismissed')
  })

  test('delete_code_review: counts its findings, then they are gone', async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-delete-review@example.com')
    const { review } = await reviewOf(f, ['One', 'Two'])
    const { action, answer } = await propose(client, f, 'delete_code_review', {
      codeReviewId: review.id,
    })
    assert.isTrue(action.destructive)
    assert.include(action.subject, review.createdAt.toISODate() as string)
    assert.deepEqual(action.impact, { findings: 2 })

    const accepted = await answer('accept')
    accepted.assertStatus(200)
    assert.isNull(await CodeReview.find(review.id))
    assert.lengthOf(await CodeReviewFinding.query().where('codeReviewId', review.id), 0)
  })

  test("another account's project, map, review or finding is never proposed nor applied", async ({
    client,
    assert,
  }) => {
    const f = await withCode(client, 'code-own@example.com')
    const other = await withCode(client, 'code-own-other@example.com')
    const { review, findings } = await reviewOf(other)
    const { actions, told } = await refused(client, f, [
      {
        tool: 'import_code_map_from_github',
        input: { projectId: other.project.id, url: 'https://github.com/acme/shop' },
      },
      { tool: 'delete_code_map', input: { codeMapId: other.codeMap.id } },
      { tool: 'stop_following_repository', input: { projectId: other.project.id } },
      {
        tool: 'set_diagram_code_links',
        input: {
          codeMapId: f.codeMap.id,
          diagramId: other.diagram.id,
          add: [{ elementId: 'projects', codeKey: `${APP_DIR}/projects/` }],
        },
      },
      {
        tool: 'resolve_review_finding',
        input: { findingId: findings[0]?.id, resolution: 'done' },
      },
      { tool: 'delete_code_review', input: { codeReviewId: review.id } },
    ])
    assert.isNull(actions)
    assert.equal(told.split('Not found').length - 1, 6)

    // A stored action retargeted to another account's map fails, and nothing is deleted.
    const { message, answer } = await propose(client, f, 'delete_code_map', {
      codeMapId: f.codeMap.id,
    })
    const row = await AssistantMessage.findOrFail(message.id)
    row.actions = [{ ...firstAction(row), input: { codeMapId: other.codeMap.id } }]
    await row.save()
    const response = await answer('accept')
    response.assertStatus(409)
    assert.equal(response.body().error.code, 'not_found')
    assert.isNotNull(await CodeMap.find(other.codeMap.id))
    assert.isTrue(await drive.use().exists(other.codeMap.storageKey as string))
  })
})
