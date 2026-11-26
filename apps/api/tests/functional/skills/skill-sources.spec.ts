import { TARGETS } from '@coreloom-uml/catalog'
import { test } from '@japa/runner'
import { SkillSourceKind, SkillStatus } from '#app/skills/constants/skill'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillSource from '#app/skills/models/skill-source'
import User from '#app/users/models/user'
import env from '#start/env'
import { withEmptySkillsCatalog } from '#tests/helpers/skills'

const json = { accept: 'application/json' }
const ADMIN = 'skill-sources-admin@example.com'
const PASSWORD = 'a-very-strong-passphrase'

test.group('Skill sources', (group) => {
  group.each.setup(() => withEmptySkillsCatalog())
  group.each.setup(() => {
    env.set('DEFAULT_ACCOUNT_EMAIL', ADMIN)
    env.set('DEFAULT_ACCOUNT_PASSWORD', 'the-default-passphrase')
    return () => {
      env.set('DEFAULT_ACCOUNT_EMAIL', '')
      env.set('DEFAULT_ACCOUNT_PASSWORD', '')
    }
  })

  test('the catalog starts with skills.sh as its one source, enabled', async ({ assert }) => {
    const sources = await SkillSource.all()
    assert.lengthOf(sources, 1)
    assert.include(sources[0]?.serialize(), {
      kind: SkillSourceKind.SkillsSh,
      owner: null,
      repo: null,
      path: null,
      enabled: true,
    })
  })

  test('the admin lists, adds, disables and deletes a source', async ({ client, assert }) => {
    const admin = await User.create({ email: ADMIN, password: PASSWORD })
    const added = await client
      .post('/admin/skill-sources')
      .headers(json)
      .json({ owner: 'anthropics', repo: 'skills', path: '/skills/' })
      .loginAs(admin)
    added.assertStatus(201)
    const source = added.body().source
    assert.include(source, {
      kind: 'github',
      owner: 'anthropics',
      repo: 'skills',
      path: 'skills',
      label: 'anthropics/skills/skills',
      enabled: true,
      skills: 0,
      lastRunAt: null,
      lastError: null,
    })

    const listed = await client.get('/admin/skill-sources').headers(json).loginAs(admin)
    listed.assertStatus(200)
    assert.deepEqual(
      listed.body().data.map((item: { label: string }) => item.label),
      ['skills.sh', 'anthropics/skills/skills'],
    )

    const disabled = await client
      .patch(`/admin/skill-sources/${source.id}`)
      .headers(json)
      .json({ enabled: false })
      .loginAs(admin)
    disabled.assertStatus(200)
    assert.isFalse(disabled.body().source.enabled)

    const deleted = await client
      .delete(`/admin/skill-sources/${source.id}`)
      .headers(json)
      .loginAs(admin)
    deleted.assertStatus(204)
    assert.isNull(await SkillSource.find(source.id))
  })

  test('adding the same repository twice is a conflict', async ({ client }) => {
    const admin = await User.create({ email: ADMIN, password: PASSWORD })
    const add = () =>
      client
        .post('/admin/skill-sources')
        .headers(json)
        .json({ owner: 'acme', repo: 'skills' })
        .loginAs(admin)
    ;(await add()).assertStatus(201)
    ;(await add()).assertStatus(409)
    // GitHub names are case-insensitive: the same repository in another case is no new source.
    const shouted = await client
      .post('/admin/skill-sources')
      .headers(json)
      .json({ owner: 'ACME', repo: 'Skills' })
      .loginAs(admin)
    shouted.assertStatus(409)
  })

  test('skills.sh can be disabled but never deleted', async ({ client, assert }) => {
    const admin = await User.create({ email: ADMIN, password: PASSWORD })
    const skillsSh = await SkillSource.findByOrFail('kind', SkillSourceKind.SkillsSh)
    const deleted = await client
      .delete(`/admin/skill-sources/${skillsSh.id}`)
      .headers(json)
      .loginAs(admin)
    deleted.assertStatus(409)
    const disabled = await client
      .patch(`/admin/skill-sources/${skillsSh.id}`)
      .headers(json)
      .json({ enabled: false })
      .loginAs(admin)
    disabled.assertStatus(200)
    await skillsSh.refresh()
    assert.isFalse(skillsSh.enabled)
  })

  test('a repository or folder that is not a plain GitHub path is refused', async ({ client }) => {
    const admin = await User.create({ email: ADMIN, password: PASSWORD })
    for (const body of [
      { owner: 'acme', repo: 'skills', path: 'skills/../secrets' },
      { owner: 'acme', repo: 'skills', path: 'skills/./x' },
      { owner: 'ac/me', repo: 'skills' },
      { owner: 'acme', repo: 'sk ills' },
      { owner: 'acme', repo: 'skills', path: 'a'.repeat(201) },
    ]) {
      const response = await client
        .post('/admin/skill-sources')
        .headers(json)
        .json(body)
        .loginAs(admin)
      response.assertStatus(422)
    }
  })

  test('another account gets 404 on every route', async ({ client }) => {
    const other = await User.create({ email: 'someone@example.com', password: PASSWORD })
    const skillsSh = await SkillSource.findByOrFail('kind', SkillSourceKind.SkillsSh)
    for (const request of [
      client.get('/admin/skill-sources'),
      client.post('/admin/skill-sources').json({ owner: 'acme', repo: 'skills' }),
      client.patch(`/admin/skill-sources/${skillsSh.id}`).json({ enabled: false }),
      client.delete(`/admin/skill-sources/${skillsSh.id}`),
    ]) {
      ;(await request.headers(json).loginAs(other)).assertStatus(404)
    }
  })

  test("a skill's sheet names the sources that found it", async ({ client, assert }) => {
    const user = await User.create({ email: 'reader@example.com', password: PASSWORD })
    const acme = await SkillSource.create({ kind: 'github', owner: 'acme', repo: 'skills' })
    const skillsSh = await SkillSource.findByOrFail('kind', SkillSourceKind.SkillsSh)
    const skill = await CatalogSkill.create({
      slug: 'lint-rules',
      name: 'lint-rules (acme)',
      description: { en: 'Keep lint rules strict.' },
      url: 'https://github.com/acme/skills',
      registryId: 'acme/skills/lint-rules',
      source: 'acme/skills',
      installs: 0,
      targets: [...TARGETS],
      affinities: [],
      topics: [],
      searchTopics: [],
      origin: 'search',
      status: SkillStatus.Active,
      eligible: false,
      ineligibleReason: 'not checked yet',
      audits: [],
    })
    await acme.related('skills').attach([skill.id])
    await skillsSh.related('skills').attach([skill.id])
    const response = await client.get('/skills/lint-rules').headers(json).loginAs(user)
    response.assertStatus(200)
    assert.deepEqual(response.body().skill.foundBy, ['skills.sh', 'acme/skills'])
    // skills.sh never returned it (no installs): it has no page there to link to.
    assert.isNull(response.body().skill.registryUrl)
  })
})
