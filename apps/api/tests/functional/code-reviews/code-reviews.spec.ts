import { readFileSync } from 'node:fs'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { LanguageModel } from '@coreloom-uml/llm'
import { APICallError, answeringModel, failingModel } from '@coreloom-uml/llm/testing'
import type { UmlSpec } from '@coreloom-uml/uml'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import Architecture from '#app/architectures/models/architecture'
import CodeMap from '#app/code-maps/models/code-map'
import type { CodeMapOutput } from '#app/code-maps/validators/code-maps-output'
import { CODE_REVIEW_LIMITS } from '#app/code-reviews/constants/code-review'
import CodeReview from '#app/code-reviews/models/code-review'
import type {
  CodeReviewDetailOutput,
  CodeReviewFindingUpdateOutput,
  CodeReviewsListOutput,
} from '#app/code-reviews/validators/code-reviews-output'
import Diagram from '#app/diagrams/models/diagram'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

type Client = TestContext['client']

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
/** The fixture key: it must never show up in a response, a log line or the database. */
const KEY = 'sk-fixture-3f1c9b20-never-stored'
const provider = { kind: 'mistral', model: 'mistral-small-latest' }
const APP = 'apps/api/app'

const GRAPH = readFileSync(app.makePath('../../packages/codemap/fixtures/adonis-graph.json'))

function useModel(model: LanguageModel) {
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
}

const answer = (findings: unknown[]) => JSON.stringify({ findings })

