import drive from '@adonisjs/drive/services/main'
import { TARGETS } from '@coreloom-uml/catalog'
import { test } from '@japa/runner'
import CaptureSkillVersionJob from '#app/jobs/capture-skill-version_job'
import RefreshSkillsJob from '#app/jobs/refresh-skills_job'
import ScanSkillVersionJob from '#app/jobs/scan-skill-version_job'
import { SkillStatus } from '#app/skills/constants/skill'
import { SkillVersionStatus } from '#app/skills/constants/skill-version'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillVersion from '#app/skills/models/skill-version'
import { syncSkill } from '#app/skills/services/skills-catalog'
import { releaseSkillsRefresh } from '#app/skills/services/skills-refresh-lock'
import User from '#app/users/models/user'
import env from '#start/env'
import { CLEAN_SCAN, withEmptySkillsCatalog } from '#tests/helpers/skills'
import { FOLDER, fakeFetch, routes, SHA, skillMd } from '#tests/unit/skills/skills-search-fixtures'

const json = { accept: 'application/json' }
const ADMIN = 'skills-admin@example.com'
const PASSWORD = 'a-very-strong-passphrase'

/** A skill a search found and no run has checked on GitHub yet: catalogued, never suggested. */
function uncheckedSkill() {
  return CatalogSkill.create({
    slug: 'browser-tests',
    name: 'browser-tests (acme)',
    description: { en: '' },
    url: 'https://skills.sh/acme/skills/browser-tests',
    registryId: 'acme/skills/browser-tests',
    source: 'acme/skills',
    installs: 4000,
    targets: [...TARGETS],
    affinities: [{ slot: 'testing.levels', values: ['e2e'] }],
    topics: ['testing'],
    searchTopics: ['testing'],
    origin: 'search',
    status: SkillStatus.Active,
    eligible: false,
    ineligibleReason: 'not checked on GitHub yet',
    audits: [],
  })
}

function copyOf(skill: CatalogSkill, values: Partial<SkillVersion> = {}) {
  return SkillVersion.create({
    skillId: skill.id,
    contentSha: FOLDER,
    repository: 'acme/skills',
    commit: SHA,
    folder: 'skills/browser-tests',
    license: 'MIT',
    files: [{ path: 'SKILL.md', size: 10, executable: false }],
    bytes: 10,
    storageKey: `skill-versions/browser-tests/${FOLDER}.json.gz`,
    scan: null,
    status: SkillVersionStatus.Pending,
    ...values,
  })
}

/** Replaces a job's `dispatch` until the returned function is called; `sent` holds what it got. */
function stubDispatch(job: object) {
  const sent: unknown[] = []
  const own = Object.getOwnPropertyDescriptor(job, 'dispatch')
  Object.defineProperty(job, 'dispatch', {
    configurable: true,
    writable: true,
    value: async (data: unknown) => {
      sent.push(data)
    },
  })
  const restore = () => {
    if (own) Object.defineProperty(job, 'dispatch', own)
    else delete (job as Record<string, unknown>).dispatch
  }
  return { sent, restore }
}

