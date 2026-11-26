import drive from '@adonisjs/drive/services/main'
import { TARGETS } from '@coreloom-uml/catalog'
import { test } from '@japa/runner'
import CaptureSkillVersionJob from '#app/jobs/capture-skill-version_job'
import { SkillStatus } from '#app/skills/constants/skill'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillVersion from '#app/skills/models/skill-version'
import {
  captureSkillVersions,
  installName,
  readSkillVersionFiles,
} from '#app/skills/services/skill-versions'
import type { SkillVersionDetailOutput } from '#app/skills/validators/skill-versions-output'
import type { SkillCopyOutput, SkillsListOutput } from '#app/skills/validators/skills-output'
import User from '#app/users/models/user'
import env from '#start/env'
import { CLEAN_SCAN, withEmptySkillsCatalog } from '#tests/helpers/skills'
import {
  FOLDER,
  fakeFetch,
  NEW_FOLDER,
  NEW_SHA,
  type Route,
  SHA,
  skillMd,
} from '#tests/unit/skills/skills-search-fixtures'

const json = { accept: 'application/json' }
const ADMIN = 'skills-admin@example.com'
const MIT = Buffer.from('MIT License\n\nCopyright (c) Acme\n').toString('base64')

/** A found skill, checked and pinned to `commit`. */
function foundSkill(commit = SHA) {
  return CatalogSkill.create({
    slug: 'browser-tests',
    name: 'browser-tests (acme)',
    description: { en: 'Drive a browser.' },
    url: `https://github.com/acme/skills/tree/${commit}/skills/browser-tests`,
    targets: [...TARGETS],
    affinities: [{ slot: 'testing.levels', values: ['e2e'] }],
    topics: ['testing'],
    origin: 'search',
    status: SkillStatus.Active,
    eligible: true,
    contentSha: FOLDER,
    audits: [],
  })
}

/** The `acme/skills` repository at `commit`, its skill folder `folderSha` holding `extra` too. */
function repository(
  commit = SHA,
  folderSha = FOLDER,
  extra: { path: string; mode?: string; type?: string; body?: string | Buffer }[] = [],
): Record<string, Route> {
  const base = 'skills/browser-tests'
  const files = [
    { path: 'SKILL.md', mode: '100644', body: skillMd('browser-tests', 'Drive a browser.') },
    { path: 'scripts/run.sh', mode: '100755', body: '#!/bin/sh\necho run\n' },
    ...extra,
  ]
  return {
    [`https://api.github.com/repos/acme/skills/git/trees/${commit}?recursive=1`]: {
      body: {
        tree: [
          { path: base, type: 'tree', sha: folderSha },
          ...files.map((file) => ({
            path: `${base}/${file.path}`,
            type: file.type ?? 'blob',
            mode: file.mode ?? '100644',
            sha: 'f'.repeat(40),
          })),
        ],
      },
    },
    ...Object.fromEntries(
      files.map((file) => [
        `https://raw.githubusercontent.com/acme/skills/${commit}/${base}/${file.path}`,
        { body: file.body ?? '' },
      ]),
    ),
    [`https://api.github.com/repos/acme/skills/license?ref=${commit}`]: {
      body: { license: { spdx_id: 'MIT' }, content: MIT },
    },
  }
}

