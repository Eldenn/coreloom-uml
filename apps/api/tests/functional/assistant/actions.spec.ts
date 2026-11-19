import app from '@adonisjs/core/services/app'
import { MARKER_PREFIX } from '@coreloom-uml/catalog'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { LanguageModel } from '@coreloom-uml/llm'
import { type ModelStep, toolCallingModel } from '@coreloom-uml/llm/testing'
import type { ApiClient } from '@japa/api-client'
import type { Assert } from '@japa/assert'
import { test } from '@japa/runner'
import AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigReadyRule from '#app/agent-configs/models/agent-config-ready-rule'
import AgentConfigRule from '#app/agent-configs/models/agent-config-rule'
import Architecture from '#app/architectures/models/architecture'
import { AssistantRole } from '#app/assistant/constants/assistant'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantMessage from '#app/assistant/models/assistant-message'
import { conversationHistory } from '#app/assistant/services/assistant-context'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import { saveCodexTokens } from '#app/llm-connections/services/codex-connections'
import Project from '#app/projects/models/project'
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
}
const SECTION = 'Architecture'
const E2B_KEY = env.get('E2B_API_KEY')

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
    const { accept } = await proposed(client, 'actions-section@example.com', 'add_rule', (f) => ({
      agentConfigId: f.config.id,
      section: 'Nowhere',
      text: 'Fine',
    }))

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
