import testUtils from '@adonisjs/core/services/test_utils'
import { CATALOG_VERSION, MARKER_PREFIX } from '@coreloom-uml/catalog'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import { AGENT_GENERATIONS_KEPT, AGENT_RULES_MAX } from '#app/agent-configs/constants/agent-config'
import AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigAnswer from '#app/agent-configs/models/agent-config-answer'
import AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import AgentConfigRule from '#app/agent-configs/models/agent-config-rule'
import type { CreatedApiTokenOutput } from '#app/api-tokens/validators/api-tokens-output'
import User from '#app/users/models/user'
import { withEmptySkillsCatalog } from '#tests/helpers/skills'

const json = { accept: 'application/json' }
const Q = 'frontend-react'

type Client = TestContext['client']

function makeUser() {
  return User.create({
    email: `agent-configs-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

async function createProject(client: Client, user: User, body: Record<string, unknown> = {}) {
  const response = await client
    .post('/projects')
    .headers(json)
    .loginAs(user)
    .json({ name: 'Storefront', description: 'The online shop', ...body })
  response.assertStatus(201)
  return response.body().project as { id: number }
}

async function createConfig(
  client: Client,
  user: User,
  projectId: number,
  body: Record<string, unknown> = {},
) {
  const response = await client
    .put(`/projects/${projectId}/agent-config`)
    .headers(json)
    .loginAs(user)
    .json({ questionnaires: [Q], targets: ['claude-code', 'cursor'], ...body })
  response.assertStatus(201)
  return response.body()
}

function answer(questionId: string, value: unknown, details?: string | null) {
  return { questionnaireId: Q, questionId, value, ...(details === undefined ? {} : { details }) }
}

/** An answer to each of the eleven questions of frontend-react. */
const ALL_ANSWERS = [
  answer('ts-any', 5),
  answer('ts-strict', 'all'),
  answer('components-size', 4),
  answer('state-management', 'tanstack-query-only'),
  answer('styling', 'tailwind'),
  answer('tests-level', ['unit', 'e2e']),
  answer('comments', 5),
  answer('change-size', 5),
  answer('ask-before-act', 4),
  answer('package-manager', 'pnpm'),
  answer('checks', 'pnpm lint && pnpm test'),
]

function putAnswers(client: Client, user: User, projectId: number, answers: unknown[]) {
  return client
    .put(`/projects/${projectId}/agent-config/answers`)
    .headers(json)
    .loginAs(user)
    .json({ answers })
}

async function generate(client: Client, user: User, projectId: number) {
  const response = await client
    .post(`/projects/${projectId}/agent-config/generations`)
    .headers(json)
    .loginAs(user)
  response.assertStatus(201)
  return response.body().generation as {
    id: number
    revision: number
    catalogVersion: string
    files: { path: string; kind: string; content: string; blockHash: string }[]
    recommendations: { target: string; title: string }[]
    skills: {
      compatible: { id: string; url: string; score: number }[]
      conflicting: { id: string; reasons: Record<string, unknown>[] }[]
    }
  }
}

async function createToken(client: Client, user: User, abilities: string[]) {
  const response = await client
    .post('/account/api-tokens')
    .headers(json)
    .loginAs(user)
    .json({ name: 'CLI', abilities, expiresInDays: 30 })
  response.assertStatus(201)
  return (response.body() as CreatedApiTokenOutput).secret
}

function bearer(secret: string) {
  return { ...json, authorization: `Bearer ${secret}` }
}

test.group('Agent configs - questionnaires', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('lists the catalog questionnaires and shows one without its fragments', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()

    const list = await client.get('/questionnaires').headers(json).loginAs(user)
    list.assertStatus(200)
    assert.containsSubset(list.body().questionnaires, [
      { id: Q, version: '1.0.0', questionCount: 11 },
    ])

    const shown = await client.get(`/questionnaires/${Q}`).headers(json).loginAs(user)
    shown.assertStatus(200)
    const { questionnaire } = shown.body()
    assert.lengthOf(questionnaire.questions, 11)
    assert.deepEqual(questionnaire.sections, ['TypeScript', 'React'])
    assert.properties(questionnaire.scaleLabels, ['min', 'max'])
    for (const question of questionnaire.questions) assert.notProperty(question, 'fragments')

    const missing = await client.get('/questionnaires/backend-go').headers(json).loginAs(user)
    missing.assertStatus(404)
  })

  test('requires a session or an API token', async ({ client }) => {
    const response = await client.get('/questionnaires').headers(json)
    response.assertStatus(401)
  })
})

test.group('Agent configs - configuration', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates the configuration, then updates it in place', async ({ client, assert }) => {
    const user = await makeUser()
    const project = await createProject(client, user)

    const missing = await client
      .get(`/projects/${project.id}/agent-config`)
      .headers(json)
      .loginAs(user)
    missing.assertStatus(404)

    const created = await createConfig(client, user, project.id, { notes: 'Ship on Fridays.' })
    assert.containsSubset(created.config, {
      projectId: project.id,
      questionnaires: [{ id: Q, version: '1.0.0' }],
      targets: ['claude-code', 'cursor'],
      notes: 'Ship on Fridays.',
      revision: 1,
      answers: [],
      rules: [],
      latestGeneration: null,
      outdatedQuestionnaires: [],
    })
    assert.deepEqual(created.config.ruleSections, [
      'Project',
      'Working style',
      'TypeScript',
      'React',
      'Testing',
      'Workflow',
      'Tooling',
    ])
    assert.isNull(created.impact)

    const updated = await client
      .put(`/projects/${project.id}/agent-config`)
      .headers(json)
      .loginAs(user)
      .json({ questionnaires: [Q], targets: ['generic'] })
    updated.assertStatus(200)
    assert.containsSubset(updated.body().config, {
      id: created.config.id,
      targets: ['generic'],
      notes: 'Ship on Fridays.',
      revision: 2,
    })

    const unchanged = await client
      .put(`/projects/${project.id}/agent-config`)
      .headers(json)
      .loginAs(user)
      .json({ questionnaires: [Q], targets: ['generic'], notes: 'Ship on Fridays.' })
    unchanged.assertStatus(200)
    assert.equal(unchanged.body().config.revision, 2)

    const shown = await client
      .get(`/projects/${project.id}/agent-config`)
      .headers(json)
      .loginAs(user)
    shown.assertStatus(200)
    assert.equal(shown.body().config.id, created.config.id)
  })

  test('refuses unknown questionnaires and targets, and markers in the notes', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const put = (body: Record<string, unknown>) =>
      client
        .put(`/projects/${project.id}/agent-config`)
        .headers(json)
        .loginAs(user)
        .json({ questionnaires: [Q], targets: ['codex'], ...body })

    const unknown = await put({ questionnaires: ['backend-go'] })
    unknown.assertStatus(422)
    assert.include(unknown.body().error.message, 'backend-go')
    ;(await put({ questionnaires: [] })).assertStatus(422)
    ;(await put({ targets: ['emacs'] })).assertStatus(422)
    ;(await put({ targets: [] })).assertStatus(422)
    ;(await put({ notes: `<!-- ${MARKER_PREFIX}end -->` })).assertStatus(422)

    assert.isNull(await AgentConfig.findBy('projectId', project.id))
  })

  test('deletes the configuration with its answers, rules and generations', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const { config } = await createConfig(client, user, project.id)
    await putAnswers(client, user, project.id, [answer('ts-any', 5)])
    await client
      .post(`/projects/${project.id}/agent-config/rules`)
      .headers(json)
      .loginAs(user)
      .json({ section: 'React', text: 'Prefer server components.' })
    await generate(client, user, project.id)

    const deleted = await client
      .delete(`/projects/${project.id}/agent-config`)
      .headers(json)
      .loginAs(user)
    deleted.assertStatus(204)

    assert.isNull(await AgentConfig.find(config.id))
    assert.lengthOf(await AgentConfigAnswer.query().where('agentConfigId', config.id), 0)
    assert.lengthOf(await AgentConfigRule.query().where('agentConfigId', config.id), 0)
    assert.lengthOf(await AgentConfigGeneration.query().where('agentConfigId', config.id), 0)
  })

  test('counts the configuration on the project and goes with it', async ({ client, assert }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const bare = await createProject(client, user, { name: 'Bare' })
    const { config } = await createConfig(client, user, project.id)

    const shown = await client.get(`/projects/${project.id}`).headers(json).loginAs(user)
    assert.equal(shown.body().project.agentConfigCount, 1)
    const list = await client.get('/projects').headers(json).loginAs(user)
    const counts = Object.fromEntries(
      list
        .body()
        .data.map((item: { id: number; agentConfigCount: number }) => [
          item.id,
          item.agentConfigCount,
        ]),
    )
    assert.deepEqual(counts, { [project.id]: 1, [bare.id]: 0 })

    const deleted = await client.delete(`/projects/${project.id}`).headers(json).loginAs(user)
    deleted.assertStatus(204)
    assert.isNull(await AgentConfig.find(config.id))
  })

  test('hides another account configuration behind a 404', async ({ client }) => {
    const owner = await makeUser()
    const intruder = await makeUser()
    const project = await createProject(client, owner)
    await createConfig(client, owner, project.id)
    const generation = await generate(client, owner, project.id)
    const rule = await client
      .post(`/projects/${project.id}/agent-config/rules`)
      .headers(json)
      .loginAs(owner)
      .json({ section: 'React', text: 'Prefer hooks.' })
    const ruleId = rule.body().rule.id
    const base = `/projects/${project.id}/agent-config`

    for (const request of [
      client.get(base),
      client.put(base).json({ questionnaires: [Q], targets: ['codex'] }),
      client.delete(base),
      client.put(`${base}/answers`).json({ answers: [answer('ts-any', 1)] }),
      client.post(`${base}/rules`).json({ section: 'React', text: 'Mine now.' }),
      client.patch(`${base}/rules/${ruleId}`).json({ text: 'Mine now.' }),
      client.delete(`${base}/rules/${ruleId}`),
      client.post(`${base}/generations`),
      client.get(`${base}/generations`),
      client.get(`${base}/generations/latest`),
      client.get(`${base}/generations/${generation.id}`),
    ]) {
      const response = await request.headers(json).loginAs(intruder)
      response.assertStatus(404)
    }
  })
})

test.group('Agent configs - answers', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('saves answers partially, keeps details and removes with null', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    await createConfig(client, user, project.id)

    const first = await putAnswers(client, user, project.id, [
      answer('ts-any', 4, 'Sauf dans les tests.'),
      answer('tests-level', ['unit']),
    ])
    first.assertStatus(200)
    assert.equal(first.body().config.revision, 2)
    assert.lengthOf(first.body().config.answers, 2)

    const second = await putAnswers(client, user, project.id, [
      answer('ts-any', 5),
      answer('tests-level', null),
    ])
    second.assertStatus(200)
    assert.equal(second.body().config.revision, 3)
    assert.deepEqual(
      second
        .body()
        .config.answers.map(
          (item: { questionId: string; value: unknown; details: string | null }) => [
            item.questionId,
            item.value,
            item.details,
          ],
        ),
      [['ts-any', 5, 'Sauf dans les tests.']],
    )

    const same = await putAnswers(client, user, project.id, [answer('ts-any', 5)])
    assert.equal(same.body().config.revision, 3)
  })

  test('refuses answers that do not fit their question, and saves none of them', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const { config } = await createConfig(client, user, project.id)

    const refused = await putAnswers(client, user, project.id, [
      answer('ts-any', 5),
      answer('components-size', 6),
      answer('ts-strict', 'mostly'),
      answer('tests-level', ['none', 'unit']),
      answer('styling', `${MARKER_PREFIX}begin`),
      answer('checks', 'x'.repeat(501)),
      answer('no-such-question', 1),
      answer('comments', { scale: 5 }),
    ])
    refused.assertStatus(422)
    assert.deepEqual(
      refused.body().error.problems.map((problem: { questionId: string }) => problem.questionId),
      [
        'components-size',
        'ts-strict',
        'tests-level',
        'styling',
        'checks',
        'no-such-question',
        'comments',
      ],
    )
    assert.lengthOf(await AgentConfigAnswer.query().where('agentConfigId', config.id), 0)

    const details = await putAnswers(client, user, project.id, [
      answer('ts-any', 5, `${MARKER_PREFIX}end`),
    ])
    details.assertStatus(422)
  })

  test('accepts free text on an option that allows it', async ({ client }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    await createConfig(client, user, project.id)

    const response = await putAnswers(client, user, project.id, [
      answer('state-management', 'Jotai atoms'),
    ])
    response.assertStatus(200)
  })
})

test.group('Agent configs - rules', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('adds, edits, moves and deletes rules, keeping positions gap-free', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    await createConfig(client, user, project.id)
    const base = `/projects/${project.id}/agent-config/rules`
    const add = async (text: string, section = 'React') => {
      const response = await client
        .post(base)
        .headers(json)
        .loginAs(user)
        .json({ section, text: `  ${text}  ` })
      response.assertStatus(201)
      return response.body().rule as { id: number; position: number; text: string }
    }

    const a = await add('Rule A.')
    const b = await add('Rule B.', 'Testing')
    const c = await add('Rule C.')
    assert.deepEqual([a.position, b.position, c.position], [0, 1, 2])
    assert.equal(a.text, 'Rule A.')

    const moved = await client
      .patch(`${base}/${c.id}`)
      .headers(json)
      .loginAs(user)
      .json({ position: 0, text: 'Rule C, first.', section: 'Workflow' })
    moved.assertStatus(200)
    assert.containsSubset(moved.body().rule, {
      position: 0,
      text: 'Rule C, first.',
      section: 'Workflow',
      source: 'manual',
    })

    const deleted = await client.delete(`${base}/${a.id}`).headers(json).loginAs(user)
    deleted.assertStatus(204)

    const shown = await client
      .get(`/projects/${project.id}/agent-config`)
      .headers(json)
      .loginAs(user)
    assert.deepEqual(
      shown
        .body()
        .config.rules.map((rule: { id: number; position: number }) => [rule.id, rule.position]),
      [
        [c.id, 0],
        [b.id, 1],
      ],
    )
    // Created at 1, then three rules, one change (edit + move together) and one delete.
    assert.equal(shown.body().config.revision, 6)

    const missing = await client.delete(`${base}/${a.id}`).headers(json).loginAs(user)
    missing.assertStatus(404)
  })

  test('refuses a rule outside the configuration sections, or past the limit', async ({
    client,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const { config } = await createConfig(client, user, project.id)
    const base = `/projects/${project.id}/agent-config/rules`
    const post = (body: Record<string, unknown>) =>
      client.post(base).headers(json).loginAs(user).json(body)

    ;(await post({ section: 'Project notes', text: 'Hidden.' })).assertStatus(422)
    ;(await post({ section: 'Go', text: 'Use generics.' })).assertStatus(422)
    ;(await post({ section: 'React', text: 'x'.repeat(301) })).assertStatus(422)
    ;(await post({ section: 'React', text: `${MARKER_PREFIX}end` })).assertStatus(422)
    ;(await post({ section: 'React', text: 'Ok.', source: 'magic' })).assertStatus(422)

    await AgentConfigRule.createMany(
      Array.from({ length: AGENT_RULES_MAX }, (_, position) => ({
        agentConfigId: config.id,
        section: 'React',
        text: `Rule ${position}.`,
        source: 'manual' as const,
        position,
      })),
    )
    const tooMany = await post({ section: 'React', text: 'One too many.' })
    tooMany.assertStatus(422)
  })
})

test.group('Agent configs - generations', (group) => {
  // Suggestions read the found skills too: start from an empty catalog.
  group.each.setup(() => withEmptySkillsCatalog())

  test('renders AGENTS.md with the project context and the CLAUDE.md pointer, without a provider', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    for (const title of ['Checkout', 'Catalog search']) {
      const response = await client
        .post('/architectures')
        .headers(json)
        .loginAs(user)
        .json({ projectId: project.id, title })
      response.assertStatus(201)
    }
    await createConfig(client, user, project.id)
    const answered = await putAnswers(client, user, project.id, ALL_ANSWERS)
    answered.assertStatus(200)
    assert.lengthOf(answered.body().config.answers, 11)

    const generation = await generate(client, user, project.id)
    assert.equal(generation.catalogVersion, CATALOG_VERSION)
    assert.equal(generation.revision, 2)
    assert.deepEqual(
      generation.files.map((file) => [file.path, file.kind]),
      [
        ['AGENTS.md', 'generic'],
        ['CLAUDE.md', 'pointer'],
      ],
    )
    const [agents, claude] = generation.files
    assert.include(agents.content, '**Storefront**: The online shop')
    assert.include(agents.content, '**Checkout**')
    assert.include(agents.content, '**Catalog search**')
    assert.include(agents.content, '## TypeScript')
    assert.include(agents.content, 'pnpm lint')
    assert.include(claude.content, '@AGENTS.md')
    assert.match(agents.blockHash, /^sha256:[0-9a-f]{64}$/)
    assert.isTrue(generation.recommendations.some((item) => item.target === 'claude-code'))

    // Same state, same bytes: no id or date in what is rendered.
    const again = await generate(client, user, project.id)
    assert.deepEqual(again.files, generation.files)
    assert.notInclude(agents.content, String(project.id))
    assert.notMatch(agents.content, /\d{4}-\d{2}-\d{2}/)

    const latest = await client
      .get(`/projects/${project.id}/agent-config/generations/latest`)
      .headers(json)
      .loginAs(user)
    latest.assertStatus(200)
    assert.equal(latest.body().generation.id, again.id)

    const shown = await client
      .get(`/projects/${project.id}/agent-config/generations/${generation.id}`)
      .headers(json)
      .loginAs(user)
    shown.assertStatus(200)
    assert.deepEqual(shown.body().generation.files, generation.files)

    const list = await client
      .get(`/projects/${project.id}/agent-config/generations?perPage=1`)
      .headers(json)
      .loginAs(user)
    list.assertStatus(200)
    assert.deepEqual(list.body().meta, { page: 1, perPage: 1, total: 2, lastPage: 2 })
    assert.deepEqual(list.body().data[0].paths, ['AGENTS.md', 'CLAUDE.md'])
    assert.notProperty(list.body().data[0], 'files')

    const detail = await client
      .get(`/projects/${project.id}/agent-config`)
      .headers(json)
      .loginAs(user)
    assert.equal(detail.body().config.latestGeneration.id, again.id)
    assert.deepEqual(detail.body().impact, { stale: false, changedQuestions: [], files: [] })
  })

  test('suggests the catalog skills that fit the answers, and keeps them per generation', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    await createConfig(client, user, project.id)

    const empty = await generate(client, user, project.id)
    assert.deepEqual(empty.skills, { compatible: [], conflicting: [] })

    await putAnswers(client, user, project.id, ALL_ANSWERS)
    const fitting = await generate(client, user, project.id)
    assert.deepEqual(
      fitting.skills.compatible.map((skill) => [skill.id, skill.score]),
      [
        ['test-driven-development', 2],
        ['writing-plans', 2],
        ['systematic-debugging', 1],
        ['verification-before-completion', 1],
        ['brainstorming', 1],
      ],
    )
    assert.deepEqual(fitting.skills.conflicting, [])
    for (const skill of fitting.skills.compatible)
      assert.match(skill.url, /^https:\/\/github\.com\//)

    await putAnswers(client, user, project.id, [
      answer('ask-before-act', 1),
      answer('components-size', 1),
    ])
    const conflicting = await generate(client, user, project.id)
    assert.deepEqual(
      conflicting.skills.conflicting.map((skill) => skill.id),
      ['brainstorming', 'writing-plans', 'react-composition-patterns'],
    )
    assert.deepEqual(conflicting.skills.conflicting[0].reasons, [
      {
        slot: 'workflow.autonomy',
        questionLabel: {
          en: 'The assistant asks me before a structural decision rather than choosing alone.',
          fr: "L'assistant me pose une question avant une décision structurante plutôt que de choisir seul.",
        },
        yourAnswer: { en: '1 of 5', fr: '1 sur 5' },
        skillExpects: { en: '4 to 5 of 5', fr: '4 à 5 sur 5' },
      },
    ])

    // A generation is frozen: the earlier one still shows what was suggested then.
    const shown = await client
      .get(`/projects/${project.id}/agent-config/generations/${fitting.id}`)
      .headers(json)
      .loginAs(user)
    assert.deepEqual(shown.body().generation.skills, fitting.skills)
  })

  test('suggests the skills that fit the kinds of the project diagrams', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const architecture = await client
      .post('/architectures')
      .headers(json)
      .loginAs(user)
      .json({ projectId: project.id, title: 'Checkout' })
    architecture.assertStatus(201)
    const diagram = await client
      .post(`/architectures/${architecture.body().architecture.id}/diagrams`)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Context', kind: 'c4' })
    diagram.assertStatus(201)
    await createConfig(client, user, project.id)

    const generation = await generate(client, user, project.id)
    assert.deepEqual(
      generation.skills.compatible.map((skill) => skill.id),
      ['c4-architecture', 'mermaid-diagrams'],
    )
  })

  test('answers 404 for the latest generation before the first one', async ({ client }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    await createConfig(client, user, project.id)

    const latest = await client
      .get(`/projects/${project.id}/agent-config/generations/latest`)
      .headers(json)
      .loginAs(user)
    latest.assertStatus(404)
  })

  test('keeps the details out of the files until a rule is accepted', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    await createConfig(client, user, project.id)
    await putAnswers(client, user, project.id, [
      answer('ts-any', 5, 'Jamais de any, même dans les tests.'),
    ])

    const before = await generate(client, user, project.id)
    for (const file of before.files) assert.notInclude(file.content, 'Jamais')

    const rule = await client
      .post(`/projects/${project.id}/agent-config/rules`)
      .headers(json)
      .loginAs(user)
      .json({ section: 'TypeScript', text: 'Never use any, not even in tests.', source: 'llm' })
    rule.assertStatus(201)
    assert.equal(rule.body().rule.source, 'llm')
    assert.containsSubset(rule.body().impact, {
      stale: true,
      files: [{ path: 'AGENTS.md', sections: ['TypeScript'], change: 'modified' }],
    })

    const after = await generate(client, user, project.id)
    assert.include(after.files[0].content, '- Never use any, not even in tests.')
  })

  test('tells which files and sections a changed answer would alter', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    await createConfig(client, user, project.id)
    await putAnswers(client, user, project.id, ALL_ANSWERS)
    await generate(client, user, project.id)

    const changed = await putAnswers(client, user, project.id, [answer('ts-any', 1)])
    changed.assertStatus(200)
    assert.deepEqual(changed.body().impact, {
      stale: true,
      changedQuestions: [`${Q}/ts-any`],
      files: [{ path: 'AGENTS.md', sections: ['TypeScript'], change: 'modified' }],
    })

    const retargeted = await client
      .put(`/projects/${project.id}/agent-config`)
      .headers(json)
      .loginAs(user)
      .json({ questionnaires: [Q], targets: ['cursor', 'gemini-cli'] })
    retargeted.assertStatus(200)
    assert.deepEqual(retargeted.body().impact.files, [
      { path: 'AGENTS.md', sections: ['TypeScript'], change: 'modified' },
      { path: 'GEMINI.md', sections: [], change: 'added' },
      { path: 'CLAUDE.md', sections: [], change: 'removed' },
    ])
  })

  test('marks the latest generation stale when the project context changes', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    await createConfig(client, user, project.id)
    await generate(client, user, project.id)

    const renamed = await client
      .patch(`/projects/${project.id}`)
      .headers(json)
      .loginAs(user)
      .json({ name: 'Storefront v2' })
    renamed.assertStatus(200)

    const detail = await client
      .get(`/projects/${project.id}/agent-config`)
      .headers(json)
      .loginAs(user)
    assert.deepEqual(detail.body().impact, {
      stale: true,
      changedQuestions: [],
      files: [{ path: 'AGENTS.md', sections: ['Project'], change: 'modified' }],
    })
  })

  test(`keeps only the newest ${AGENT_GENERATIONS_KEPT} generations`, async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const { config } = await createConfig(client, user, project.id)
    const first = await generate(client, user, project.id)
    const template = await AgentConfigGeneration.findOrFail(first.id)
    await AgentConfigGeneration.createMany(
      Array.from({ length: AGENT_GENERATIONS_KEPT - 1 }, () => ({
        agentConfigId: config.id,
        revision: template.revision,
        catalogVersion: template.catalogVersion,
        inputs: template.inputs,
        files: template.files,
        recommendations: template.recommendations,
        skills: template.skills,
      })),
    )

    const newest = await generate(client, user, project.id)

    const ids = (await AgentConfigGeneration.query().where('agentConfigId', config.id)).map(
      (item) => item.id,
    )
    assert.lengthOf(ids, AGENT_GENERATIONS_KEPT)
    assert.notInclude(ids, first.id)
    assert.include(ids, newest.id)
  })
})

test.group('Agent configs - questionnaire versions', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('flags a questionnaire answered against an older version and keeps its answers', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const { config } = await createConfig(client, user, project.id)
    await putAnswers(client, user, project.id, [answer('ts-any', 5)])
    await AgentConfig.query()
      .where('id', config.id)
      .update({ questionnaires: JSON.stringify([{ id: Q, version: '0.9.0' }]) })

    const detail = await client
      .get(`/projects/${project.id}/agent-config`)
      .headers(json)
      .loginAs(user)
    detail.assertStatus(200)
    assert.deepEqual(detail.body().config.outdatedQuestionnaires, [
      { id: Q, version: '0.9.0', currentVersion: '1.0.0' },
    ])
    assert.lengthOf(detail.body().config.answers, 1)

    const upgraded = await client
      .put(`/projects/${project.id}/agent-config`)
      .headers(json)
      .loginAs(user)
      .json({ questionnaires: [Q], targets: ['claude-code', 'cursor'] })
    upgraded.assertStatus(200)
    assert.deepEqual(upgraded.body().config.outdatedQuestionnaires, [])
    assert.deepEqual(upgraded.body().config.questionnaires, [{ id: Q, version: '1.0.0' }])
    assert.lengthOf(upgraded.body().config.answers, 1)
  })
})

test.group('Agent configs - API tokens', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('a read-only key pulls the latest generation but cannot change answers', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    await createConfig(client, user, project.id)
    const generation = await generate(client, user, project.id)
    const secret = await createToken(client, user, ['read'])

    const latest = await client
      .get(`/projects/${project.id}/agent-config/generations/latest`)
      .headers(bearer(secret))
    latest.assertStatus(200)
    assert.equal(latest.body().generation.id, generation.id)

    const write = await client
      .put(`/projects/${project.id}/agent-config/answers`)
      .headers(bearer(secret))
      .json({ answers: [answer('ts-any', 1)] })
    write.assertStatus(403)

    const regenerate = await client
      .post(`/projects/${project.id}/agent-config/generations`)
      .headers(bearer(secret))
    regenerate.assertStatus(403)
  })

  test('a read and write key manages the configuration', async ({ client }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const secret = await createToken(client, user, ['read', 'write'])

    const created = await client
      .put(`/projects/${project.id}/agent-config`)
      .headers(bearer(secret))
      .json({ questionnaires: [Q], targets: ['codex'] })
    created.assertStatus(201)
    const answered = await client
      .put(`/projects/${project.id}/agent-config/answers`)
      .headers(bearer(secret))
      .json({ answers: [answer('ts-any', 1)] })
    answered.assertStatus(200)
    const generated = await client
      .post(`/projects/${project.id}/agent-config/generations`)
      .headers(bearer(secret))
    generated.assertStatus(201)
  })
})
