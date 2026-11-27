import { SKILLS } from '@coreloom-uml/catalog'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { SkillSourceKind, SkillStatus } from '#app/skills/constants/skill'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillSnapshot from '#app/skills/models/skill-snapshot'
import SkillSource from '#app/skills/models/skill-source'
import {
  refreshCatalog,
  setSkillBlocked,
  suggestableSkills,
  syncManualSkills,
} from '#app/skills/services/skills-catalog'
import { withEmptySkillsCatalog } from '#tests/helpers/skills'
import {
  fakeFetch,
  routes,
  SMITHERY_PAGE,
  smitheryPages,
  smitherySkill,
} from '#tests/unit/skills/skills-search-fixtures'

const network = () =>
  fakeFetch(routes({ 'https://skills.sh/api/search*': { body: { skills: [] } } }))
const MONDAY = DateTime.fromISO('2026-11-09T06:00:00.000Z')

test.group('Skills catalog', (group) => {
  group.each.setup(() => withEmptySkillsCatalog())

  test('copies the hand-picked skills once, whatever the number of runs', async ({ assert }) => {
    await syncManualSkills()
    await syncManualSkills()
    const rows = await CatalogSkill.query().orderBy('id')
    assert.deepEqual(
      rows.map((row) => row.slug),
      SKILLS.map((skill) => skill.id),
    )
    assert.isTrue(rows.every((row) => row.origin === 'manual' && row.eligible))
  })

  test('accumulates every skill found, with a snapshot per run', async ({ assert }) => {
    await syncManualSkills()
    const report = await refreshCatalog({ fetch: network().fn, githubToken: 'token', now: MONDAY })
    assert.deepEqual(report.added, ['danger', 'browser-tests', 'c4-docs', 'rare'])

    const found = await CatalogSkill.query().where('origin', 'search').orderBy('slug')
    assert.deepEqual(
      found.map((row) => [row.slug, row.eligible, row.ineligibleReason]),
      [
        ['browser-tests', true, null],
        ['c4-docs', true, null],
        ['danger', false, 'audit snyk: high'],
        ['rare', false, 'fewer than 500 installs'],
      ],
    )
    const c4 = found.find((row) => row.slug === 'c4-docs')
    assert.equal(c4?.license, 'MIT')
    assert.equal(c4?.checkedAt?.toISO(), MONDAY.toISO())
    assert.deepEqual(c4?.topics, ['architecture'])

    const nextWeek = MONDAY.plus({ weeks: 1 })
    const again = await refreshCatalog({ fetch: network().fn, githubToken: 'token', now: nextWeek })
    assert.deepEqual(again.added, [])
    assert.equal((await CatalogSkill.query().where('origin', 'search')).length, 4)
    const snapshots = await SkillSnapshot.query()
      .where('skillId', c4?.id ?? 0)
      .orderBy('takenAt')
    assert.deepEqual(
      snapshots.map((snapshot) => [snapshot.takenAt.toISO(), snapshot.installs, snapshot.eligible]),
      [
        [MONDAY.toISO(), 2500, true],
        [nextWeek.toISO(), 2500, true],
      ],
    )
    await c4?.refresh()
    assert.equal(c4?.firstSeenAt?.toISO(), MONDAY.toISO())
    assert.equal(c4?.lastSeenAt?.toISO(), nextWeek.toISO())
  })

  test('suggests the hand-picked skills, then the eligible found ones, never a blocked one', async ({
    assert,
  }) => {
    await syncManualSkills()
    await refreshCatalog({ fetch: network().fn, githubToken: 'token', now: MONDAY })
    const ids = (await suggestableSkills()).map((skill) => skill.id)
    assert.deepEqual(ids, [...SKILLS.map((skill) => skill.id), 'browser-tests', 'c4-docs'])
    const found = (await suggestableSkills()).find((skill) => skill.id === 'c4-docs')
    assert.deepEqual(found?.provenance, {
      registry: 'skills.sh',
      id: 'acme/skills/c4-docs',
      installs: 2500,
      audits: [
        { provider: 'gen', risk: 'safe', analyzedAt: '2026-11-02' },
        { provider: 'socket', risk: 'safe', analyzedAt: '2026-11-02' },
      ],
      checkedOn: '2026-11-09',
      contentSha: 'd'.repeat(40),
    })

    assert.isTrue(await setSkillBlocked('c4-docs', true, 'not for us'))
    assert.isTrue(await setSkillBlocked('brainstorming', true))
    assert.isFalse(await setSkillBlocked('unknown', true))
    const blocked = await CatalogSkill.findByOrFail('slug', 'c4-docs')
    assert.equal(blocked.status, SkillStatus.Blocked)
    assert.equal(blocked.statusReason, 'not for us')
    const after = (await suggestableSkills()).map((skill) => skill.id)
    assert.notInclude(after, 'c4-docs')
    assert.notInclude(after, 'brainstorming')

    // The search keeps cataloguing a blocked skill without suggesting it again.
    await refreshCatalog({
      fetch: network().fn,
      githubToken: 'token',
      now: MONDAY.plus({ days: 7 }),
    })
    await blocked.refresh()
    assert.equal(blocked.status, SkillStatus.Blocked)
    assert.notInclude(
      (await suggestableSkills()).map((skill) => skill.id),
      'c4-docs',
    )

    await setSkillBlocked('c4-docs', false)
    assert.include(
      (await suggestableSkills()).map((skill) => skill.id),
      'c4-docs',
    )
  })

  test('changes nothing when every search fails', async ({ assert }) => {
    await syncManualSkills()
    const failing = fakeFetch({ 'https://skills.sh/api/search*': { status: 503, body: {} } })
    await assert.rejects(
      () => refreshCatalog({ fetch: failing.fn, githubToken: 'token', now: MONDAY }),
      'Every source failed: nothing was changed',
    )
    assert.equal((await CatalogSkill.query().where('origin', 'search')).length, 0)
  })
})

