import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import { SkillOrigin, TARGETS } from '@coreloom-uml/catalog'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import type { CreatedApiTokenOutput } from '#app/api-tokens/validators/api-tokens-output'
import { SkillStatus } from '#app/skills/constants/skill'
import CatalogSkill, { type SkillAudit } from '#app/skills/models/catalog-skill'
import SkillSnapshot from '#app/skills/models/skill-snapshot'
import SkillsEvents from '#app/skills/services/skills-events'
import type {
  SkillDetailOutput,
  SkillsCatalogEvent,
  SkillsListOutput,
  SkillsStatsOutput,
} from '#app/skills/validators/skills-output'
import User from '#app/users/models/user'

const json = { accept: 'application/json' }
const LAST_WEEK = DateTime.fromISO('2026-11-02T06:00:00.000Z')
const THIS_WEEK = DateTime.fromISO('2026-11-09T06:00:00.000Z')
const SHA = 'a'.repeat(40)

function makeUser() {
  return User.create({
    email: `skills-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

const audit = (risk: SkillAudit['risk']): SkillAudit => ({
  provider: 'snyk',
  risk,
  analyzedAt: '2026-11-01',
})

type Seed = {
  slug: string
  installs: number | null
  topics?: string[]
  diagramKinds?: string[]
  audits?: SkillAudit[]
  origin?: SkillOrigin
  status?: SkillStatus
  eligible?: boolean
  ineligibleReason?: string
  /** Installs at each run that returned it: [last week, this week]; `null` = not returned. */
  runs?: [number | null, number | null]
}

async function seed(entry: Seed) {
  const firstRun = entry.runs?.[0] !== null && entry.runs?.[0] !== undefined ? LAST_WEEK : THIS_WEEK
  const seenThisWeek = entry.runs ? entry.runs[1] !== null : false
  const skill = await CatalogSkill.create({
    slug: entry.slug,
    name: entry.slug.replace(/-/g, ' '),
    description: { en: `About ${entry.slug}` },
    url: `https://github.com/acme/skills/tree/${SHA}/${entry.slug}`,
    targets: [...TARGETS],
    affinities: entry.diagramKinds
      ? [{ diagramKinds: entry.diagramKinds as never }]
      : [{ slot: 'testing.levels', values: ['end-to-end'] }],
    topics: entry.topics ?? [],
    origin: entry.origin ?? SkillOrigin.Search,
    status: entry.status ?? SkillStatus.Active,
    eligible: entry.eligible ?? true,
    ineligibleReason: entry.ineligibleReason ?? null,
    registryId: entry.origin === SkillOrigin.Manual ? null : `acme/skills/${entry.slug}`,
    source: entry.origin === SkillOrigin.Manual ? null : 'acme/skills',
    installs: entry.installs,
    audits: entry.audits ?? [audit('safe')],
    license: 'MIT',
    contentSha: SHA,
    firstSeenAt: entry.runs ? firstRun : null,
    lastSeenAt: entry.runs ? (seenThisWeek ? THIS_WEEK : LAST_WEEK) : null,
    checkedAt: entry.runs ? firstRun : null,
  })
  const runs: [DateTime, number | null][] = entry.runs
    ? [
        [LAST_WEEK, entry.runs[0]],
        [THIS_WEEK, entry.runs[1]],
      ]
    : []
  for (const [takenAt, installs] of runs) {
    if (installs === null) continue
    await SkillSnapshot.create({
      skillId: skill.id,
      takenAt,
      installs,
      audits: skill.audits,
      eligible: skill.eligible,
      ineligibleReason: skill.ineligibleReason,
    })
  }
  return skill
}

/** A small catalog: two runs, a week apart. */
async function seedCatalog() {
  await seed({
    slug: 'c4-docs',
    installs: 1200,
    topics: ['architecture'],
    diagramKinds: ['c4'],
    runs: [1000, 1200],
  })
  await seed({
    slug: 'react-tests',
    installs: 9000,
    topics: ['react', 'testing'],
    runs: [8950, 9000],
  })
  await seed({
    slug: 'risky-skill',
    installs: 4000,
    topics: ['testing'],
    audits: [audit('safe'), audit('high')],
    eligible: false,
    ineligibleReason: 'audit snyk: high',
    runs: [null, 4000],
  })
  await seed({
    slug: 'blocked-skill',
    installs: 700,
    topics: ['architecture'],
    diagramKinds: ['class', 'sequence'],
    status: SkillStatus.Blocked,
    runs: [700, null],
  })
  await seed({
    slug: 'hand-picked',
    installs: null,
    origin: SkillOrigin.Manual,
    audits: [],
    diagramKinds: ['class'],
  })
}