async function setup(flag = true) {
  const user = await User.create({
    email: `code-reviews-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  if (flag) await updateFlag(FeatureFlagKey.CodeMaps, ON, user)
  const project = await Project.create({ userId: user.id, name: 'Shop', description: null })
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
  const diagram = await Diagram.create({
    architectureId: architecture.id,
    title: 'Packages',
    kind: 'package',
    format: 'mermaid',
    content,
    position: 0,
    version: 1,
  })
  const states = await Diagram.create({
    architectureId: architecture.id,
    title: 'Lifecycle',
    kind: 'state',
    format: 'mermaid',
    content: { kind: 'state', states: [{ id: 'draft' }], transitions: [] } as unknown as UmlSpec,
    position: 1,
    version: 1,
  })
  return { user, project, architecture, diagram, states }
}

async function uploadMap(client: Client, user: User, projectId: number) {
  const response = await client
    .post(`/projects/${projectId}/code-maps`)
    .headers(json)
    .loginAs(user)
    .file('file', GRAPH, { filename: 'graph.json' })
    .field('repositoryUrl', 'https://github.com/acme/shop')
    .field('commitSha', 'abc1234')
  response.assertStatus(201)
  return (response.body() as { codeMap: CodeMapOutput }).codeMap
}

async function startReview(
  client: Client,
  user: User,
  body: { codeMapId: number; diagramIds: number[]; includeSnippets?: boolean },
) {
  const response = await client
    .post('/code-reviews')
    .headers(json)
    .loginAs(user)
    .json({ locale: 'en', ...body })
  response.assertStatus(201)
  return (response.body() as CodeReviewDetailOutput).review
}

function reviewDiagram(
  client: Client,
  user: User,
  reviewId: number,
  diagramId: number,
  extra: Record<string, unknown> = {},
) {
  return client
    .post(`/code-reviews/${reviewId}/diagrams/${diagramId}`)
    .headers(json)
    .loginAs(user)
    .json({ provider, apiKey: KEY, ...extra })
}

test.group('Code reviews', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => {
    drive.fake()
    return () => drive.restore()
  })
  group.each.teardown(() => {
    app.container.restore(LanguageModels)
  })

  test('every route answers 404 while the flag is off', async ({ client }) => {
    const { user, project, diagram } = await setup(false)
    ;(
      await client.get(`/projects/${project.id}/code-reviews`).headers(json).loginAs(user)
    ).assertStatus(404)
    ;(
      await client
        .post('/code-reviews')
        .headers(json)
        .loginAs(user)
        .json({ codeMapId: 1, diagramIds: [diagram.id], locale: 'en' })
    ).assertStatus(404)
    ;(await client.get('/code-reviews/1').headers(json).loginAs(user)).assertStatus(404)
    ;(await reviewDiagram(client, user, 1, diagram.id)).assertStatus(404)
    ;(
      await client
        .patch('/code-review-findings/1')
        .headers(json)
        .loginAs(user)
        .json({ resolution: 'done' })
    ).assertStatus(404)
  })

  test('reviews a diagram with the user’s model and stores its findings', async ({
    client,
    assert,
  }) => {
    const { user, project, diagram } = await setup()
    const map = await uploadMap(client, user, project.id)
    const review = await startReview(client, user, { codeMapId: map.id, diagramIds: [diagram.id] })
    assert.equal(review.status, 'running')
    assert.equal(review.diagrams[0]?.status, 'pending')
    assert.equal(review.repositoryUrl, 'https://github.com/acme/shop')

    const model = answeringModel(
      answer([
        {
          element: 'architectures',
          status: 'conforms',
          severity: 'low',
          comment: 'The architectures folder imports from projects, as drawn.',
          evidence: ['n2', 'n3'],
        },
        {
          element: 'billing',
          status: 'missing-in-code',
          severity: 'high',
          comment: 'No billing folder in the code.',
          evidence: [],
        },
        {
          element: 'projects',
          status: 'deviates',
          severity: 'medium',
          comment: 'Invented evidence.',
          evidence: ['src/ghost.ts#Ghost'],
        },
      ]),
    )
    useModel(model)
    const logs = captureLogs()
    let response: Awaited<ReturnType<typeof reviewDiagram>>
    try {
      response = await reviewDiagram(client, user, review.id, diagram.id)
    } finally {
      logs.restore()
    }
    response.assertStatus(200)
    const body = response.body() as CodeReviewDetailOutput
    assert.equal(body.review.status, 'done')
    assert.equal(body.review.model, 'mistral-small-latest')
    assert.equal(body.review.openCount, 2)
    assert.deepInclude(body.review.diagrams[0], { status: 'done', findingCount: 2, dropped: 1 })
    assert.deepEqual(
      body.findings.map((finding) => [finding.elementId, finding.status, finding.resolution]),
      [
        ['architectures', 'conforms', 'open'],
        ['billing', 'missing-in-code', 'open'],
      ],
    )
    assert.deepEqual(body.findings[0]?.evidence, [
      { key: `${APP}/architectures/`, path: `${APP}/architectures` },
      { key: `${APP}/projects/`, path: `${APP}/projects` },
    ])

    // The prompt holds names and paths, and no code.
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    assert.include(prompt, 'kind=\\"package\\"')
    assert.include(prompt, 'billing (billing) was not found in the code.')
    assert.notInclude(prompt, '<snippet')

    // The key is never echoed, logged or stored.
    assert.notInclude(JSON.stringify(body), KEY)
    assert.notInclude(logs.lines.join('\n'), KEY)
    assert.notInclude(await dumpDatabase(), KEY)

    const shown = await client.get(`/code-reviews/${review.id}`).headers(json).loginAs(user)
    shown.assertStatus(200)
    assert.lengthOf((shown.body() as CodeReviewDetailOutput).findings, 2)
    const listed = await client
      .get(`/projects/${project.id}/code-reviews`)
      .headers(json)
      .loginAs(user)
    listed.assertStatus(200)
    assert.deepEqual(
      (listed.body() as CodeReviewsListOutput).data.map((item) => [item.id, item.openCount]),
      [[review.id, 2]],
    )
  })

  test('a second call replaces the diagram’s findings in the review', async ({
    client,
    assert,
  }) => {
    const { user, project, diagram } = await setup()
    const map = await uploadMap(client, user, project.id)
    const review = await startReview(client, user, { codeMapId: map.id, diagramIds: [diagram.id] })
    const finding = (comment: string) => ({
      element: 'billing',
      status: 'missing-in-code',
      severity: 'high',
      comment,
      evidence: [],
    })
    useModel(answeringModel(answer([finding('First.'), finding('Second.')])))
    ;(await reviewDiagram(client, user, review.id, diagram.id)).assertStatus(200)
    useModel(answeringModel(answer([finding('Again.')])))
    const again = await reviewDiagram(client, user, review.id, diagram.id)
    again.assertStatus(200)
    const shown = await client.get(`/code-reviews/${review.id}`).headers(json).loginAs(user)
    assert.deepEqual(
      (shown.body() as CodeReviewDetailOutput).findings.map((item) => item.comment),
      ['Again.'],
    )
  })

  test('marks a finding done or dismissed, and opens it again', async ({ client, assert }) => {
    const { user, project, diagram } = await setup()
    const map = await uploadMap(client, user, project.id)
    const review = await startReview(client, user, { codeMapId: map.id, diagramIds: [diagram.id] })
    useModel(
      answeringModel(
        answer([
          {
            element: 'billing',
            status: 'missing-in-code',
            severity: 'high',
            comment: 'No billing folder.',
            evidence: [],
          },
        ]),
      ),
    )
    const reviewed = await reviewDiagram(client, user, review.id, diagram.id)
    const id = (reviewed.body() as CodeReviewDetailOutput).findings[0]?.id as number

    for (const resolution of ['done', 'dismissed', 'open'] as const) {
      const response = await client
        .patch(`/code-review-findings/${id}`)
        .headers(json)
        .loginAs(user)
        .json({ resolution })
      response.assertStatus(200)
      assert.equal(
        (response.body() as CodeReviewFindingUpdateOutput).finding.resolution,
        resolution,
      )
    }
    ;(
      await client
        .patch(`/code-review-findings/${id}`)
        .headers(json)
        .loginAs(user)
        .json({ resolution: 'maybe' })
    ).assertStatus(422)

    const other = await setup()
    ;(
      await client
        .patch(`/code-review-findings/${id}`)
        .headers(json)
        .loginAs(other.user)
        .json({ resolution: 'done' })
    ).assertStatus(404)
    ;(
      await client.get(`/code-reviews/${review.id}`).headers(json).loginAs(other.user)
    ).assertStatus(404)
    ;(await reviewDiagram(client, other.user, review.id, diagram.id)).assertStatus(404)
  })

  test('keeps the reason a call failed, with 502', async ({ client, assert }) => {
    const { user, project, diagram } = await setup()
    const map = await uploadMap(client, user, project.id)
    const review = await startReview(client, user, { codeMapId: map.id, diagramIds: [diagram.id] })
    useModel(
      failingModel(
        new APICallError({
          message: `bad key ${KEY}`,
          url: 'https://api.mistral.ai',
          requestBodyValues: {},
          statusCode: 401,
        }),
      ),
    )
    const response = await reviewDiagram(client, user, review.id, diagram.id)
    response.assertStatus(502)
    response.assertBodyContains({ reason: 'unauthorized' })
    assert.notInclude(JSON.stringify(response.body()), KEY)
    const stored = await CodeReview.findOrFail(review.id)
    assert.deepInclude(stored.diagrams[0], { status: 'failed', reason: 'unauthorized' })
  })

  test('refuses what cannot be reviewed', async ({ client, assert }) => {
    const { user, project, diagram, states } = await setup()
    const map = await uploadMap(client, user, project.id)

    const stateReview = await client
      .post('/code-reviews')
      .headers(json)
      .loginAs(user)
      .json({ codeMapId: map.id, diagramIds: [states.id], locale: 'en' })
    stateReview.assertStatus(422)

    const other = await setup()
    ;(
      await client
        .post('/code-reviews')
        .headers(json)
        .loginAs(user)
        .json({ codeMapId: map.id, diagramIds: [other.diagram.id], locale: 'en' })
    ).assertStatus(404)
    ;(
      await client
        .post('/code-reviews')
        .headers(json)
        .loginAs(other.user)
        .json({ codeMapId: map.id, diagramIds: [other.diagram.id], locale: 'en' })
    ).assertStatus(404)

    const review = await startReview(client, user, { codeMapId: map.id, diagramIds: [diagram.id] })
    useModel(answeringModel(answer([])))
    // A diagram the review was not started with.
    ;(await reviewDiagram(client, user, review.id, states.id)).assertStatus(404)
    // Excerpts only when the review was started with them.
    ;(
      await reviewDiagram(client, user, review.id, diagram.id, {
        snippets: [{ key: `${APP}/projects/`, text: 'export class X {}' }],
      })
    ).assertStatus(422)
    // A hosted provider needs a key.
    ;(
      await client
        .post(`/code-reviews/${review.id}/diagrams/${diagram.id}`)
        .headers(json)
        .loginAs(user)
        .json({ provider })
    ).assertStatus(422)

    // The map is gone: the review can't go on, its findings stay.
    await CodeMap.query().where('id', map.id).delete()
    ;(await reviewDiagram(client, user, review.id, diagram.id)).assertStatus(409)
    const stored = await CodeReview.findOrFail(review.id)
    assert.isNull(stored.codeMapId)
  })

  test('sends the excerpts of a review started with them, and stores none', async ({
    client,
    assert,
  }) => {
    const { user, project, diagram } = await setup()
    const map = await uploadMap(client, user, project.id)
    const review = await startReview(client, user, {
      codeMapId: map.id,
      diagramIds: [diagram.id],
      includeSnippets: true,
    })
    const model = answeringModel(answer([]))
    useModel(model)
    const excerpt = 'export const UNIQUE_EXCERPT_MARKER = 42'
    const response = await reviewDiagram(client, user, review.id, diagram.id, {
      snippets: [{ key: `${APP}/projects/`, text: excerpt }],
    })
    response.assertStatus(200)
    assert.include(JSON.stringify(model.doGenerateCalls[0]?.prompt), 'UNIQUE_EXCERPT_MARKER')
    assert.notInclude(await dumpDatabase(), 'UNIQUE_EXCERPT_MARKER')
  })

  test('keeps the project’s newest reviews', async ({ client, assert }) => {
    const { user, project, diagram } = await setup()
    const map = await uploadMap(client, user, project.id)
    const ids: number[] = []
    for (let index = 0; index <= CODE_REVIEW_LIMITS.perProject; index++) {
      ids.push(
        (await startReview(client, user, { codeMapId: map.id, diagramIds: [diagram.id] })).id,
      )
    }
    const kept = await CodeReview.query().where('projectId', project.id).orderBy('id', 'asc')
    assert.deepEqual(
      kept.map((review) => review.id),
      ids.slice(1),
    )
    ;(await client.delete(`/code-reviews/${ids[1]}`).headers(json).loginAs(user)).assertStatus(204)
    assert.isNull(await CodeReview.find(ids[1] as number))
  })
})