test.group('Skill versions', (group) => {
  group.each.setup(() => withEmptySkillsCatalog())
  group.each.setup(() => {
    drive.fake()
    env.set('DEFAULT_ACCOUNT_EMAIL', ADMIN)
    env.set('DEFAULT_ACCOUNT_PASSWORD', 'the-default-passphrase')
    return () => {
      drive.restore()
      env.set('DEFAULT_ACCOUNT_EMAIL', '')
      env.set('DEFAULT_ACCOUNT_PASSWORD', '')
    }
  })

  test('copies a skill once per content, pending, with the repository licence', async ({
    assert,
  }) => {
    await foundSkill()
    const network = fakeFetch(repository())
    const report = await captureSkillVersions({ fetch: network.fn })
    assert.deepEqual(report, { captured: ['browser-tests'], warnings: [] })

    const version = await SkillVersion.query().firstOrFail()
    assert.equal(version.status, 'pending')
    assert.equal(version.contentSha, FOLDER)
    assert.equal(version.license, 'MIT')
    assert.deepEqual(
      version.files.map((file) => [file.path, file.executable]),
      [
        ['SKILL.md', false],
        ['scripts/run.sh', true],
        ['LICENSE', false],
      ],
    )
    const files = await readSkillVersionFiles(version)
    assert.deepEqual(
      files.map((file) => file.path),
      ['SKILL.md', 'scripts/run.sh', 'LICENSE'],
    )
    assert.include(files.at(-1)?.content ?? '', 'Copyright (c) Acme')

    const again = await captureSkillVersions({ fetch: fakeFetch(repository()).fn })
    assert.deepEqual(again, { captured: [], warnings: [] })
    assert.lengthOf(await SkillVersion.all(), 1)
  })

  test('refuses a symbolic link, a binary file or a closed licence', async ({ assert }) => {
    const cases: [Record<string, Route>, string][] = [
      [repository(SHA, FOLDER, [{ path: 'link', mode: '120000' }]), 'symbolic link'],
      [
        repository(SHA, FOLDER, [{ path: 'logo.png', body: Buffer.from([0xff, 0xfe, 0xfd]) }]),
        'UTF-8',
      ],
      [
        {
          ...repository(),
          [`https://api.github.com/repos/acme/skills/license?ref=${SHA}`]: {
            body: { license: { spdx_id: 'NOASSERTION' }, content: MIT },
          },
        },
        'licence not accepted',
      ],
    ]
    await foundSkill()
    for (const [routes, reason] of cases) {
      const report = await captureSkillVersions({ fetch: fakeFetch(routes).fn })
      assert.deepEqual(report.captured, [])
      assert.include(report.warnings[0] ?? '', reason)
    }
    assert.lengthOf(await SkillVersion.all(), 0)
  })

  test('takes the licence SKILL.md declares when the repository has none', async ({ assert }) => {
    await foundSkill()
    const routes = repository(SHA, FOLDER)
    routes[`https://raw.githubusercontent.com/acme/skills/${SHA}/skills/browser-tests/SKILL.md`] = {
      body: '---\nname: browser-tests\ndescription: Drive a browser.\nlicense: MIT\n---\n',
    }
    delete routes[`https://api.github.com/repos/acme/skills/license?ref=${SHA}`]
    await captureSkillVersions({ fetch: fakeFetch(routes).fn })
    const version = await SkillVersion.query().firstOrFail()
    assert.equal(version.license, 'MIT')
    assert.notInclude(
      (await readSkillVersionFiles(version)).map((file) => file.path),
      'LICENSE',
    )
  })

  test('lets only the admin read a copy, diff it with the previous approved one and decide', async ({
    client,
    assert,
  }) => {
    const skill = await foundSkill()
    await captureSkillVersions({ fetch: fakeFetch(repository()).fn })
    const first = await SkillVersion.query().firstOrFail()
    const admin = await User.create({ email: ADMIN, password: 'a-very-strong-passphrase' })
    const other = await User.create({
      email: 'someone@example.com',
      password: 'a-very-strong-passphrase',
    })

    ;(await client.get('/admin/skill-versions').headers(json)).assertStatus(401)
    ;(await client.get('/admin/skill-versions').headers(json).loginAs(other)).assertStatus(404)
    ;(
      await client
        .patch(`/admin/skill-versions/${first.id}`)
        .headers(json)
        .json({ status: 'approved' })
        .loginAs(other)
    ).assertStatus(404)

    const list = await client.get('/admin/skill-versions').headers(json).loginAs(admin)
    list.assertStatus(200)
    assert.deepEqual(
      list.body().data.map((row: { id: number }) => row.id),
      [first.id],
    )
    const detail = await client
      .get(`/admin/skill-versions/${first.id}`)
      .headers(json)
      .loginAs(admin)
    assert.isNull((detail.body() as SkillVersionDetailOutput).previous)

    ;(
      await client
        .patch(`/admin/skill-versions/${first.id}`)
        .headers(json)
        .json({ status: 'pending' })
        .loginAs(admin)
    ).assertStatus(422)
    // Not scanned yet: it cannot be approved (see skill-scans.spec.ts), but once scanned clean…
    ;(
      await client
        .patch(`/admin/skill-versions/${first.id}`)
        .headers(json)
        .json({ status: 'approved' })
        .loginAs(admin)
    ).assertStatus(409)
    await first.merge({ scan: CLEAN_SCAN }).save()
    const approved = await client
      .patch(`/admin/skill-versions/${first.id}`)
      .headers(json)
      .json({ status: 'approved' })
      .loginAs(admin)
    approved.assertStatus(200)
    assert.equal(approved.body().status, 'approved')

    // The search moves the pin: a new copy, read against the approved one.
    await skill
      .merge({ url: `https://github.com/acme/skills/tree/${NEW_SHA}/skills/browser-tests` })
      .save()
    const changed = repository(NEW_SHA, NEW_FOLDER)
    changed[
      `https://raw.githubusercontent.com/acme/skills/${NEW_SHA}/skills/browser-tests/scripts/run.sh`
    ] = {
      body: '#!/bin/sh\necho changed\n',
    }
    await captureSkillVersions({ fetch: fakeFetch(changed).fn })
    const second = await SkillVersion.query().where('contentSha', NEW_FOLDER).firstOrFail()
    const diff = (
      await client.get(`/admin/skill-versions/${second.id}`).headers(json).loginAs(admin)
    ).body() as SkillVersionDetailOutput
    assert.equal(diff.previous?.version.id, first.id)
    assert.include(
      diff.previous?.files.find((f) => f.path === 'scripts/run.sh')?.content ?? '',
      'echo run',
    )
    assert.include(
      diff.files.find((f) => f.path === 'scripts/run.sh')?.content ?? '',
      'echo changed',
    )
  })

  test('serves any account the newest approved copy only, to install', async ({
    client,
    assert,
  }) => {
    const skill = await foundSkill()
    const user = await User.create({
      email: 'installs@example.com',
      password: 'a-very-strong-passphrase',
    })
    const url = '/skills/browser-tests/copy'
    ;(await client.get(url).headers(json)).assertStatus(401)
    ;(await client.get('/skills/unknown/copy').headers(json).loginAs(user)).assertStatus(404)

    await captureSkillVersions({ fetch: fakeFetch(repository()).fn })
    const first = await SkillVersion.query().firstOrFail()
    // Pending: nothing to install yet.
    ;(await client.get(url).headers(json).loginAs(user)).assertStatus(404)

    await first.merge({ status: 'approved' }).save()
    await skill
      .merge({ url: `https://github.com/acme/skills/tree/${NEW_SHA}/skills/browser-tests` })
      .save()
    await captureSkillVersions({ fetch: fakeFetch(repository(NEW_SHA, NEW_FOLDER)).fn })

    const response = await client.get(url).headers(json).loginAs(user)
    response.assertStatus(200)
    const { copy } = response.body() as { copy: SkillCopyOutput }
    // The newer copy is still pending: the approved one is served.
    assert.equal(copy.commit, SHA)
    assert.equal(copy.name, 'browser-tests')
    assert.equal(copy.license, 'MIT')
    assert.deepEqual(
      copy.files.map((file) => [file.path, file.executable]),
      [
        ['SKILL.md', false],
        ['scripts/run.sh', true],
        ['LICENSE', false],
      ],
    )

    // `version` serves that copy, the one a generation recorded, once it is approved.
    const newer = await SkillVersion.query().where('id', '!=', first.id).firstOrFail()
    ;(await client.get(url).qs({ version: newer.id }).headers(json).loginAs(user)).assertStatus(404)
    await newer.merge({ status: 'approved' }).save()
    const latest = await client.get(url).headers(json).loginAs(user)
    assert.equal((latest.body() as { copy: SkillCopyOutput }).copy.commit, NEW_SHA)
    const pinned = await client.get(url).qs({ version: first.id }).headers(json).loginAs(user)
    pinned.assertStatus(200)
    assert.equal((pinned.body() as { copy: SkillCopyOutput }).copy.commit, SHA)
    // Only a copy of this skill.
    ;(
      await client.get('/skills/other/copy').qs({ version: first.id }).headers(json).loginAs(user)
    ).assertStatus(404)

    // A blocked skill is not served any more.
    await skill.merge({ status: SkillStatus.Blocked }).save()
    ;(await client.get(url).headers(json).loginAs(user)).assertStatus(404)
  })

  test('installs a copy under the name SKILL.md declares, else the slug', ({ assert }) => {
    const md = (front: string) => [{ path: 'SKILL.md', executable: false, content: front }]
    assert.equal(installName(md('---\nname: tidy-tests\n---\n'), 'slug'), 'tidy-tests')
    assert.equal(installName(md('---\nname: "tidy-tests"\n---\n'), 'slug'), 'tidy-tests')
    assert.equal(installName(md('---\nname: ../etc\n---\n'), 'slug'), 'slug')
    assert.equal(installName(md('---\nname: Tidy Tests\n---\n'), 'slug'), 'slug')
    assert.equal(installName(md('no front matter\nname: other\n'), 'slug'), 'slug')
    assert.equal(installName([], 'slug'), 'slug')
  })

  test('shows the admin, on the skills list, which skills have a copy and each skill its copies', async ({
    client,
    assert,
  }) => {
    const bare = await foundSkill()
    await bare.merge({ slug: 'no-copy', url: bare.url.replace('browser-tests', 'no-copy') }).save()
    const skill = await foundSkill()
    // Only `browser-tests` is copied: nothing else is asked of the repository.
    await captureSkillVersions({ slug: skill.slug, fetch: fakeFetch(repository()).fn })
    const copy = await SkillVersion.query().firstOrFail()
    assert.equal(copy.skillId, skill.id)
    const admin = await User.create({ email: ADMIN, password: 'a-very-strong-passphrase' })
    const other = await User.create({
      email: 'someone@example.com',
      password: 'a-very-strong-passphrase',
    })
    const slugs = (body: SkillsListOutput) => body.data.map((row) => row.slug).sort()

    const all = (
      await client.get('/skills').headers(json).loginAs(admin)
    ).body() as SkillsListOutput
    assert.deepEqual(all.facets.copy, { pending: 1, none: 1 })
    const pending = await client.get('/skills').qs({ copy: 'pending' }).headers(json).loginAs(admin)
    assert.deepEqual(slugs(pending.body()), ['browser-tests'])
    const none = await client.get('/skills').qs({ copy: 'none' }).headers(json).loginAs(admin)
    assert.deepEqual(slugs(none.body()), ['no-copy'])
    const approved = await client
      .get('/skills')
      .qs({ copy: 'approved' })
      .headers(json)
      .loginAs(admin)
    assert.deepEqual(slugs(approved.body()), [])

    // Anyone else gets the whole list, without the counts.
    const theirs = await client.get('/skills').qs({ copy: 'pending' }).headers(json).loginAs(other)
    assert.deepEqual(slugs(theirs.body()), ['browser-tests', 'no-copy'])
    assert.notProperty((theirs.body() as SkillsListOutput).facets, 'copy')

    // A skill's copies, whatever their status.
    await copy.merge({ status: 'rejected' }).save()
    const copies = await client
      .get('/admin/skill-versions')
      .qs({ skill: 'browser-tests' })
      .headers(json)
      .loginAs(admin)
    assert.deepEqual(
      copies.body().data.map((row: { id: number }) => row.id),
      [copy.id],
    )
    const noCopies = await client
      .get('/admin/skill-versions')
      .qs({ skill: 'no-copy' })
      .headers(json)
      .loginAs(admin)
    assert.deepEqual(noCopies.body().data, [])
  })

  test('queues a copy of one skill when the admin asks, and only of a skill that is copied', async ({
    client,
    assert,
  }) => {
    const dispatched: unknown[] = []
    const own = Object.getOwnPropertyDescriptor(CaptureSkillVersionJob, 'dispatch')
    Object.defineProperty(CaptureSkillVersionJob, 'dispatch', {
      configurable: true,
      writable: true,
      value: async (data: unknown) => {
        dispatched.push(data)
      },
    })
    try {
      const skill = await foundSkill()
      const admin = await User.create({ email: ADMIN, password: 'a-very-strong-passphrase' })
      const other = await User.create({
        email: 'someone@example.com',
        password: 'a-very-strong-passphrase',
      })
      const ask = (slug: string, user: User) =>
        client.post('/admin/skill-versions').headers(json).json({ slug }).loginAs(user)

      ;(await ask(skill.slug, other)).assertStatus(404)
      ;(await ask('unknown', admin)).assertStatus(404)
      ;(await ask(skill.slug, admin)).assertStatus(202)
      assert.deepEqual(dispatched, [{ slug: 'browser-tests' }])

      await skill.merge({ status: SkillStatus.Blocked }).save()
      ;(await ask(skill.slug, admin)).assertStatus(404)
      assert.lengthOf(dispatched, 1)
    } finally {
      if (own) Object.defineProperty(CaptureSkillVersionJob, 'dispatch', own)
      else delete (CaptureSkillVersionJob as unknown as Record<string, unknown>).dispatch
    }
  })
})
