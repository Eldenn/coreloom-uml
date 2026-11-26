import app from '@adonisjs/core/services/app'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { type ModelStep, toolCallingModel } from '@coreloom-uml/llm/testing'
import type { ApiClient } from '@japa/api-client'
import { test } from '@japa/runner'
import Architecture from '#app/architectures/models/architecture'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import Decision from '#app/decisions/models/decision'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import Project from '#app/projects/models/project'
import Requirement from '#app/requirements/models/requirement'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { saveTestLlmKey } from '#tests/helpers/llm-key'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const OFF = { enabled: false, rollout: 100, rules: [] }
const chat = {
  provider: { kind: 'mistral', model: 'mistral-small-latest' },
  apiKey: 'sk-fixture-design-actions',
  message: 'Record what we decided',
  locale: 'en',
  auto: true,
}
const DESIGN_TOOLS = [
  'read_project_design',
  'read_decision',
  'read_design_review',
  'add_requirement',
  'add_decision',
  'supersede_decision',
]
const OPTIONS = [{ name: 'Queue', pros: 'Failures stay out.' }, { name: 'Direct call' }]

const call = (tool: string, input: unknown): ModelStep => ({ calls: [{ tool, input }] })

/** An account with a project holding one view, one requirement and one accepted decision. */
async function setup(email: string, { design = true } = {}) {
  const user = await User.create({ email, password: 'a-very-strong-passphrase' })
  await saveTestLlmKey(user)
  await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
  await updateFlag(FeatureFlagKey.AssistantActions, ON, user)
  if (design) await updateFlag(FeatureFlagKey.DesignRecords, ON, user)
  const conversation = await AssistantConversation.create({ userId: user.id, title: '' })
  const project = await Project.create({ userId: user.id, name: 'Shop' })
  const architecture = await Architecture.create({
    userId: user.id,
    projectId: project.id,
    title: 'Zephyr',
    visibility: 'private',
  })
  const diagram = await architecture
    .related('diagrams')
    .create({ title: 'Main', kind: 'class', position: 0 })
  const requirement = await Requirement.create({
    projectId: project.id,
    userId: user.id,
    category: 'availability',
    priority: 'must',
    statement: 'Checkout stays up when mail is down.',
    measure: null,
  })
  const decision = await Decision.create({
    projectId: project.id,
    userId: user.id,
    title: 'How are mails sent?',
    context: null,
    options: [
      { name: 'Direct call', pros: null, cons: 'Mail failures reach the checkout.' },
      { name: 'Cron', pros: null, cons: null },
    ],
    chosen: 'Direct call',
    consequences: null,
    status: 'accepted',
    supersededById: null,
  })
  return { user, conversation, project, diagram, requirement, decision }
}

type Fixture = Awaited<ReturnType<typeof setup>>

/** Sends a message to a model that calls `steps`: the stored reply, its first action and its answer. */
async function send(client: ApiClient, f: Fixture, steps: ModelStep[]) {
  const model = toolCallingModel(steps)
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
  const base = `/assistant/conversations/${f.conversation.id}/messages`
  const response = await client.post(base).headers(json).loginAs(f.user).json(chat)
  response.assertStatus(200)
  const message = response.body().messages[1]
  // The last call carries every tool result of the loop, each once.
  const results = JSON.stringify(
    model.doGenerateCalls.at(-1)?.prompt.filter((part) => part.role === 'tool') ?? [],
  )
  const accept = () =>
    client.post(`${base}/${message.id}/actions/0/accept`).headers(json).loginAs(f.user)
  return { model, message, action: message.actions?.[0], results, accept }
}