test.group('Skills screen - catalog', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('needs a session or an API token', async ({ client }) => {
    const response = await client.get('/skills').headers(json)
    response.assertStatus(401)
  })

  test('lists the catalog by installs, with each skill’s state and worst audit', async ({
    client,
    assert,
  }) => {
    await seedCatalog()
    const response = await client
      .get('/skills')
      .headers(json)
      .loginAs(await makeUser())
    response.assertStatus(200)
    const body = response.body() as SkillsListOutput

    assert.deepEqual(
      body.data.map((skill) => [skill.slug, skill.state, skill.risk, skill.installsDelta]),
      [
        ['react-tests', 'suggested', 'safe', 50],
        ['risky-skill', 'catalogued', 'high', null],
        ['c4-docs', 'suggested', 'safe', 200],
        ['blocked-skill', 'blocked', 'safe', null],
        ['hand-picked', 'suggested', 'none', null],
      ],
    )
    assert.deepEqual(body.meta, { page: 1, perPage: 20, total: 5, lastPage: 1 })
    assert.deepEqual(body.data[2].diagramKinds, ['c4'])
    assert.deepEqual(body.facets.state, { suggested: 3, catalogued: 1, blocked: 1 })
    assert.deepEqual(body.facets.topic, { architecture: 2, react: 1, testing: 2 })
    assert.deepEqual(body.facets.diagramKind, { c4: 1, class: 2, sequence: 1 })
    assert.deepEqual(body.facets.risk, { safe: 3, high: 1, none: 1 })
  })

  test('filters, and counts each filter’s values under the other filters', async ({
    client,
    assert,
  }) => {
    await seedCatalog()
    const user = await makeUser()

    const testing = await client
      .get('/skills')
      .qs({ topic: 'testing', state: 'suggested' })
      .headers(json)
      .loginAs(user)
    const body = testing.body() as SkillsListOutput
    assert.deepEqual(
      body.data.map((skill) => skill.slug),
      ['react-tests'],
    )
    // Topic counts ignore the topic filter but keep the state one, and the other way round.
    assert.deepEqual(body.facets.topic, { architecture: 1, react: 1, testing: 1 })
    assert.deepEqual(body.facets.state, { suggested: 1, catalogued: 1 })

    const kinds = await client
      .get('/skills?diagramKind=c4&diagramKind=sequence')
      .headers(json)
      .loginAs(user)
    assert.deepEqual(
      (kinds.body() as SkillsListOutput).data.map((skill) => skill.slug),
      ['c4-docs', 'blocked-skill'],
    )

    const risky = await client.get('/skills').qs({ risk: 'high' }).headers(json).loginAs(user)
    assert.deepEqual(
      (risky.body() as SkillsListOutput).data.map((skill) => skill.slug),
      ['risky-skill'],
    )

    const search = await client.get('/skills').qs({ search: 'C4 d' }).headers(json).loginAs(user)
    assert.deepEqual(
      (search.body() as SkillsListOutput).data.map((skill) => skill.slug),
      ['c4-docs'],
    )
  })

  test('sorts by installs gained, first seen or name', async ({ client, assert }) => {
    await seedCatalog()
    const user = await makeUser()
    const slugs = async (sort: string) => {
      const response = await client.get('/skills').qs({ sort }).headers(json).loginAs(user)
      response.assertStatus(200)
      return (response.body() as SkillsListOutput).data.map((skill) => skill.slug)
    }

    assert.deepEqual((await slugs('trending')).slice(0, 2), ['c4-docs', 'react-tests'])
    assert.equal((await slugs('newest'))[0], 'risky-skill')
    assert.deepEqual(await slugs('name'), [
      'blocked-skill',
      'c4-docs',
      'hand-picked',
      'react-tests',
      'risky-skill',
    ])
  })

  test('refuses an unknown filter value', async ({ client }) => {
    const response = await client
      .get('/skills')
      .qs({ topic: 'cooking' })
      .headers(json)
      .loginAs(await makeUser())
    response.assertStatus(422)
  })

  test('shows one skill with its history and why it is not suggested', async ({
    client,
    assert,
  }) => {
    await seedCatalog()
    const user = await makeUser()

    const risky = await client.get('/skills/risky-skill').headers(json).loginAs(user)
    risky.assertStatus(200)
    const { skill } = risky.body() as { skill: SkillDetailOutput }
    assert.equal(skill.registryUrl, 'https://skills.sh/acme/skills/risky-skill')
    assert.equal(skill.reason, 'audit snyk: high')
    assert.deepEqual(skill.history, [
      { takenAt: THIS_WEEK.toUTC().toISO(), installs: 4000, eligible: false },
    ])

    const c4 = await client.get('/skills/c4-docs').headers(json).loginAs(user)
    assert.deepEqual(
      (c4.body() as { skill: SkillDetailOutput }).skill.history.map((point) => point.installs),
      [1000, 1200],
    )

    const missing = await client.get('/skills/nothing-here').headers(json).loginAs(user)
    missing.assertStatus(404)
  })

  test('sums up the catalog and its runs for the charts', async ({ client, assert }) => {
    await seedCatalog()
    const response = await client
      .get('/skills/stats')
      .headers(json)
      .loginAs(await makeUser())
    response.assertStatus(200)
    const stats = response.body() as SkillsStatsOutput

    assert.deepEqual(stats.totals, {
      skills: 5,
      suggested: 3,
      catalogued: 1,
      blocked: 1,
      installs: 14_900,
    })
    assert.equal(stats.lastRunAt, THIS_WEEK.toUTC().toISO())
    assert.deepEqual(stats.runs, [
      {
        takenAt: LAST_WEEK.toUTC().toISO(),
        skills: 3,
        installs: 10_650,
        newSkills: 3,
        eligible: 3,
      },
      {
        takenAt: THIS_WEEK.toUTC().toISO(),
        skills: 3,
        installs: 14_200,
        newSkills: 1,
        eligible: 2,
      },
    ])
    assert.deepEqual(stats.risks, [
      { risk: 'high', count: 1 },
      { risk: 'safe', count: 3 },
      { risk: 'none', count: 1 },
    ])
    assert.deepEqual(stats.topics, [
      { topic: 'architecture', count: 2 },
      { topic: 'testing', count: 2 },
      { topic: 'react', count: 1 },
    ])
    assert.deepEqual(
      stats.trending.map((skill) => [skill.slug, skill.installsDelta]),
      [
        ['c4-docs', 200],
        ['react-tests', 50],
      ],
    )
  })

  test('reads with a read-only API token', async ({ client, assert }) => {
    await seedCatalog()
    const user = await makeUser()
    const created = await client
      .post('/account/api-tokens')
      .headers(json)
      .loginAs(user)
      .json({ name: 'Reader', abilities: ['read'], expiresInDays: 30 })
    const { secret } = created.body() as CreatedApiTokenOutput

    const response = await client
      .get('/skills/stats')
      .headers({ ...json, authorization: `Bearer ${secret}` })
    response.assertStatus(200)
    assert.equal((response.body() as SkillsStatsOutput).totals.skills, 5)
  })
})

