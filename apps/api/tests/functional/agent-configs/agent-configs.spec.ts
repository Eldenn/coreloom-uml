import testUtils from '@adonisjs/core/services/test_utils'
import {
  CATALOG_VERSION,
  isAppliedRule,
  MARKER_PREFIX,
  RULE_PACKS,
  ruleSections,
} from '@coreloom-uml/catalog'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import { AGENT_GENERATIONS_KEPT, AGENT_RULES_MAX } from '#app/agent-configs/constants/agent-config'
import AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import AgentConfigReadyRule from '#app/agent-configs/models/agent-config-ready-rule'
import AgentConfigRule from '#app/agent-configs/models/agent-config-rule'
import type { CreatedApiTokenOutput } from '#app/api-tokens/validators/api-tokens-output'
import User from '#app/users/models/user'
import { withEmptySkillsCatalog } from '#tests/helpers/skills'

const json = { accept: 'application/json' }

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
  projectId: number | null,
  body: Record<string, unknown> = {},
) {
  const response = await client
    .post('/agent-configs')
    .headers(json)
    .loginAs(user)
    .json({
      name: 'Storefront conventions',
      projectId,
      targets: ['claude-code', 'cursor'],
      ...body,
    })
  response.assertStatus(201)
  return response.body()
}

async function createArchitecture(
  client: Client,
  user: User,
  body: { title: string; projectId?: number },
) {
  const response = await client
    .post('/architectures')
    .headers(json)
    .loginAs(user)
    .json({ diagram: { kind: 'class' }, ...body })
  response.assertStatus(201)
  return response.body().architecture as { id: number; projectId: number | null }
}

type Accepted = { rule: string; value?: string | null }

function putReady(client: Client, user: User, configId: number, slot: string, rules: Accepted[]) {
  return client
    .put(`/agent-configs/${configId}/ready-rules/${slot}`)
    .headers(json)
    .loginAs(user)
    .json({ rules })
}

/** Ready-made rules in ten groups of the front-end pack, as `[slot, rules]`. */
const ALL_READY: [string, Accepted[]][] = [
  ['typescript.any', [{ rule: 'agree' }]],
  ['react.granularity', [{ rule: 'agree' }]],
  ['react.state', [{ rule: 'tanstack-query-only' }]],
  ['react.styling', [{ rule: 'tailwind' }]],
  ['testing.levels', [{ rule: 'unit' }, { rule: 'e2e' }]],
  ['style.comments', [{ rule: 'agree' }]],
  ['workflow.changes', [{ rule: 'agree' }]],
  ['workflow.autonomy', [{ rule: 'agree' }]],
  ['tooling.package-manager', [{ rule: 'pnpm' }]],
  ['tooling.checks', [{ rule: 'run', value: 'pnpm lint && pnpm test' }]],
]

async function acceptAll(client: Client, user: User, configId: number) {
  for (const [slot, rules] of ALL_READY) {
    ;(await putReady(client, user, configId, slot, rules)).assertStatus(200)
  }
}

