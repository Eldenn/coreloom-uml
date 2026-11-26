import app from '@adonisjs/core/services/app'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { LanguageModel } from '@coreloom-uml/llm'
import { answeringModel, failingModel } from '@coreloom-uml/llm/testing'
import type { ApiClient } from '@japa/api-client'
import { test } from '@japa/runner'
import Architecture from '#app/architectures/models/architecture'
import Decision from '#app/decisions/models/decision'
import DesignFinding from '#app/decisions/models/design-finding'
import Diagram from '#app/diagrams/models/diagram'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import Project from '#app/projects/models/project'
import Requirement from '#app/requirements/models/requirement'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs } from '#tests/helpers/leaks'
import { saveTestLlmKey } from '#tests/helpers/llm-key'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
/** The fixture key: it must never show up in a response or a log line. */
const KEY = 'sk-fixture-design-review-never-stored'
const body = {
  provider: { kind: 'mistral', model: 'mistral-small-latest' },
  apiKey: KEY,
  locale: 'en',
}

function useModel(model: LanguageModel) {
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
}

/** An account with a project: one drawn view, one requirement and one accepted decision. */
async function setup(email: string) {
  const user = await User.create({ email, password: 'a-very-strong-passphrase' })
  await saveTestLlmKey(user)
  await updateFlag(FeatureFlagKey.DesignRecords, ON, user)
  const project = await Project.create({ userId: user.id, name: 'Shop', description: null })
  const architecture = await Architecture.create({
    userId: user.id,
    projectId: project.id,
    title: 'Zephyr',
    visibility: 'private',
  })
  const diagram = await Diagram.create({
    architectureId: architecture.id,
    title: 'Packages',
    kind: 'package',
    format: 'mermaid',
    position: 0,
    content: {
      kind: 'package',
      elements: [
        { id: 'checkout', kind: 'package', label: 'checkout' },
        { id: 'mailer', kind: 'package', label: 'mailer' },
      ],
      relations: [],
    },
  })
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
    options: [{ name: 'Queue', pros: null, cons: null }],
    chosen: 'Queue',
    consequences: null,
    status: 'accepted',
    supersededById: null,
  })
  return { user, project, architecture, diagram, requirement, decision }
}

type Fixture = Awaited<ReturnType<typeof setup>>

const answer = (f: Fixture, comments: string[]) =>
  JSON.stringify({
    findings: comments.map((comment) => ({
      severity: 'high',
      comment,
      requirement: `r${f.requirement.id}`,
      decision: `d${f.decision.id}`,
      view: `v${f.diagram.id}`,
    })),
  })

const review = (client: ApiClient, f: Fixture, user = f.user) =>
  client
    .post(`/architectures/${f.architecture.id}/design-review`)
    .headers(json)
    .loginAs(user)
    .json(body)

test.group('Design review by the model', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('stores what the model found, and a new review replaces it', async ({ client, assert }) => {
    const f = await setup('design-model-review@example.com')
    const model = answeringModel(answer(f, ['Checkout calls the mailer.', 'No queue is drawn.']))
    useModel(model)
    const logs = captureLogs()

    const first = await review(client, f)
    logs.restore()

    first.assertStatus(200)
    assert.lengthOf(first.body().findings, 2)
    assert.include(first.body().findings[0], {
      architectureId: f.architecture.id,
      requirementId: f.requirement.id,
      decisionId: f.decision.id,
      diagramId: f.diagram.id,
      severity: 'high',
      comment: 'Checkout calls the mailer.',
      resolution: 'open',
    })
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    assert.include(prompt, 'Checkout stays up when mail is down.')
    assert.include(prompt, 'How are mails sent?')
    assert.include(prompt, 'mailer')
    assert.notInclude(JSON.stringify(first.body()), KEY)
    assert.notInclude(logs.lines.join('\n'), KEY)
    assert.notInclude(logs.lines.join('\n'), 'Checkout stays up')

    useModel(answeringModel(answer(f, ['Again.'])))
    ;(await review(client, f)).assertStatus(200)
    const shown = await client
      .get(`/projects/${f.project.id}/design-review`)
      .headers(json)
      .loginAs(f.user)
    assert.deepEqual(
      shown.body().modelFindings.map((finding: { comment: string }) => finding.comment),
      ['Again.'],
    )
  })

  test('a finding is marked done, dismissed or open again, by its owner only', async ({
    client,
    assert,
  }) => {
    const f = await setup('design-model-resolve@example.com')
    const other = await setup('design-model-resolve-other@example.com')
    useModel(answeringModel(answer(f, ['Checkout calls the mailer.'])))
    const id = (await review(client, f)).body().findings[0].id as number
    const resolve = (user: User, resolution: string) =>
      client.patch(`/design-findings/${id}`).headers(json).loginAs(user).json({ resolution })

    for (const resolution of ['done', 'dismissed', 'open']) {
      const response = await resolve(f.user, resolution)
      response.assertStatus(200)
      assert.equal(response.body().finding.resolution, resolution)
    }
    ;(await resolve(other.user, 'done')).assertStatus(404)
    ;(await review(client, f, other.user)).assertStatus(404)
  })

  test('a finding outlives the requirement it names, and goes with its architecture', async ({
    client,
    assert,
  }) => {
    const f = await setup('design-model-cascade@example.com')
    useModel(answeringModel(answer(f, ['Checkout calls the mailer.'])))
    const id = (await review(client, f)).body().findings[0].id as number

    await f.requirement.delete()
    assert.isNull((await DesignFinding.findOrFail(id)).requirementId)
    await f.architecture.delete()
    assert.isNull(await DesignFinding.find(id))
  })

  test('nothing to review is a 422, and no model is called', async ({ client, assert }) => {
    const f = await setup('design-model-nothing@example.com')
    const model = answeringModel(answer(f, ['Never asked.']))
    useModel(model)

    await f.diagram.merge({ content: null }).save()
    const noView = await review(client, f)
    noView.assertStatus(422)
    assert.include(noView.body().error.message, 'no view')

    await f.architecture.merge({ projectId: null }).save()
    ;(await review(client, f)).assertStatus(422)
    assert.lengthOf(model.doGenerateCalls, 0)
  })

  test('a failed call answers its reason and keeps the earlier findings', async ({
    client,
    assert,
  }) => {
    const f = await setup('design-model-failed@example.com')
    useModel(answeringModel(answer(f, ['Checkout calls the mailer.'])))
    ;(await review(client, f)).assertStatus(200)

    useModel(failingModel(new Error('boom')))
    const failed = await review(client, f)
    failed.assertStatus(502)
    assert.isString(failed.body().reason)
    assert.lengthOf(await DesignFinding.query().where('architectureId', f.architecture.id), 1)
  })
})
