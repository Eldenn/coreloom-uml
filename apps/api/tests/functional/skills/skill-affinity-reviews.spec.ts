import db from '@adonisjs/lucid/services/db'
import { TARGETS } from '@coreloom-uml/catalog'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import { SkillStatus } from '#app/skills/constants/skill'
import CatalogSkill from '#app/skills/models/catalog-skill'
import {
  loadComputedAffinities,
  scoredRules,
  scoringHash,
} from '#app/skills/services/skill-rule-scores'
import User from '#app/users/models/user'
import env from '#start/env'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { withEmptySkillsCatalog } from '#tests/helpers/skills'

const json = { accept: 'application/json' }
const ADMIN = 'affinity-reviews-admin@example.com'
const PASSWORD = 'a-very-strong-passphrase'
const ON = { enabled: true, rollout: 100, rules: [] }

const unmarked = scoredRules().find((rule) => !rule.rule.noAutomaticSuggestion)
const marked = scoredRules().find((rule) => rule.rule.noAutomaticSuggestion)

function skill(slug: string, affinities: unknown[] = []) {
  return CatalogSkill.create({
    slug,
    name: slug,
    description: { en: `${slug} description` },
    url: `https://github.com/acme/skills/tree/${'a'.repeat(40)}/${slug}`,
    targets: [...TARGETS],
    affinities: affinities as never,
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

async function propose(skillId: number, slot: string, ruleId: string, cosine: number) {
  const [row] = await db
    .table('skill_affinity_reviews')
    .insert({ skill_id: skillId, slot, rule_id: ruleId, cosine, created_at: new Date() })
    .returning('id')
  return row.id as number
}

test.group('Skill affinity reviews', (group) => {
  group.each.setup(async () => {
    const rollback = await withEmptySkillsCatalog()
    await withDefaultFlags()
    return rollback
  })
  group.each.setup(() => {
    env.set('DEFAULT_ACCOUNT_EMAIL', ADMIN)
    env.set('DEFAULT_ACCOUNT_PASSWORD', 'the-default-passphrase')
    return () => {
      env.set('DEFAULT_ACCOUNT_EMAIL', '')
      env.set('DEFAULT_ACCOUNT_PASSWORD', '')
    }
  })

  test('the pairs shown by themselves come first, then the skills no written affinity ties', async ({
    client,
    assert,
  }) => {
    if (!unmarked || !marked) throw new Error('The catalog has marked and unmarked rules')
    const admin = await User.create({ email: ADMIN, password: PASSWORD })
    await updateFlag(FeatureFlagKey.ComputedSkillAffinities, ON, admin)
    const free = await skill('free')
    const tied = await skill('tied', [{ slot: unmarked.slot, values: [unmarked.rule.id] }])
    await propose(tied.id, marked.slot, marked.rule.id, 0.9)
    await propose(free.id, unmarked.slot, unmarked.rule.id, 0.66)
    await propose(tied.id, unmarked.slot, unmarked.rule.id, 0.7)
    await propose(free.id, marked.slot, marked.rule.id, 0.8)
    // A rule gone from the catalog is never listed.
    await propose(free.id, unmarked.slot, 'a-rule-gone', 0.95)

    const list = await client.get('/admin/skill-affinity-reviews').headers(json).loginAs(admin)
    list.assertStatus(200)
    const body = list.body()
    assert.deepEqual(
      body.data.map(
        (row: { skill: { slug: string }; ruleId: string; shownByItself: boolean }) =>
          `${row.skill.slug} ${row.ruleId} ${row.shownByItself}`,
      ),
      [
        `free ${unmarked.rule.id} true`,
        `tied ${unmarked.rule.id} true`,
        `free ${marked.rule.id} false`,
        `tied ${marked.rule.id} false`,
      ],
    )
    assert.equal(body.meta.total, 4)
    assert.include(body.data[2], { noAutomaticSuggestion: true, decision: null, decidedAt: null })
    assert.properties(body.data[0].group, ['en', 'fr'])
    assert.properties(body.data[0].rule, ['en', 'fr'])

    const ofTied = await client
      .get('/admin/skill-affinity-reviews')
      .qs({ skill: 'tied' })
      .headers(json)
      .loginAs(admin)
    assert.deepEqual(
      ofTied.body().data.map((row: { skill: { slug: string } }) => row.skill.slug),
      ['tied', 'tied'],
    )
  })

  test('a decision leaves the pending list, counts for the suggestions and can be undone', async ({
    client,
    assert,
  }) => {
    if (!unmarked) throw new Error('The catalog has unmarked rules')
    const admin = await User.create({ email: ADMIN, password: PASSWORD })
    await updateFlag(FeatureFlagKey.ComputedSkillAffinities, ON, admin)
    const free = await skill('free')
    const id = await propose(free.id, unmarked.slot, unmarked.rule.id, 0.55)
    await db
      .table('skill_scoring_state')
      .insert({ id: 1, hash: scoringHash(), scored_at: new Date() })

    const decide = (decision: unknown) =>
      client
        .patch(`/admin/skill-affinity-reviews/${id}`)
        .headers(json)
        .json({ decision })
        .loginAs(admin)
    ;(await decide('maybe')).assertStatus(422)
    const accepted = await decide('against')
    accepted.assertStatus(200)
    accepted.assertBody({ decision: 'against' })

    const pending = await client.get('/admin/skill-affinity-reviews').headers(json).loginAs(admin)
    assert.equal(pending.body().meta.total, 0)
    const decided = await client
      .get('/admin/skill-affinity-reviews')
      .qs({ status: 'decided' })
      .headers(json)
      .loginAs(admin)
    assert.equal(decided.body().data[0].decision, 'against')
    assert.isString(decided.body().data[0].decidedAt)
    const computed = await loadComputedAffinities()
    assert.equal(computed?.decisions.size, 1)

    ;(await decide(null)).assertStatus(200)
    const back = await client.get('/admin/skill-affinity-reviews').headers(json).loginAs(admin)
    assert.equal(back.body().data[0].decision, null)

    await client
      .patch('/admin/skill-affinity-reviews/999999')
      .headers(json)
      .json({ decision: 'accepted' })
      .loginAs(admin)
      .then((response) => response.assertStatus(404))
  })

  test('the flag off, or another account, reads a 404', async ({ client }) => {
    const admin = await User.create({ email: ADMIN, password: PASSWORD })
    const other = await User.create({ email: 'someone@example.com', password: PASSWORD })
    // `computed-skill-affinities` is off by default.
    ;(await client.get('/admin/skill-affinity-reviews').headers(json).loginAs(admin)).assertStatus(
      404,
    )
    await updateFlag(FeatureFlagKey.ComputedSkillAffinities, ON, admin)
    ;(await client.get('/admin/skill-affinity-reviews').headers(json).loginAs(other)).assertStatus(
      404,
    )
    ;(
      await client
        .patch('/admin/skill-affinity-reviews/1')
        .headers(json)
        .json({ decision: 'accepted' })
        .loginAs(other)
    ).assertStatus(404)
  })
})