test.group('Assistant actions - requirements and decisions', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('offered only with design-records, and a stored proposal fails once it is off', async ({
    client,
    assert,
  }) => {
    const off = await setup('design-actions-off@example.com', { design: false })
    const without = await send(client, off, [{ text: 'Hello.' }])
    const offered = (model: typeof without.model) =>
      model.doGenerateCalls[0]?.tools?.map((item) => item.name) ?? []
    for (const name of DESIGN_TOOLS) assert.notInclude(offered(without.model), name)

    const f = await setup('design-actions-on@example.com')
    const { model, accept } = await send(client, f, [
      call('add_requirement', {
        projectId: f.project.id,
        category: 'cost',
        priority: 'should',
        statement: 'Hosting stays under 200 euros a month.',
      }),
      { text: 'Proposed.' },
    ])
    for (const name of DESIGN_TOOLS) assert.include(offered(model), name)

    await updateFlag(FeatureFlagKey.DesignRecords, OFF, f.user)
    const refused = await accept()
    assert.equal(refused.body().action.failure, 'not_found')
    assert.lengthOf(await Requirement.query().where('projectId', f.project.id), 1)
  })

  test("reads the caller's project only: its requirements, decisions and one decision in full", async ({
    client,
    assert,
  }) => {
    const f = await setup('design-actions-read@example.com')
    const other = await setup('design-actions-read-other@example.com')
    await f.decision.related('requirements').attach([f.requirement.id])

    const { results } = await send(client, f, [
      call('read_project_design', { projectId: f.project.id }),
      call('read_decision', { decisionId: f.decision.id }),
      call('read_project_design', { projectId: other.project.id }),
      call('read_decision', { decisionId: other.decision.id }),
      { text: 'Read.' },
    ])

    assert.include(results, 'Checkout stays up when mail is down.')
    assert.include(results, `\\"requirementIds\\":[${f.requirement.id}]`)
    assert.include(results, 'Mail failures reach the checkout.')
    assert.equal(results.split('Not found').length - 1, 2)
  })

  test('add_requirement: stored only once accepted', async ({ client, assert }) => {
    const f = await setup('design-actions-requirement@example.com')
    const { action, accept } = await send(client, f, [
      call('add_requirement', {
        projectId: f.project.id,
        category: 'performance',
        priority: 'must',
        statement: '  The catalogue answers fast.  ',
        measure: 'p95 under 300 ms',
      }),
      { text: 'Proposed.' },
    ])

    assert.equal(action.subject, 'Shop')
    assert.equal(action.input.statement, 'The catalogue answers fast.')
    assert.lengthOf(await Requirement.query().where('projectId', f.project.id), 1)

    const accepted = await accept()
    accepted.assertStatus(200)
    assert.deepEqual(accepted.body().action.result, { kind: 'project', id: f.project.id })
    const added = await Requirement.query()
      .where('projectId', f.project.id)
      .where('category', 'performance')
      .firstOrFail()
    assert.equal(added.measure, 'p95 under 300 ms')
    assert.equal(added.userId, f.user.id)
  })

  test('add_decision: one that does not hold together is never proposed', async ({
    client,
    assert,
  }) => {
    const f = await setup('design-actions-refused@example.com')
    const other = await setup('design-actions-refused-other@example.com')
    const base = { projectId: f.project.id, title: 'Where do sessions live?', options: OPTIONS }

    const { message, results } = await send(client, f, [
      call('add_decision', { ...base, status: 'accepted' }),
      call('add_decision', { ...base, chosen: 'Cache' }),
      call('add_decision', { ...base, requirementIds: [other.requirement.id] }),
      { text: 'None of them holds.' },
    ])

    assert.isNull(message.actions)
    assert.include(results, 'An accepted decision names the option chosen.')
    assert.include(results, 'The chosen option is not one of the options.')
    assert.include(results, 'These are not all requirements of the project.')
  })

  test('add_decision: accepted with its links', async ({ client, assert }) => {
    const f = await setup('design-actions-decision@example.com')
    const { accept } = await send(client, f, [
      call('add_decision', {
        projectId: f.project.id,
        title: 'Where do sessions live?',
        options: [{ name: 'Redis', cons: 'One more service.' }, { name: 'Cookie' }],
        chosen: 'Redis',
        status: 'accepted',
        requirementIds: [f.requirement.id],
        diagramIds: [f.diagram.id],
      }),
      { text: 'Proposed.' },
    ])
    assert.lengthOf(await Decision.query().where('projectId', f.project.id), 1)

    ;(await accept()).assertStatus(200)
    const added = await Decision.query()
      .where({ projectId: f.project.id, title: 'Where do sessions live?' })
      .preload('requirements')
      .preload('diagrams')
      .firstOrFail()
    assert.equal(added.status, 'accepted')
    assert.deepEqual(added.options[1], { name: 'Cookie', pros: null, cons: null })
    assert.deepEqual(
      [added.requirements[0]?.id, added.diagrams[0]?.id],
      [f.requirement.id, f.diagram.id],
    )
  })

  test('supersede_decision: the new one is recorded and the old one names it', async ({
    client,
    assert,
  }) => {
    const f = await setup('design-actions-supersede@example.com')
    const { action, accept } = await send(client, f, [
      call('supersede_decision', {
        decisionId: f.decision.id,
        title: 'How are mails sent?',
        options: OPTIONS,
        chosen: 'Queue',
        status: 'accepted',
      }),
      { text: 'Proposed.' },
    ])

    assert.equal(action.subject, 'How are mails sent?')
    assert.equal(action.before, 'accepted')
    ;(await accept()).assertStatus(200)

    await f.decision.refresh()
    const replacement = await Decision.query()
      .where({ projectId: f.project.id, chosen: 'Queue' })
      .firstOrFail()
    assert.equal(f.decision.status, 'superseded')
    assert.equal(f.decision.supersededById, replacement.id)
    assert.equal(replacement.projectId, f.project.id)
  })

  test('supersede_decision: a decision superseded meanwhile is a conflict, and nothing is added', async ({
    client,
    assert,
  }) => {
    const f = await setup('design-actions-stale@example.com')
    const { accept } = await send(client, f, [
      call('supersede_decision', {
        decisionId: f.decision.id,
        title: 'How are mails sent?',
        options: OPTIONS,
      }),
      { text: 'Proposed.' },
    ])
    await f.decision.merge({ status: 'superseded' }).save()

    const refused = await accept()
    refused.assertStatus(409)
    assert.equal(refused.body().error.code, 'conflict')
    assert.lengthOf(await Decision.query().where('projectId', f.project.id), 1)
  })
})
