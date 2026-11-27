import db from '@adonisjs/lucid/services/db'
import {
  COMPUTED_AFFINITY_THRESHOLD,
  findRuleGroup,
  RULE_PACKS,
  TARGETS,
} from '@coreloom-uml/catalog'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import { SkillStatus } from '#app/skills/constants/skill'
import { EMBEDDING_PURPOSES, SKILL_EMBEDDING_MODEL_KEY } from '#app/skills/constants/skill-topics'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillEmbedder from '#app/skills/services/skill-embedder'
import {
  loadComputedAffinities,
  retrievalSkillText,
  ruleText,
  scoredRules,
  scoreSkillRules,
} from '#app/skills/services/skill-rule-scores'
import { suggestableSkills } from '#app/skills/services/skills-catalog'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { withEmptySkillsCatalog } from '#tests/helpers/skills'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }

/** The words the fake model reads: one dimension each, plus one always set; normalized. */
const WORDS = ['test', 'route', 'secret', 'deploy']

/** A model that reads which of `WORDS` a text holds, and records each call's instruction. */
function fakeEmbedder() {
  const calls: { count: number; instruction: string | null }[] = []
  const embedder = new SkillEmbedder()
  embedder.embed = async (texts, instruction) => {
    calls.push({ count: texts.length, instruction })
    return texts.map((text) => {
      const vector = [...WORDS.map((word) => (text.toLowerCase().includes(word) ? 1 : 0)), 0.1]
      const norm = Math.hypot(...vector)
      return vector.map((value) => value / norm)
    })
  }
  embedder.close = async () => {}
  return { embedder, calls }
}

/** A skill a trusted source listed: eligible, pinned, with neither a tag nor an affinity. */
function trustedSkill(slug: string, description: string) {
  return CatalogSkill.create({
    slug,
    name: slug,
    description: { en: description },
    url: `https://github.com/acme/skills/tree/${'a'.repeat(40)}/${slug}`,
    targets: [...TARGETS],
    affinities: [],
    searchTopics: [],
    topics: [],
    origin: 'search',
    status: SkillStatus.Active,
    eligible: true,
    audits: [],
    contentSha: 'b'.repeat(40),
    checkedAt: DateTime.now(),
  })
}