/** Delivers in-process instead of through Redis. */
class LocalSkillsEvents extends SkillsEvents {
  protected override async send(message: string) {
    this.deliver(JSON.parse(message) as SkillsCatalogEvent)
  }

  protected override subscribe() {}
}

/** Reads a Server-Sent Events body until `count` blocks (comments included) arrived. */
async function readBlocks(reader: ReadableStreamDefaultReader<Uint8Array>, count: number) {
  const decoder = new TextDecoder()
  let text = ''
  while (text.split('\n\n').length - 1 < count) {
    const { value, done } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }
  return text.split('\n\n').filter(Boolean)
}

test.group('Skills screen - live updates', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => app.container.restore(SkillsEvents))

  test('streams catalog changes to open screens', async ({ client, assert }) => {
    const events = new LocalSkillsEvents()
    app.container.swap(SkillsEvents, () => events)
    const user = await makeUser()
    const created = await client
      .post('/account/api-tokens')
      .headers(json)
      .loginAs(user)
      .json({ name: 'Reader', abilities: ['read'], expiresInDays: 30 })
    const { secret } = created.body() as CreatedApiTokenOutput

    const abort = new AbortController()
    const response = await fetch(`http://${process.env.HOST}:${process.env.PORT}/skills/events`, {
      headers: { authorization: `Bearer ${secret}` },
      signal: abort.signal,
    })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /^text\/event-stream/)
    const reader = (response.body as ReadableStream<Uint8Array>).getReader()

    assert.deepEqual(await readBlocks(reader, 2), ['retry: 10000', ': connected'])
    assert.equal(events.listenerCount, 1)

    await events.publish('catalog.refreshed')
    const [block] = await readBlocks(reader, 1)
    const [eventLine, dataLine] = block.split('\n')
    assert.equal(eventLine, 'event: catalog.refreshed')
    assert.equal(
      (JSON.parse(dataLine.replace(/^data: /, '')) as SkillsCatalogEvent).type,
      'catalog.refreshed',
    )

    abort.abort()
    await reader.cancel().catch(() => {})
    // The server lets go of the stream once the browser leaves.
    for (let attempt = 0; attempt < 50 && events.listenerCount > 0; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    assert.equal(events.listenerCount, 0)
  })

  test('needs a session or an API token', async ({ client }) => {
    const response = await client.get('/skills/events').headers(json)
    response.assertStatus(401)
  })
})