/** A GitHub source the admin trusts: `acme/skills` (or one folder of it). */
function trustedSource(values: Partial<SkillSource> = {}) {
  return SkillSource.create({
    kind: SkillSourceKind.Github,
    owner: 'acme',
    repo: 'skills',
    ...values,
  })
}

async function listedBy(source: SkillSource) {
  await source.load('skills')
  return source.skills.map((skill) => skill.slug).sort()
}

test.group('Skills catalog with sources', (group) => {
  group.each.setup(() => withEmptySkillsCatalog())

  test('a run writes which source found which skill and how each source answered', async ({
    assert,
  }) => {
    const acme = await trustedSource()
    await refreshCatalog({ fetch: network().fn, githubToken: 'token', now: MONDAY })
    assert.deepEqual(await listedBy(acme), ['browser-tests', 'c4-docs', 'lint-rules'])
    const skillsSh = await SkillSource.findByOrFail('kind', SkillSourceKind.SkillsSh)
    for (const source of [acme, skillsSh]) {
      await source.refresh()
      assert.equal(source.lastRunAt?.toISO(), MONDAY.toISO())
      assert.isNull(source.lastError)
    }
    const lint = await CatalogSkill.findByOrFail('slug', 'lint-rules')
    assert.deepInclude(lint.serialize(), { eligible: true, installs: 0, source: 'acme/skills' })
  })

  test('a source that fails keeps what it listed and says why', async ({ assert }) => {
    const gone = await trustedSource({ owner: 'gone' })
    const skill = await CatalogSkill.create({
      slug: 'gone-skill',
      name: 'gone-skill (gone)',
      description: { en: '' },
      url: 'https://github.com/gone/skills',
      registryId: 'gone/skills/gone-skill',
      source: 'gone/skills',
      installs: 0,
      targets: [],
      affinities: [],
      topics: [],
      searchTopics: [],
      origin: 'search',
      status: SkillStatus.Active,
      eligible: false,
      ineligibleReason: 'not checked yet',
      audits: [],
    })
    await gone.related('skills').attach([skill.id])
    const failing = fakeFetch(
      routes({
        'https://skills.sh/api/search*': { body: { skills: [] } },
        'https://api.github.com/repos/gone/skills': { status: 500, body: {} },
      }),
    )
    await refreshCatalog({ fetch: failing.fn, githubToken: 'token', now: MONDAY })
    assert.deepEqual(await listedBy(gone), ['gone-skill'])
    await gone.refresh()
    assert.equal(gone.lastError, '500 from api.github.com')
    assert.equal(gone.lastRunAt?.toISO(), MONDAY.toISO())
  })

  test('a disabled GitHub source no longer vouches for its skills', async ({ assert }) => {
    const acme = await trustedSource()
    await refreshCatalog({ fetch: network().fn, githubToken: 'token', now: MONDAY })
    await acme.merge({ enabled: false }).save()
    await refreshCatalog({
      fetch: network().fn,
      githubToken: 'token',
      now: MONDAY.plus({ weeks: 1 }),
    })
    const lint = await CatalogSkill.findByOrFail('slug', 'lint-rules')
    assert.deepInclude(lint.serialize(), {
      eligible: false,
      ineligibleReason: 'fewer than 500 installs',
    })
  })

  test('a skill Smithery listed stays trusted on a run where Smithery is down', async ({
    assert,
  }) => {
    const smithery = await SkillSource.findByOrFail('kind', SkillSourceKind.Smithery)
    const listed = fakeFetch(
      routes({
        'https://skills.sh/api/search*': { body: { skills: [] } },
        ...smitheryPages([
          smitherySkill('https://github.com/acme/skills/tree/main/skills/lint-rules'),
        ]),
      }),
    )
    await refreshCatalog({ fetch: listed.fn, githubToken: 'token', now: MONDAY })
    assert.deepEqual(await listedBy(smithery), ['lint-rules'])
    const down = fakeFetch(
      routes({
        'https://skills.sh/api/search*': { body: { skills: [] } },
        [`${SMITHERY_PAGE}1`]: { status: 500, body: {} },
      }),
    )
    await refreshCatalog({ fetch: down.fn, githubToken: 'token', now: MONDAY.plus({ weeks: 1 }) })
    const lint = await CatalogSkill.findByOrFail('slug', 'lint-rules')
    assert.deepInclude(lint.serialize(), { eligible: true, installs: 0 })
    await smithery.refresh()
    assert.equal(smithery.lastError, '500 from api.smithery.ai')
  })

  test('a trusted skill is copied before more installed ones', async ({ assert }) => {
    await trustedSource({ path: 'skills/lint-rules' })
    const report = await refreshCatalog({
      fetch: fakeFetch(routes()).fn,
      githubToken: 'token',
      now: MONDAY,
    })
    // The fixtures hold no licence file, so every copy is refused, in the order they are tried.
    const tried = report.warnings.filter((line) => line.includes(': not copied, '))
    assert.isTrue(tried[0]?.startsWith('lint-rules:'), tried.join(' | '))
    assert.include(tried.join(' | '), 'browser-tests:')
  })

  test('a skill only a GitHub source vouches for is suggested with a github provenance', async ({
    assert,
  }) => {
    await trustedSource()
    await refreshCatalog({ fetch: network().fn, githubToken: 'token', now: MONDAY })
    await CatalogSkill.query()
      .where('slug', 'lint-rules')
      .update({ topics: JSON.stringify(['testing']) })
    const lint = (await suggestableSkills()).find((skill) => skill.id === 'lint-rules')
    assert.deepInclude(lint?.provenance, { registry: 'github', installs: 0, audits: [] })
  })
})