async function generate(client: Client, user: User, configId: number) {
  const response = await client
    .post(`/agent-configs/${configId}/generations`)
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

test.group('Agent configs - rule packs', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('lists every rule pack of the catalog, each rule telling whether it is applied', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()

    const list = await client.get('/rule-packs').headers(json).loginAs(user)
    list.assertStatus(200)
    type Rule = {
      id: string
      title: { en: string; fr: string }
      lines: string[]
      input: boolean
      alone: boolean
      applied: boolean
    }
    type Group = { slot: string; pick: string; lines: string[]; help: unknown; rules: Rule[] }
    const packs = list.body().packs as { id: string; sections: string[]; groups: Group[] }[]
    assert.deepEqual(
      packs.map((pack) => pack.id),
      RULE_PACKS.map((pack) => pack.id),
    )
    assert.deepEqual(packs[0].sections, [
      'TypeScript',
      'React',
      'HTML, CSS and accessibility',
      'Framework and rendering',
      'Data and API',
      'Front-end security',
    ])

    const groups = packs.flatMap((pack) => pack.groups)
    const find = (slot: string) => groups.find((group) => group.slot === slot) as Group
    const rule = (slot: string, id: string) =>
      find(slot).rules.find((item) => item.id === id) as Rule
    // A slot names one group across every pack.
    assert.lengthOf(new Set(groups.map((group) => group.slot)), groups.length)
    for (const group of groups) {
      for (const item of group.rules) {
        assert.equal(item.applied, isAppliedRule(group.slot, item.id))
        assert.isNotEmpty(item.title.en)
      }
    }

    assert.containsSubset(find('git.commit-messages'), { pick: 'one', lines: [] })
    assert.isTrue(rule('git.commit-messages', 'conventional').applied)
    assert.isFalse(rule('git.commit-messages', 'imperative').applied)
    assert.containsSubset(rule('git.commit-messages', 'other'), { input: true, applied: false })
    assert.containsSubset(rule('testing.levels', 'none'), { alone: true, input: false })
    assert.equal(find('testing.levels').pick, 'many')
    assert.isTrue(rule('tooling.checks', 'run').applied)
    // A rule without a label is named after its first line; one without a line, after its group's.
    assert.equal(rule('typescript.any', 'agree').title.en, rule('typescript.any', 'agree').lines[0])
    assert.deepEqual(rule('tooling.package-manager', 'pnpm').lines, [])
    assert.lengthOf(find('tooling.package-manager').lines, 1)
  })

  test('requires a session or an API token, and no longer serves questionnaires', async ({
    client,
  }) => {
    const anonymous = await client.get('/rule-packs').headers(json)
    anonymous.assertStatus(401)

    const user = await makeUser()
    const secret = await createToken(client, user, ['read'])
    ;(await client.get('/rule-packs').headers(bearer(secret))).assertStatus(200)
    ;(await client.get('/questionnaires').headers(json).loginAs(user)).assertStatus(404)
  })
})

