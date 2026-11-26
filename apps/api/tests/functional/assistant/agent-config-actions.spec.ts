import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { TARGETS } from '@coreloom-uml/catalog'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { type ModelStep, toolCallingModel } from '@coreloom-uml/llm/testing'
import type { ApiClient } from '@japa/api-client'
import { test } from '@japa/runner'
import AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigReadyRule from '#app/agent-configs/models/agent-config-ready-rule'
import AgentConfigSkill from '#app/agent-configs/models/agent-config-skill'
import { heldSkills } from '#app/agent-configs/services/agent-skills'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import Project from '#app/projects/models/project'
import { SkillStatus } from '#app/skills/constants/skill'
import { SkillVersionStatus } from '#app/skills/constants/skill-version'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillVersion from '#app/skills/models/skill-version'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { saveTestLlmKey } from '#tests/helpers/llm-key'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const chat = {
  provider: { kind: 'mistral', model: 'mistral-small-latest' },
  message: 'Change my conventions',
  locale: 'en',
  auto: true,
}

/** An account with the assistant's actions, a project and agent conventions in it. */
async function setup() {
  const user = await User.create({
    email: `agent-actions-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  await saveTestLlmKey(user)
  await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
  await updateFlag(FeatureFlagKey.AssistantActions, ON, user)
  const conversation = await AssistantConversation.create({ userId: user.id, title: '' })
  const project = await Project.create({ userId: user.id, name: 'Shop' })
  const config = await AgentConfig.create({
    userId: user.id,
    projectId: project.id,
    name: 'Shop rules',
    targets: ['generic'],
    revision: 1,
  })
  return { user, conversation, project, config }
}
type Fixture = Awaited<ReturnType<typeof setup>>

async function skill(slug: string, copy: SkillVersionStatus | null) {
  const row = await CatalogSkill.create({
    slug,
    name: slug,
    description: { en: `The ${slug} skill.` },
    url: `https://github.com/acme/skills/tree/${'a'.repeat(40)}/skills/${slug}`,
    targets: [...TARGETS],
    affinities: [],
    topics: [],
    origin: 'search',
    status: SkillStatus.Active,
    eligible: true,
    audits: [],
  })
  if (copy) {
    await SkillVersion.create({
      skillId: row.id,
      contentSha: 'b'.repeat(40),
      repository: 'acme/skills',
      commit: 'a'.repeat(40),
      folder: `skills/${slug}`,
      license: 'MIT',
      files: [],
      bytes: 0,
      storageKey: `skill-versions/${slug}/b.json.gz`,
      status: copy,
    })
  }
  return row
}

async function send(client: ApiClient, f: Fixture, steps: ModelStep[]) {
  const model = toolCallingModel(steps)
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
  const response = await client
    .post(`/assistant/conversations/${f.conversation.id}/messages`)
    .headers(json)
    .loginAs(f.user)
    .json(chat)
  response.assertStatus(200)
  const told = JSON.stringify(
    model.doGenerateCalls.flatMap((item) => item.prompt.filter((m) => m.role === 'tool')),
  )
  return { message: response.body().messages[1], told }
}

/** Proposes one call: the stored action and how to answer it. */
async function propose(client: ApiClient, f: Fixture, tool: string, input: object) {
  const { message, told } = await send(client, f, [
    { calls: [{ tool, input }] },
    { text: 'Proposed.' },
  ])
  const answer = (decision: 'accept' | 'reject') =>
    client
      .post(
        `/assistant/conversations/${f.conversation.id}/messages/${message.id}/actions/0/${decision}`,
      )
      .headers(json)
      .loginAs(f.user)
  return { action: message.actions?.[0], told, answer }
}