test.group('Skills admin actions', (group) => {
  group.each.setup(() => withEmptySkillsCatalog())
  group.each.setup(() => {
    drive.fake()
    env.set('DEFAULT_ACCOUNT_EMAIL', ADMIN)
    env.set('DEFAULT_ACCOUNT_PASSWORD', 'the-default-passphrase')
    return async () => {
      drive.restore()
      env.set('DEFAULT_ACCOUNT_EMAIL', '')
      env.set('DEFAULT_ACCOUNT_PASSWORD', '')
      await releaseSkillsRefresh()
    }
  })

  test('syncing one skill reads its audits, pins it and copies it, without a search', async ({
    assert,
  }) => {
    await uncheckedSkill()
    const base = 'https://raw.githubusercontent.com/acme/skills'
    const network = fakeFetch(
      routes({
        [`${base}/${SHA}/skills/browser-tests/SKILL.md`]: {
          body: skillMd('browser-tests', 'Drive a browser.'),
        },
        [`https://api.github.com/repos/acme/skills/license?ref=${SHA}`]: {
          body: {
            license: { spdx_id: 'MIT' },
            content: Buffer.from('MIT License\n').toString('base64'),
          },
        },
      }),
    )
    const report = await syncSkill('browser-tests', { fetch: network.fn })

    assert.deepEqual(report?.copied, ['browser-tests'])
    assert.isFalse(network.calls.some((call) => call.url.includes('/api/search')))
    const skill = await CatalogSkill.findByOrFail('slug', 'browser-tests')
    assert.isTrue(skill.eligible)
    assert.isNull(skill.ineligibleReason)
    assert.equal(skill.contentSha, FOLDER)
    assert.equal(skill.url, `https://github.com/acme/skills/tree/${SHA}/skills/browser-tests`)
    assert.lengthOf(skill.audits, 1)
    assert.isNotNull(skill.checkedAt)
    // What only a search knows stays as it was.
    assert.equal(skill.installs, 4000)
    assert.deepEqual(skill.topics, ['testing'])
    const version = await SkillVersion.query().firstOrFail()
    assert.equal(version.status, 'pending')

    assert.isNull(await syncSkill('unknown', { fetch: network.fn }))
  })

  test('the admin asks for a sync of any active skill, eligible or not', async ({
    client,
    assert,
  }) => {
    const job = stubDispatch(CaptureSkillVersionJob)
    try {
      const skill = await uncheckedSkill()
      const admin = await User.create({ email: ADMIN, password: PASSWORD })
      const ask = () =>
        client.post('/admin/skill-versions').headers(json).json({ slug: skill.slug }).loginAs(admin)

      ;(await ask()).assertStatus(202)
      assert.deepEqual(job.sent, [{ slug: 'browser-tests' }])
      await skill.merge({ status: SkillStatus.Blocked }).save()
      ;(await ask()).assertStatus(404)
    } finally {
      job.restore()
    }
  })

  test('the admin blocks a skill with a reason and suggests it again', async ({
    client,
    assert,
  }) => {
    const skill = await uncheckedSkill()
    const admin = await User.create({ email: ADMIN, password: PASSWORD })
    const other = await User.create({ email: 'someone@example.com', password: PASSWORD })
    const patch = (slug: string, body: object, user: User) =>
      client.patch(`/admin/skills/${slug}`).headers(json).json(body).loginAs(user)

    ;(await patch(skill.slug, { blocked: true }, other)).assertStatus(404)
    ;(await patch('unknown', { blocked: true }, admin)).assertStatus(404)
    ;(await patch(skill.slug, {}, admin)).assertStatus(422)
    ;(await patch(skill.slug, { blocked: true, reason: 'x'.repeat(301) }, admin)).assertStatus(422)
    await skill.refresh()
    assert.equal(skill.status, SkillStatus.Active)

    const blocked = await patch(skill.slug, { blocked: true, reason: ' Runs curl | sh ' }, admin)
    blocked.assertStatus(200)
    blocked.assertBody({ blocked: true })
    await skill.refresh()
    assert.equal(skill.status, SkillStatus.Blocked)
    assert.equal(skill.statusReason, 'Runs curl | sh')

    ;(await patch(skill.slug, { blocked: false }, admin)).assertStatus(200)
    await skill.refresh()
    assert.equal(skill.status, SkillStatus.Active)
    assert.isNull(skill.statusReason)
  })

  test('the admin starts the search, one at a time', async ({ client, assert }) => {
    const job = stubDispatch(RefreshSkillsJob)
    try {
      const admin = await User.create({ email: ADMIN, password: PASSWORD })
      const other = await User.create({ email: 'someone@example.com', password: PASSWORD })
      const ask = (user: User) => client.post('/admin/skills/refresh').headers(json).loginAs(user)

      ;(await ask(other)).assertStatus(404)
      assert.lengthOf(job.sent, 0)
      ;(await ask(admin)).assertStatus(202)
      ;(await ask(admin)).assertStatus(409)
      assert.lengthOf(job.sent, 1)
      // The job gives the slot back when it ends.
      await releaseSkillsRefresh()
      ;(await ask(admin)).assertStatus(202)
      assert.lengthOf(job.sent, 2)
    } finally {
      job.restore()
    }
  })

  test('the admin queues scans: every copy waiting for one, or one copy again', async ({
    client,
    assert,
  }) => {
    const job = stubDispatch(ScanSkillVersionJob)
    try {
      const skill = await uncheckedSkill()
      const waiting = await copyOf(skill)
      const scanned = await copyOf(skill, { contentSha: 'e'.repeat(40), scan: CLEAN_SCAN })
      const approved = await copyOf(skill, {
        contentSha: 'f'.repeat(40),
        scan: CLEAN_SCAN,
        status: SkillVersionStatus.Approved,
      })
      const admin = await User.create({ email: ADMIN, password: PASSWORD })
      const other = await User.create({ email: 'someone@example.com', password: PASSWORD })
      const post = (path: string, user: User) =>
        client.post(`/admin/skill-versions/${path}`).headers(json).loginAs(user)

      ;(await post('scans', other)).assertStatus(404)
      ;(await post(`${scanned.id}/scan`, other)).assertStatus(404)
      assert.lengthOf(job.sent, 0)

      const all = await post('scans', admin)
      all.assertStatus(202)
      all.assertBody({ queued: 1 })
      assert.deepEqual(job.sent, [{ skillVersionId: waiting.id }])

      ;(await post(`${scanned.id}/scan`, admin)).assertStatus(202)
      assert.deepEqual(job.sent[1], { skillVersionId: scanned.id, force: true })
      ;(await post(`${approved.id}/scan`, admin)).assertStatus(409)
      ;(await post('999999/scan', admin)).assertStatus(404)
      assert.lengthOf(job.sent, 2)
    } finally {
      job.restore()
    }
  })
})