test.group('Agent configs - configuration', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates the configuration in a project, then updates it in place', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)

    const created = await createConfig(client, user, project.id, { notes: 'Ship on Fridays.' })
    assert.containsSubset(created.config, {
      projectId: project.id,
      name: 'Storefront conventions',
      targets: ['claude-code', 'cursor'],
      notes: 'Ship on Fridays.',
      revision: 1,
      readyRules: [],
      rules: [],
      latestGeneration: null,
    })
    for (const gone of ['questionnaires', 'answers', 'outdatedQuestionnaires']) {
      assert.notProperty(created.config, gone)
    }
    // Every pack is open to every configuration: the sections of all of them.
    assert.deepEqual(created.config.ruleSections, ruleSections(RULE_PACKS))
    assert.includeMembers(created.config.ruleSections, ['React', 'Database', 'Git', 'Agent loop'])
    assert.notInclude(created.config.ruleSections, 'Project notes')
    assert.isNull(created.impact)
    const config = created.config as { id: number }

    const updated = await client
      .patch(`/agent-configs/${config.id}`)
      .headers(json)
      .loginAs(user)
      .json({ targets: ['generic'] })
    updated.assertStatus(200)
    assert.containsSubset(updated.body().config, {
      id: config.id,
      targets: ['generic'],
      notes: 'Ship on Fridays.',
      revision: 2,
    })

    const renamed = await client
      .patch(`/agent-configs/${config.id}`)
      .headers(json)
      .loginAs(user)
      .json({ name: 'Shop rules', targets: ['generic'], notes: 'Ship on Fridays.' })
    renamed.assertStatus(200)
    assert.containsSubset(renamed.body().config, { name: 'Shop rules', revision: 2 })

    const shown = await client.get(`/agent-configs/${config.id}`).headers(json).loginAs(user)
    shown.assertStatus(200)
    assert.equal(shown.body().config.name, 'Shop rules')
  })

  test('refuses unknown targets, and markers in the notes or name', async ({ client, assert }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const post = (body: Record<string, unknown>) =>
      client
        .post('/agent-configs')
        .headers(json)
        .loginAs(user)
        .json({
          name: 'Rules',
          projectId: project.id,
          targets: ['codex'],
          ...body,
        })

    ;(await post({ targets: ['emacs'] })).assertStatus(422)
    ;(await post({ targets: [] })).assertStatus(422)
    ;(await post({ name: '' })).assertStatus(422)
    ;(await post({ name: `<!-- ${MARKER_PREFIX}end -->` })).assertStatus(422)
    ;(await post({ notes: `<!-- ${MARKER_PREFIX}end -->` })).assertStatus(422)

    assert.isNull(await AgentConfig.findBy('projectId', project.id))
  })

  test('creates a configuration outside any project, from the architectures outside any project', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const loose = await createArchitecture(client, user, { title: 'Loose payments' })
    await createArchitecture(client, user, { title: 'Shop catalog', projectId: project.id })

    const created = await createConfig(client, user, null, { name: 'Side tools' })
    assert.containsSubset(created.config, { projectId: null, name: 'Side tools' })
    assert.deepEqual(
      created.config.diagrams.map((diagram: { architecture: string }) => diagram.architecture),
      [],
    )

    const generation = await generate(client, user, created.config.id)
    const agents = generation.files.find((file) => file.path === 'AGENTS.md')
    assert.include(agents?.content, 'Side tools')
    assert.include(agents?.content, 'Loose payments')
    assert.notInclude(agents?.content, 'Shop catalog')
    assert.equal(loose.projectId, null)
  })

  test('lists the configurations, in and outside projects', async ({ client, assert }) => {
    const user = await makeUser()
    const other = await makeUser()
    const project = await createProject(client, user)
    const inside = (await createConfig(client, user, project.id, { name: 'Shop' })).config
    const outside = (await createConfig(client, user, null, { name: 'Scripts' })).config
    await createConfig(client, other, null, { name: 'Not mine' })

    const all = await client.get('/agent-configs').headers(json).loginAs(user)
    all.assertStatus(200)
    assert.sameMembers(
      all.body().data.map((item: { id: number }) => item.id),
      [inside.id, outside.id],
    )
    assert.containsSubset(all.body().meta, { page: 1, total: 2 })
    assert.notProperty(all.body().data[0], 'readyRules')

    const inProject = await client
      .get(`/agent-configs?projectId=${project.id}`)
      .headers(json)
      .loginAs(user)
    assert.deepEqual(
      inProject.body().data.map((item: { id: number }) => item.id),
      [inside.id],
    )
    const searched = await client.get('/agent-configs?search=scr').headers(json).loginAs(user)
    assert.deepEqual(
      searched.body().data.map((item: { id: number }) => item.id),
      [outside.id],
    )
  })

  test('moves a configuration into a project and out of it, one per project', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const other = await createProject(client, user, { name: 'Other' })
    const stranger = await createProject(client, await makeUser(), { name: 'Theirs' })
    const taken = (await createConfig(client, user, project.id)).config
    const { config } = await createConfig(client, user, null)
    const patch = (body: Record<string, unknown>) =>
      client.patch(`/agent-configs/${config.id}`).headers(json).loginAs(user).json(body)

    const conflict = await patch({ projectId: project.id })
    conflict.assertStatus(409)
    ;(await patch({ projectId: stranger.id })).assertStatus(404)

    const moved = await patch({ projectId: other.id })
    moved.assertStatus(200)
    assert.equal(moved.body().config.projectId, other.id)
    assert.equal(moved.body().config.revision, 1)

    const out = await patch({ projectId: null })
    out.assertStatus(200)
    assert.isNull(out.body().config.projectId)

    const second = await client
      .post('/agent-configs')
      .headers(json)
      .loginAs(user)
      .json({ name: 'Again', projectId: project.id, targets: ['codex'] })
    second.assertStatus(409)
    assert.equal((await AgentConfig.findOrFail(taken.id)).projectId, project.id)
  })

  test('deletes the configuration with its ready-made rules, rules and generations', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const { config } = await createConfig(client, user, project.id)
    ;(await putReady(client, user, config.id, 'typescript.any', [{ rule: 'agree' }])).assertStatus(
      200,
    )
    await client
      .post(`/agent-configs/${config.id}/rules`)
      .headers(json)
      .loginAs(user)
      .json({ section: 'React', text: 'Prefer server components.' })
    await generate(client, user, config.id)

    const deleted = await client.delete(`/agent-configs/${config.id}`).headers(json).loginAs(user)
    deleted.assertStatus(204)

    assert.isNull(await AgentConfig.find(config.id))
    assert.lengthOf(await AgentConfigReadyRule.query().where('agentConfigId', config.id), 0)
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
    const { config } = await createConfig(client, owner, project.id)
    const generation = await generate(client, owner, config.id)
    const rule = await client
      .post(`/agent-configs/${config.id}/rules`)
      .headers(json)
      .loginAs(owner)
      .json({ section: 'React', text: 'Prefer hooks.' })
    const ruleId = rule.body().rule.id
    const base = `/agent-configs/${config.id}`

    for (const request of [
      client.get(base),
      client.patch(base).json({ targets: ['codex'] }),
      client.delete(base),
      client.put(`${base}/ready-rules/typescript.any`).json({ rules: [{ rule: 'agree' }] }),
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

test.group('Agent configs - ready-made rules', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  const held = (body: { config: { readyRules: unknown[] } }) => body.config.readyRules

  test('a `one` group holds the last rule accepted, and an empty list removes it', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const { config } = await createConfig(client, user, null)
    const put = (rules: Accepted[]) => putReady(client, user, config.id, 'typescript.any', rules)

    const first = await put([{ rule: 'agree' }])
    first.assertStatus(200)
    assert.deepEqual(held(first.body()), [{ slot: 'typescript.any', rule: 'agree', value: null }])
    assert.equal(first.body().config.revision, 2)
    assert.isNull(first.body().impact)

    const second = await put([{ rule: 'disagree' }])
    second.assertStatus(200)
    assert.deepEqual(held(second.body()), [
      { slot: 'typescript.any', rule: 'disagree', value: null },
    ])
    assert.equal(second.body().config.revision, 3)

    const both = await put([{ rule: 'agree' }, { rule: 'disagree' }])
    both.assertStatus(422)
    assert.equal(both.body().error.message, 'This group holds one rule')

    const removed = await put([])
    removed.assertStatus(200)
    assert.deepEqual(held(removed.body()), [])
    assert.equal(removed.body().config.revision, 4)
    assert.lengthOf(await AgentConfigReadyRule.query().where('agentConfigId', config.id), 0)
  })

  test('a `many` group holds several rules, in catalog order, and one that stands alone', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const { config } = await createConfig(client, user, null)
    const put = (rules: Accepted[]) => putReady(client, user, config.id, 'testing.levels', rules)

    ;(await put([{ rule: 'unit' }])).assertStatus(200)
    const more = await put([{ rule: 'e2e' }, { rule: 'unit' }])
    more.assertStatus(200)
    assert.deepEqual(held(more.body()), [
      { slot: 'testing.levels', rule: 'unit', value: null },
      { slot: 'testing.levels', rule: 'e2e', value: null },
    ])

    const combined = await put([{ rule: 'none' }, { rule: 'unit' }])
    combined.assertStatus(422)
    assert.equal(combined.body().error.message, 'none cannot be combined')
    const twice = await put([{ rule: 'unit' }, { rule: 'unit' }])
    twice.assertStatus(422)
    assert.lengthOf(
      held((await client.get(`/agent-configs/${config.id}`).headers(json).loginAs(user)).body()),
      2,
    )

    const alone = await put([{ rule: 'none' }])
    alone.assertStatus(200)
    assert.deepEqual(held(alone.body()), [{ slot: 'testing.levels', rule: 'none', value: null }])

    // Another group is left alone.
    ;(await putReady(client, user, config.id, 'typescript.any', [{ rule: 'agree' }])).assertStatus(
      200,
    )
    const cleared = await put([])
    assert.deepEqual(held(cleared.body()), [{ slot: 'typescript.any', rule: 'agree', value: null }])
  })

  test('a rule that takes a text needs it, and only such a rule takes one', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const { config } = await createConfig(client, user, null)
    const put = (slot: string, rules: Accepted[]) => putReady(client, user, config.id, slot, rules)

    for (const rules of [
      [{ rule: 'run' }],
      [{ rule: 'run', value: null }],
      [{ rule: 'run', value: '   ' }],
    ]) {
      const missing = await put('tooling.checks', rules)
      missing.assertStatus(422)
      assert.equal(missing.body().error.message, 'run needs a text')
    }
    ;(await put('tooling.checks', [{ rule: 'run', value: 'x'.repeat(501) }])).assertStatus(422)
    const extra = await put('typescript.any', [{ rule: 'agree', value: 'because' }])
    extra.assertStatus(422)
    assert.equal(extra.body().error.message, 'agree takes no text')

    const typed = await put('tooling.checks', [{ rule: 'run', value: '  pnpm lint && pnpm test ' }])
    typed.assertStatus(200)
    assert.deepEqual(held(typed.body()), [
      { slot: 'tooling.checks', rule: 'run', value: 'pnpm lint && pnpm test' },
    ])
  })

  test('refuses an unknown slot or rule, a marker and a malformed body, and saves nothing', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const { config } = await createConfig(client, user, null)

    const slot = await putReady(client, user, config.id, 'no.such-slot', [{ rule: 'agree' }])
    slot.assertStatus(422)
    assert.equal(slot.body().error.message, 'Unknown slot: no.such-slot')
    const rule = await putReady(client, user, config.id, 'typescript.any', [{ rule: 'mostly' }])
    rule.assertStatus(422)
    assert.equal(rule.body().error.message, 'Unknown rule: mostly')
    const marker = await putReady(client, user, config.id, 'tooling.checks', [
      { rule: 'run', value: `pnpm test ${MARKER_PREFIX}end` },
    ])
    marker.assertStatus(422)
    const malformed = await client
      .put(`/agent-configs/${config.id}/ready-rules/typescript.any`)
      .headers(json)
      .loginAs(user)
      .json({})
    malformed.assertStatus(422)

    assert.lengthOf(await AgentConfigReadyRule.query().where('agentConfigId', config.id), 0)
    assert.equal((await AgentConfig.findOrFail(config.id)).revision, 1)
  })

  test('bumps the revision only when the rules of the group change', async ({ client, assert }) => {
    const user = await makeUser()
    const { config } = await createConfig(client, user, null)
    const put = (slot: string, rules: Accepted[]) => putReady(client, user, config.id, slot, rules)
    const revision = async (response: ReturnType<typeof put>) =>
      (await response).body().config.revision as number

    assert.equal(await revision(put('testing.levels', [])), 1)
    assert.equal(await revision(put('testing.levels', [{ rule: 'unit' }, { rule: 'e2e' }])), 2)
    assert.equal(await revision(put('testing.levels', [{ rule: 'e2e' }, { rule: 'unit' }])), 2)
    assert.equal(await revision(put('tooling.checks', [{ rule: 'run', value: 'pnpm test' }])), 3)
    assert.equal(await revision(put('tooling.checks', [{ rule: 'run', value: 'pnpm test' }])), 3)
    assert.equal(await revision(put('tooling.checks', [{ rule: 'run', value: 'pnpm lint' }])), 4)
  })

  test('hides another account configuration behind a 404', async ({ client, assert }) => {
    const owner = await makeUser()
    const { config } = await createConfig(client, owner, null)

    const response = await putReady(client, await makeUser(), config.id, 'typescript.any', [
      { rule: 'agree' },
    ])
    response.assertStatus(404)
    ;(await putReady(client, owner, 999_999, 'typescript.any', [{ rule: 'agree' }])).assertStatus(
      404,
    )
    assert.lengthOf(await AgentConfigReadyRule.query().where('agentConfigId', config.id), 0)
  })

  test('leaves out a held rule the catalog no longer has', async ({ client, assert }) => {
    const user = await makeUser()
    const { config } = await createConfig(client, user, null)
    await AgentConfigReadyRule.createMany([
      { agentConfigId: config.id, slot: 'typescript.any', rule: 'agree', value: null },
      { agentConfigId: config.id, slot: 'typescript.any', rule: 'retired-rule', value: null },
      { agentConfigId: config.id, slot: 'retired.slot', rule: 'agree', value: null },
    ])

    const shown = await client.get(`/agent-configs/${config.id}`).headers(json).loginAs(user)
    assert.deepEqual(held(shown.body()), [{ slot: 'typescript.any', rule: 'agree', value: null }])
    const generation = await generate(client, user, config.id)
    assert.include(generation.files[0].content, 'Never use `any`')
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
    const { config } = await createConfig(client, user, project.id)
    const base = `/agent-configs/${config.id}/rules`
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

    const shown = await client.get(`/agent-configs/${config.id}`).headers(json).loginAs(user)
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

  test('refuses a rule outside the catalog sections, or past the limit', async ({ client }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const { config } = await createConfig(client, user, project.id)
    const base = `/agent-configs/${config.id}/rules`
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
    const { config } = await createConfig(client, user, project.id)
    await acceptAll(client, user, config.id)

    const generation = await generate(client, user, config.id)
    assert.equal(generation.catalogVersion, CATALOG_VERSION)
    assert.equal(generation.revision, 1 + ALL_READY.length)
    assert.deepEqual(
      generation.files.map((file) => [file.path, file.kind]),
      [
        ['AGENTS.md', 'generic'],
        ['CLAUDE.md', 'pointer'],
        ['.claude/settings.json', 'settings'],
        ['.githooks/pre-commit', 'config'],
      ],
    )
    const [agents, claude, settings] = generation.files
    assert.include(JSON.parse(settings.content).permissions.allow, 'Bash(pnpm lint)')
    assert.include(agents.content, '**Storefront**: The online shop')
    assert.include(agents.content, '**Checkout**')
    assert.include(agents.content, '**Catalog search**')
    assert.include(agents.content, '## TypeScript')
    assert.include(agents.content, 'pnpm lint')
    assert.include(claude.content, '@AGENTS.md')
    assert.match(agents.blockHash, /^sha256:[0-9a-f]{64}$/)
    assert.isTrue(generation.recommendations.some((item) => item.target === 'claude-code'))

    // Same state, same bytes: no id or date in what is rendered.
    const again = await generate(client, user, config.id)
    assert.deepEqual(again.files, generation.files)
    assert.notInclude(agents.content, String(project.id))
    assert.notMatch(agents.content, /\d{4}-\d{2}-\d{2}/)

    const latest = await client
      .get(`/agent-configs/${config.id}/generations/latest`)
      .headers(json)
      .loginAs(user)
    latest.assertStatus(200)
    assert.equal(latest.body().generation.id, again.id)

    const shown = await client
      .get(`/agent-configs/${config.id}/generations/${generation.id}`)
      .headers(json)
      .loginAs(user)
    shown.assertStatus(200)
    assert.deepEqual(shown.body().generation.files, generation.files)

    const list = await client
      .get(`/agent-configs/${config.id}/generations?perPage=1`)
      .headers(json)
      .loginAs(user)
    list.assertStatus(200)
    assert.deepEqual(list.body().meta, { page: 1, perPage: 1, total: 2, lastPage: 2 })
    assert.deepEqual(list.body().data[0].paths, [
      'AGENTS.md',
      'CLAUDE.md',
      '.claude/settings.json',
      '.githooks/pre-commit',
    ])
    assert.notProperty(list.body().data[0], 'files')

    const detail = await client.get(`/agent-configs/${config.id}`).headers(json).loginAs(user)
    assert.equal(detail.body().config.latestGeneration.id, again.id)
    assert.deepEqual(detail.body().impact, { stale: false, changedSlots: [], files: [] })
  })

  test('suggests the catalog skills that fit the rules held, and keeps them per generation', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const { config } = await createConfig(client, user, project.id)

    const empty = await generate(client, user, config.id)
    assert.deepEqual(empty.skills, { compatible: [], conflicting: [], held: [], copies: [] })

    await acceptAll(client, user, config.id)
    const fitting = await generate(client, user, config.id)
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

    for (const slot of ['workflow.autonomy', 'react.granularity']) {
      ;(await putReady(client, user, config.id, slot, [{ rule: 'disagree' }])).assertStatus(200)
    }
    const conflicting = await generate(client, user, config.id)
    // A rule without a label is named after its line.
    const AUTONOMY = {
      agree:
        'Ask before any structural decision (new dependency, new pattern, data model or public API change).',
      askBeforeWriting:
        'Ask before writing to any file, and before any structural decision (new dependency, new pattern, data model or public API change).',
      disagree:
        'Make structural decisions yourself when needed, and explain them when handing back.',
    }
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
        yourAnswer: { en: AUTONOMY.disagree, fr: AUTONOMY.disagree },
        skillExpects: {
          en: `${AUTONOMY.agree} / ${AUTONOMY.askBeforeWriting}`,
          fr: `${AUTONOMY.agree} / ${AUTONOMY.askBeforeWriting}`,
        },
      },
    ])

    // A generation is frozen: the earlier one still shows what was suggested then.
    const shown = await client
      .get(`/agent-configs/${config.id}/generations/${fitting.id}`)
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
    const { config } = await createConfig(client, user, project.id)

    const generation = await generate(client, user, config.id)
    assert.deepEqual(
      generation.skills.compatible.map((skill) => skill.id),
      ['c4-architecture', 'mermaid-diagrams'],
    )
  })

  test('renders dependency rules from a package diagram of the project', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const architecture = await client
      .post('/architectures')
      .headers(json)
      .loginAs(user)
      .json({ projectId: project.id, title: 'Layers', diagram: { kind: 'package' } })
    architecture.assertStatus(201)
    const { id, diagrams } = architecture.body().architecture
    const saved = await client
      .patch(`/architectures/${id}/diagrams/${diagrams[0].id}`)
      .headers(json)
      .loginAs(user)
      .json({
        version: 1,
        content: {
          kind: 'package',
          elements: [
            { id: 'src', kind: 'package' },
            { id: 'ui', kind: 'package', parent: 'src' },
            { id: 'domain', kind: 'package', parent: 'src' },
          ],
          relations: [{ from: 'ui', to: 'domain' }],
        },
      })
    saved.assertStatus(200)
    const { config } = await createConfig(client, user, project.id)

    const generation = await generate(client, user, config.id)
    const rules = generation.files.find((file) => file.path === '.dependency-cruiser.cjs')
    assert.equal(rules?.kind, 'config')
    assert.include(rules?.content, '"name": "not-in-diagram:src/domain"')
    assert.notInclude(rules?.content, 'not-in-diagram:src/ui')
    assert.include(generation.files[0]?.content, 'run `npx depcruise src`')
  })

  test('answers 404 for the latest generation before the first one', async ({ client }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const { config } = await createConfig(client, user, project.id)

    const latest = await client
      .get(`/agent-configs/${config.id}/generations/latest`)
      .headers(json)
      .loginAs(user)
    latest.assertStatus(404)
  })

  test('renders what an applied rule enforces: the commit-message hook', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const { config } = await createConfig(client, user, null)
    const paths = async () =>
      (await generate(client, user, config.id)).files.map((file) => file.path)

    assert.notInclude(await paths(), '.githooks/commit-msg')

    const accepted = await putReady(client, user, config.id, 'git.commit-messages', [
      { rule: 'conventional' },
    ])
    accepted.assertStatus(200)
    assert.deepEqual(accepted.body().impact, {
      stale: true,
      changedSlots: ['git.commit-messages'],
      files: [
        { path: 'AGENTS.md', sections: ['Git'], change: 'modified' },
        { path: '.githooks/commit-msg', sections: [], change: 'added' },
      ],
    })

    const generation = await generate(client, user, config.id)
    const hook = generation.files.find((file) => file.path === '.githooks/commit-msg')
    assert.equal(hook?.kind, 'config')
    assert.include(generation.files[0].content, 'Conventional Commits')

    // A rule of the same group that only writes a line takes the hook away again.
    ;(
      await putReady(client, user, config.id, 'git.commit-messages', [{ rule: 'imperative' }])
    ).assertStatus(200)
    assert.notInclude(await paths(), '.githooks/commit-msg')
  })

  test('adds an accepted proposal to its section', async ({ client, assert }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const { config } = await createConfig(client, user, project.id)
    await generate(client, user, config.id)

    const rule = await client
      .post(`/agent-configs/${config.id}/rules`)
      .headers(json)
      .loginAs(user)
      .json({ section: 'TypeScript', text: 'Never use any, not even in tests.', source: 'llm' })
    rule.assertStatus(201)
    assert.equal(rule.body().rule.source, 'llm')
    assert.containsSubset(rule.body().impact, {
      stale: true,
      files: [{ path: 'AGENTS.md', sections: ['TypeScript'], change: 'modified' }],
    })

    const after = await generate(client, user, config.id)
    assert.include(after.files[0].content, '- Never use any, not even in tests.')
  })

  test('replays a generation stored before ready-made rules, whose files stay as they were', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const { config } = await createConfig(client, user, project.id)
    const first = await generate(client, user, config.id)
    // The snapshot a generation held then: questionnaires and answers, no ready-made rules.
    const row = await AgentConfigGeneration.findOrFail(first.id)
    const { ready: _ready, ...inputs } = row.inputs
    const stored = [{ ...first.files[0], content: 'Rendered from answers, long ago.\n' }]
    await AgentConfigGeneration.query()
      .where('id', first.id)
      .update({
        inputs: JSON.stringify({
          ...inputs,
          questionnaires: [{ id: 'frontend-react', version: '1.1.0' }],
          answers: [{ questionnaireId: 'frontend-react', questionId: 'ts-any', value: 5 }],
        }),
        files: JSON.stringify(stored),
      })

    const detail = await client.get(`/agent-configs/${config.id}`).headers(json).loginAs(user)
    detail.assertStatus(200)
    assert.deepEqual(detail.body().impact, { stale: false, changedSlots: [], files: [] })

    const accepted = await putReady(client, user, config.id, 'typescript.any', [{ rule: 'agree' }])
    accepted.assertStatus(200)
    assert.deepEqual(accepted.body().impact, {
      stale: true,
      changedSlots: ['typescript.any'],
      files: [{ path: 'AGENTS.md', sections: ['TypeScript'], change: 'modified' }],
    })

    const shown = await client
      .get(`/agent-configs/${config.id}/generations/${first.id}`)
      .headers(json)
      .loginAs(user)
    shown.assertStatus(200)
    assert.deepEqual(shown.body().generation.files, stored)
  })

  test('tells which files and sections a changed rule would alter', async ({ client, assert }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const { config } = await createConfig(client, user, project.id)
    await acceptAll(client, user, config.id)
    await generate(client, user, config.id)

    const changed = await putReady(client, user, config.id, 'typescript.any', [
      { rule: 'disagree' },
    ])
    changed.assertStatus(200)
    assert.deepEqual(changed.body().impact, {
      stale: true,
      changedSlots: ['typescript.any'],
      files: [{ path: 'AGENTS.md', sections: ['TypeScript'], change: 'modified' }],
    })

    const retargeted = await client
      .patch(`/agent-configs/${config.id}`)
      .headers(json)
      .loginAs(user)
      .json({ targets: ['cursor', 'gemini-cli'] })
    retargeted.assertStatus(200)
    assert.deepEqual(retargeted.body().impact.files, [
      { path: 'AGENTS.md', sections: ['TypeScript'], change: 'modified' },
      { path: 'GEMINI.md', sections: [], change: 'added' },
      { path: '.gemini/settings.json', sections: [], change: 'added' },
      { path: 'CLAUDE.md', sections: [], change: 'removed' },
      { path: '.claude/settings.json', sections: [], change: 'removed' },
    ])
  })

  test('marks the latest generation stale when the project context changes', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const { config } = await createConfig(client, user, project.id)
    await generate(client, user, config.id)

    const renamed = await client
      .patch(`/projects/${project.id}`)
      .headers(json)
      .loginAs(user)
      .json({ name: 'Storefront v2' })
    renamed.assertStatus(200)

    const detail = await client.get(`/agent-configs/${config.id}`).headers(json).loginAs(user)
    assert.deepEqual(detail.body().impact, {
      stale: true,
      changedSlots: [],
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
    const first = await generate(client, user, config.id)
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

    const newest = await generate(client, user, config.id)

    const ids = (await AgentConfigGeneration.query().where('agentConfigId', config.id)).map(
      (item) => item.id,
    )
    assert.lengthOf(ids, AGENT_GENERATIONS_KEPT)
    assert.notInclude(ids, first.id)
    assert.include(ids, newest.id)
  })
})