test.group('Assistant actions - agent conventions', (group) => {
  // One global transaction: no stored flag state and an empty skills catalog.
  group.each.setup(async () => {
    const rollback = await withDefaultFlags()
    await db.from('skill_snapshots').delete()
    await db.from('skills').delete()
    return rollback
  })
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('read_agent_config answers the targets, the notes and the skills held', async ({
    client,
    assert,
  }) => {
    const f = await setup()
    const held = await skill('tidy-tests', SkillVersionStatus.Approved)
    await AgentConfigSkill.create({ agentConfigId: f.config.id, skillId: held.id })
    await f.config.merge({ notes: 'Node 22.' }).save()
    const { told } = await send(client, f, [
      { calls: [{ tool: 'read_agent_config', input: { agentConfigId: f.config.id } }] },
      { text: 'Read.' },
    ])
    // The tool result is JSON inside the prompt's JSON: its quotes are escaped.
    assert.include(told, '\\"targets\\":[\\"generic\\"]')
    assert.include(told, 'Node 22.')
    assert.include(told, '\\"skills\\":[\\"tidy-tests\\"]')
  })

  test('update_agent_config: before → after on the card, then the conventions change', async ({
    client,
    assert,
  }) => {
    const f = await setup()
    const { action, answer } = await propose(client, f, 'update_agent_config', {
      agentConfigId: f.config.id,
      name: 'Storefront',
      notes: 'Node 22.',
      targets: ['generic', 'cursor'],
      projectId: null,
    })
    assert.equal(action.subject, 'Shop rules')
    assert.deepEqual(JSON.parse(action.before), {
      name: 'Shop rules',
      notes: null,
      targets: ['generic'],
      project: 'Shop',
      movesTo: null,
    })
    ;(await answer('accept')).assertStatus(200)
    await f.config.refresh()
    assert.equal(f.config.name, 'Storefront')
    assert.equal(f.config.notes, 'Node 22.')
    assert.deepEqual(f.config.targets, ['generic', 'cursor'])
    assert.isNull(f.config.projectId)
    assert.equal(f.config.revision, 2)
  })

  test('update_agent_config into a project that holds conventions is not proposed', async ({
    client,
    assert,
  }) => {
    const f = await setup()
    const other = await AgentConfig.create({
      userId: f.user.id,
      projectId: null,
      name: 'Loose',
      targets: ['generic'],
      revision: 1,
    })
    const { action, told } = await propose(client, f, 'update_agent_config', {
      agentConfigId: other.id,
      projectId: f.project.id,
    })
    assert.isUndefined(action)
    assert.include(told, 'already has an agent configuration')
  })

  test('remove_ready_rule: one rule, or the whole slot; a rule not held is not proposed', async ({
    client,
    assert,
  }) => {
    const f = await setup()
    await AgentConfigReadyRule.create({
      agentConfigId: f.config.id,
      slot: 'tooling.package-manager',
      rule: 'pnpm',
      value: null,
    })
    const absent = await propose(client, f, 'remove_ready_rule', {
      agentConfigId: f.config.id,
      slot: 'react.styling',
    })
    assert.isUndefined(absent.action)
    assert.include(absent.told, 'do not hold')

    const { action, answer } = await propose(client, f, 'remove_ready_rule', {
      agentConfigId: f.config.id,
      slot: 'tooling.package-manager',
      rule: 'pnpm',
    })
    assert.isTrue(action.destructive)
    ;(await answer('accept')).assertStatus(200)
    assert.lengthOf(await AgentConfigReadyRule.query().where('agentConfigId', f.config.id), 0)
  })

  test('change_skills adds a skill with an approved copy and removes one held', async ({
    client,
    assert,
  }) => {
    const f = await setup()
    const old = await skill('old-one', SkillVersionStatus.Approved)
    await skill('new-one', SkillVersionStatus.Approved)
    await skill('pending-one', SkillVersionStatus.Pending)
    await AgentConfigSkill.create({ agentConfigId: f.config.id, skillId: old.id })

    const refused = await propose(client, f, 'change_skills', {
      agentConfigId: f.config.id,
      add: ['pending-one'],
    })
    assert.isUndefined(refused.action)
    assert.include(refused.told, 'approved copy')

    const { action, answer } = await propose(client, f, 'change_skills', {
      agentConfigId: f.config.id,
      add: ['new-one'],
      remove: ['old-one'],
    })
    assert.isString(action.before)
    ;(await answer('accept')).assertStatus(200)
    assert.deepEqual((await heldSkills(f.config.id)).held, ['new-one'])
    await f.config.refresh()
    assert.equal(f.config.revision, 2)
  })

  test('change_skills on a set changed since stays pending with a 409', async ({
    client,
    assert,
  }) => {
    const f = await setup()
    await skill('new-one', SkillVersionStatus.Approved)
    const other = await skill('other', SkillVersionStatus.Approved)
    const { answer } = await propose(client, f, 'change_skills', {
      agentConfigId: f.config.id,
      add: ['new-one'],
    })
    await AgentConfigSkill.create({ agentConfigId: f.config.id, skillId: other.id })
    const accepted = await answer('accept')
    accepted.assertStatus(409)
    assert.deepEqual((await heldSkills(f.config.id)).held, ['other'])
  })

  test('merge_agent_configs: the conflicts are told, then a merge with choices is made', async ({
    client,
    assert,
  }) => {
    const f = await setup()
    const other = await AgentConfig.create({
      userId: f.user.id,
      projectId: null,
      name: 'Front',
      targets: ['cursor'],
      revision: 1,
    })
    for (const [agentConfigId, rule] of [
      [f.config.id, 'pnpm'],
      [other.id, 'npm'],
    ] as const) {
      await AgentConfigReadyRule.create({
        agentConfigId,
        slot: 'tooling.package-manager',
        rule,
        value: null,
      })
    }
    const sourceIds = [f.config.id, other.id]
    const conflicting = await propose(client, f, 'merge_agent_configs', {
      name: 'Merged',
      sourceIds,
    })
    assert.isUndefined(conflicting.action)
    assert.include(conflicting.told, 'tooling.package-manager')

    const { action, answer } = await propose(client, f, 'merge_agent_configs', {
      name: 'Merged',
      sourceIds,
      choices: { readyRules: [{ slot: 'tooling.package-manager', sourceId: other.id }] },
    })
    assert.equal(action.subject, 'Shop rules, Front')
    const accepted = await answer('accept')
    accepted.assertStatus(200)
    const merged = await AgentConfig.findOrFail(accepted.body().action.result.id)
    assert.equal(merged.name, 'Merged')
    const ready = await AgentConfigReadyRule.query().where('agentConfigId', merged.id)
    assert.deepEqual(
      ready.map((row) => row.rule),
      ['npm'],
    )
  })

  test('delete_agent_config counts the skills it holds', async ({ client, assert }) => {
    const f = await setup()
    const held = await skill('tidy-tests', SkillVersionStatus.Approved)
    await AgentConfigSkill.create({ agentConfigId: f.config.id, skillId: held.id })
    const { action } = await propose(client, f, 'delete_agent_config', {
      agentConfigId: f.config.id,
    })
    assert.equal(action.impact.skills, 1)
  })
})