test.group('Skill rule scores (computed affinities)', (group) => {
  group.each.setup(async () => {
    const rollback = await withEmptySkillsCatalog()
    await withDefaultFlags()
    return rollback
  })

  test('reads skills and rules as the study did, to the character', ({ assert }) => {
    // From infra/skill-tagger/study/js/embed-input.json, the instruction taken off.
    const routing = findRuleGroup(RULE_PACKS, 'frontend.routing')
    const typing = findRuleGroup(RULE_PACKS, 'typescript.any')
    const rule = (group: typeof routing, id: string) =>
      group?.rules.find((candidate) => candidate.id === id)
    assert.equal(
      routing && ruleText(routing, rule(routing, 'react-router') as never),
      'Routes are defined with: React Router\nRoutes are declared with React Router: add a route next to the existing ones, and navigate with `<Link>` or `useNavigate`, never `window.location` or a plain `<a>` to an internal page.',
    )
    assert.equal(
      typing && ruleText(typing, rule(typing, 'agree') as never),
      'I forbid `any` and type explicitly, even if it means writing more code.\nNever use `any`; prefer `unknown` with narrowing or an explicit type.',
    )
    assert.equal(
      retrievalSkillText({
        name: 'Test-driven development (Superpowers)',
        description: {
          en: 'Write the failing test first, watch it fail, then write the least code that passes.',
        },
      }),
      'Test-driven development (Superpowers): Write the failing test first, watch it fail, then write the least code that passes.',
    )
    // The `{value}` rules are never scored: their real text is the owner's.
    assert.isTrue(
      scoredRules().every((item) => !item.rule.lines.some((line) => line.includes('{value}'))),
    )
    assert.equal(COMPUTED_AFFINITY_THRESHOLD.model, SKILL_EMBEDDING_MODEL_KEY)
  })

  test('a new trusted skill without a tag or an affinity is scored at its first run', async ({
    assert,
  }) => {
    const tester = await trustedSkill('tester', 'Write a test first, then the code.')
    assert.include(
      (await suggestableSkills()).map((skill) => skill.id),
      'tester',
    )
    const { embedder, calls } = fakeEmbedder()

    const report = await scoreSkillRules({ embedder })
    assert.equal(report.embeddedSkills, 1)
    assert.equal(report.embeddedRules, scoredRules().length)
    // Skills as documents, with no instruction; rules as queries.
    assert.deepEqual(
      [...new Set(calls.map((call) => call.instruction))],
      [EMBEDDING_PURPOSES.retrieval, EMBEDDING_PURPOSES.rule],
    )
    const scores = await db.from('skill_rule_scores').where('skill_id', tester.id)
    assert.isAbove(scores.length, 0)
    assert.isTrue(scores.every((row) => row.cosine >= 0.5))
    assert.isAbove(report.pending, 0)

    // Nothing changed: nothing is read again.
    calls.length = 0
    const again = await scoreSkillRules({ embedder })
    assert.deepEqual([again.embeddedSkills, again.embeddedRules], [0, 0])
    assert.lengthOf(calls, 0)
  })

  test('keeps the decided pairs, replaces the pending ones and never proposes a written one', async ({
    assert,
  }) => {
    const tester = await trustedSkill('tester', 'Write a test first, then the code.')
    const { embedder } = fakeEmbedder()
    await scoreSkillRules({ embedder })
    const [first, second] = await db
      .from('skill_affinity_reviews')
      .where('skill_id', tester.id)
      .orderBy('cosine', 'desc')
      .orderBy('id')
    assert.exists(second)

    await db
      .from('skill_affinity_reviews')
      .where('id', first.id)
      .update({ decision: 'rejected', decided_at: new Date() })
    await tester.merge({ affinities: [{ slot: second.slot, values: [second.rule_id] }] }).save()
    await scoreSkillRules({ embedder })

    const rows = await db.from('skill_affinity_reviews').where('skill_id', tester.id)
    const decided = rows.find((row) => row.slot === first.slot && row.rule_id === first.rule_id)
    assert.equal(decided?.decision, 'rejected')
    assert.notExists(rows.find((row) => row.slot === second.slot && row.rule_id === second.rule_id))
  })

  test('two nearly identical skills are one, the first in catalog order kept', async ({
    assert,
  }) => {
    const first = await trustedSkill('deploy-a', 'Deploy a service.')
    const twin = await trustedSkill('deploy-b', 'Deploy it again.')
    await scoreSkillRules({ embedder: fakeEmbedder().embedder })
    assert.deepEqual(
      (await db.from('skill_near_duplicates')).map((row) => [row.skill_id, row.duplicate_of]),
      [[twin.id, first.id]],
    )
    const computed = await loadComputedAffinities()
    assert.equal(computed?.duplicateOf.get('deploy-b'), 'deploy-a')
  })

  test('computed affinities are read only once a run scored this model and catalog', async ({
    assert,
  }) => {
    await trustedSkill('tester', 'Write a test first, then the code.')
    assert.isNull(await loadComputedAffinities())
    await scoreSkillRules({ embedder: fakeEmbedder().embedder })
    const computed = await loadComputedAffinities()
    assert.exists(computed)
    await db.from('skill_scoring_state').update({ hash: 'another model or catalog' })
    assert.isNull(await loadComputedAffinities())
  })

  test('a generation suggests from computed affinities behind the flag only', async ({
    client,
    assert,
  }) => {
    await trustedSkill('tester', 'Write a test first, then the code.')
    await scoreSkillRules({ embedder: fakeEmbedder().embedder })
    const testing = findRuleGroup(RULE_PACKS, 'testing.levels')
    const unit = testing?.rules.find((rule) => rule.id === 'unit')
    assert.include(testing && unit ? ruleText(testing, unit).toLowerCase() : '', 'test')

    const user = await User.create({
      email: `computed-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'a-very-strong-passphrase',
    })
    const created = await client
      .post('/agent-configs')
      .headers(json)
      .loginAs(user)
      .json({ name: 'Shop', projectId: null, targets: ['claude-code'] })
    created.assertStatus(201)
    const id = created.body().config.id
    ;(
      await client
        .put(`/agent-configs/${id}/ready-rules/testing.levels`)
        .headers(json)
        .loginAs(user)
        .json({ rules: [{ rule: 'unit' }] })
    ).assertStatus(200)
    const suggested = async () => {
      const response = await client
        .post(`/agent-configs/${id}/generations`)
        .headers(json)
        .loginAs(user)
      response.assertStatus(201)
      return (response.body().generation.skills.compatible as { id: string }[]).map(
        (skill) => skill.id,
      )
    }

    assert.notInclude(await suggested(), 'tester')
    await updateFlag(FeatureFlagKey.ComputedSkillAffinities, ON, user)
    assert.include(await suggested(), 'tester')
    // A run of another model or catalog is not read: back to the written affinities.
    await db.from('skill_scoring_state').update({ hash: 'another model or catalog' })
    assert.notInclude(await suggested(), 'tester')
  })
})
