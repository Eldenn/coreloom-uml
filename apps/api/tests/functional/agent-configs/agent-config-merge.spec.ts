import testUtils from '@adonisjs/core/services/test_utils'
import type { Role } from '@coreloom-uml/catalog'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import { AGENT_RULES_MAX, AGENT_SKILLS_MAX } from '#app/agent-configs/constants/agent-config'
import AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigRule from '#app/agent-configs/models/agent-config-rule'
import AgentConfigSkill from '#app/agent-configs/models/agent-config-skill'
import { type MergeSource, mergeSources } from '#app/agent-configs/services/agent-config-merge'
import { SkillStatus } from '#app/skills/constants/skill'
import CatalogSkill from '#app/skills/models/catalog-skill'
import User from '#app/users/models/user'

const json = { accept: 'application/json' }

type Client = TestContext['client']

function makeUser() {
  return User.create({
    email: `agent-merge-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

/** A configuration outside any project, with ready-made rules (`[slot, rule]`) and own rules. */
async function createConfig(
  client: Client,
  user: User,
  body: { name: string; targets: string[]; notes?: string },
  ready: [string, string][] = [],
  rules: string[] = [],
) {
  const created = await client.post('/agent-configs').headers(json).loginAs(user).json(body)
  created.assertStatus(201)
  const id = created.body().config.id as number
  for (const [slot, rule] of ready) {
    const response = await client
      .put(`/agent-configs/${id}/ready-rules/${slot}`)
      .headers(json)
      .loginAs(user)
      .json({ rules: [{ rule }] })
    response.assertStatus(200)
  }
  for (const text of rules) {
    const response = await client
      .post(`/agent-configs/${id}/rules`)
      .headers(json)
      .loginAs(user)
      .json({ section: 'Tooling', text })
    response.assertStatus(201)
  }
  return id
}

function merge(client: Client, user: User, body: object) {
  return client.post('/agent-configs/merge').headers(json).loginAs(user).json(body)
}

test.group('Agent configs - merge', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('answers the conflicts, then creates the merge with the choices and keeps the sources', async ({
    client,
    assert,
  }) => {
    const user = await makeUser()
    const api = await createConfig(
      client,
      user,
      { name: 'API', targets: ['cursor'], notes: 'Node 22.' },
      [
        ['tooling.package-manager', 'pnpm'],
        ['typescript.any', 'agree'],
      ],
      ['Shared rule', 'API rule'],
    )
    const front = await createConfig(
      client,
      user,
      { name: 'Front', targets: ['claude-code'], notes: 'Node 22.' },
      [
        ['tooling.package-manager', 'npm'],
        ['react.styling', 'tailwind'],
      ],
      ['Shared rule', 'Front rule'],
    )
    const body = { name: 'Merged', sourceIds: [api, front] }

    const first = await merge(client, user, body)
    first.assertStatus(200)
    assert.deepEqual(first.body().conflicts, {
      readyRules: [
        {
          slot: 'tooling.package-manager',
          options: [
            { sourceId: api, rules: [{ rule: 'pnpm', value: null }] },
            { sourceId: front, rules: [{ rule: 'npm', value: null }] },
          ],
        },
      ],
      roles: [],
    })
    assert.lengthOf(await AgentConfig.query().where('userId', user.id), 2)

    // A choice naming a source that holds nothing of the conflict settles nothing.
    const stale = await merge(client, user, {
      ...body,
      choices: { readyRules: [{ slot: 'tooling.package-manager', sourceId: 999_999 }] },
    })
    stale.assertStatus(200)

    const second = await merge(client, user, {
      ...body,
      choices: { readyRules: [{ slot: 'tooling.package-manager', sourceId: front }] },
    })
    second.assertStatus(201)
    const { config } = second.body()
    assert.equal(config.name, 'Merged')
    assert.isNull(config.projectId)
    assert.isNull(config.latestGeneration)
    assert.sameMembers(config.targets, ['claude-code', 'cursor'])
    assert.equal(config.notes, 'Node 22.')
    assert.sameDeepMembers(config.readyRules, [
      { slot: 'tooling.package-manager', rule: 'npm', value: null },
      { slot: 'typescript.any', rule: 'agree', value: null },
      { slot: 'react.styling', rule: 'tailwind', value: null },
    ])
    assert.deepEqual(
      config.rules.map((rule: { text: string; position: number }) => [rule.text, rule.position]),
      [
        ['Shared rule', 0],
        ['API rule', 1],
        ['Front rule', 2],
      ],
    )

    const source = await client.get(`/agent-configs/${api}`).headers(json).loginAs(user)
    assert.deepInclude(source.body().config.readyRules, {
      slot: 'tooling.package-manager',
      rule: 'pnpm',
      value: null,
    })
    assert.lengthOf(source.body().config.rules, 2)
  })

  test("refuses another account's configuration, and a merge past the rules limit", async ({
    client,
  }) => {
    const user = await makeUser()
    const mine = await createConfig(client, user, { name: 'Mine', targets: ['cursor'] })
    const other = await createConfig(client, user, { name: 'Other', targets: ['cursor'] })
    const theirs = await createConfig(client, await makeUser(), {
      name: 'Theirs',
      targets: ['cursor'],
    })

    const foreign = await merge(client, user, { name: 'Merged', sourceIds: [mine, theirs] })
    foreign.assertStatus(404)
    ;(await merge(client, user, { name: 'Merged', sourceIds: [mine] })).assertStatus(422)

    for (const [agentConfigId, prefix] of [
      [mine, 'a'],
      [other, 'b'],
    ] as const) {
      await AgentConfigRule.createMany(
        Array.from({ length: AGENT_RULES_MAX }, (_, position) => ({
          agentConfigId,
          section: 'Tooling',
          text: `${prefix}${position}`,
          source: 'manual' as const,
          position,
        })),
      )
    }
    const tooMany = await merge(client, user, { name: 'Merged', sourceIds: [mine, other] })
    tooMany.assertStatus(422)
  })

  test('two different roles with one slug are a conflict, the same role twice is not', ({
    assert,
  }) => {
    const role = (name: string): Role => ({
      slug: 'reviewer',
      name,
      description: 'Reviews changes',
      mission: 'Review.',
      rights: [],
      scope: [],
      forbidden: [],
      done: { commands: [], text: null },
      escalation: null,
      source: null,
    })
    const source = (id: number, name: string): MergeSource => ({
      id,
      targets: ['cursor'],
      notes: null,
      readyRules: [],
      rules: [],
      roles: [role(name)],
      skillIds: [],
    })

    const same = mergeSources([source(1, 'Reviewer'), source(2, 'Reviewer')])
    assert.lengthOf('merged' in same ? same.merged.roles : [], 1)

    const sources = [source(1, 'Reviewer'), source(2, 'Strict reviewer')]
    assert.deepEqual(mergeSources(sources), {
      conflicts: {
        readyRules: [],
        roles: [
          {
            slug: 'reviewer',
            options: [
              { sourceId: 1, name: 'Reviewer', description: 'Reviews changes' },
              { sourceId: 2, name: 'Strict reviewer', description: 'Reviews changes' },
            ],
          },
        ],
      },
    })
    const chosen = mergeSources(sources, { roles: [{ slug: 'reviewer', sourceId: 2 }] })
    assert.equal('merged' in chosen && chosen.merged.roles[0]?.name, 'Strict reviewer')
  })
  test('adds up the held skills, each once, within the limit', async ({ client, assert }) => {
    const user = await makeUser()
    const first = await createConfig(client, user, { name: 'First', targets: ['cursor'] })
    const second = await createConfig(client, user, { name: 'Second', targets: ['cursor'] })
    const skills = await Promise.all(
      ['merge-a', 'merge-b', 'merge-c'].map((slug) =>
        CatalogSkill.create({
          slug,
          name: slug,
          description: { en: `The ${slug} skill.` },
          url: `https://github.com/acme/skills/tree/${'a'.repeat(40)}/skills/${slug}`,
          targets: [],
          affinities: [],
          topics: [],
          origin: 'search',
          status: SkillStatus.Active,
          eligible: true,
          audits: [],
        }),
      ),
    )
    const [a, b, c] = skills.map((skill) => skill.id)
    await AgentConfigSkill.createMany([
      { agentConfigId: first, skillId: a },
      { agentConfigId: first, skillId: b },
      { agentConfigId: second, skillId: b },
      { agentConfigId: second, skillId: c },
    ])

    const merged = await merge(client, user, { name: 'Merged', sourceIds: [first, second] })
    merged.assertStatus(201)
    assert.deepEqual(
      merged.body().config.skills.map((skill: { slug: string }) => skill.slug),
      ['merge-a', 'merge-b', 'merge-c'],
    )

    const source = (id: number, skillIds: number[]): MergeSource => ({
      id,
      targets: ['cursor'],
      notes: null,
      readyRules: [],
      rules: [],
      roles: [],
      skillIds,
    })
    const half = Array.from({ length: AGENT_SKILLS_MAX }, (_, index) => index)
    const tooMany = mergeSources([
      source(1, half),
      source(
        2,
        half.map((id) => id + 1),
      ),
    ])
    assert.property(tooMany, 'refused')
  })
})