test.group('Agent configs - API tokens', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('a read-only key pulls the latest generation but cannot change rules', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const { config } = await createConfig(client, user, project.id)
    const generation = await generate(client, user, config.id)
    const secret = await createToken(client, user, ['read'])

    const latest = await client
      .get(`/agent-configs/${config.id}/generations/latest`)
      .headers(bearer(secret))
    latest.assertStatus(200)
    assert.equal(latest.body().generation.id, generation.id)

    const write = await client
      .put(`/agent-configs/${config.id}/ready-rules/typescript.any`)
      .headers(bearer(secret))
      .json({ rules: [{ rule: 'agree' }] })
    write.assertStatus(403)

    const regenerate = await client
      .post(`/agent-configs/${config.id}/generations`)
      .headers(bearer(secret))
    regenerate.assertStatus(403)
  })

  test('a read and write key manages the configuration', async ({ client }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const secret = await createToken(client, user, ['read', 'write'])

    const created = await client
      .post('/agent-configs')
      .headers(bearer(secret))
      .json({ name: 'CLI', projectId: project.id, targets: ['codex'] })
    created.assertStatus(201)
    const config = created.body().config as { id: number }
    const answered = await client
      .put(`/agent-configs/${config.id}/ready-rules/typescript.any`)
      .headers(bearer(secret))
      .json({ rules: [{ rule: 'disagree' }] })
    answered.assertStatus(200)
    const generated = await client
      .post(`/agent-configs/${config.id}/generations`)
      .headers(bearer(secret))
    generated.assertStatus(201)
  })

  test('older CLIs still pull the latest generation by project', async ({ client, assert }) => {
    const user = await makeUser()
    const project = await createProject(client, user)
    const bare = await createProject(client, user, { name: 'Bare' })
    const { config } = await createConfig(client, user, project.id)
    const generation = await generate(client, user, config.id)
    const secret = await createToken(client, user, ['read'])

    const latest = await client
      .get(`/projects/${project.id}/agent-config/generations/latest`)
      .headers(bearer(secret))
    latest.assertStatus(200)
    assert.equal(latest.body().generation.id, generation.id)

    const none = await client
      .get(`/projects/${bare.id}/agent-config/generations/latest`)
      .headers(bearer(secret))
    none.assertStatus(404)
    const intruder = await client
      .get(`/projects/${project.id}/agent-config/generations/latest`)
      .headers(json)
      .loginAs(await makeUser())
    intruder.assertStatus(404)
  })
})
