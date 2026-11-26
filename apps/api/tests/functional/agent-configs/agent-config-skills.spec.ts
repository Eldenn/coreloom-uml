import { gzipSync } from 'node:zlib'
import drive from '@adonisjs/drive/services/main'
import { TARGETS } from '@coreloom-uml/catalog'
import { test } from '@japa/runner'
import AgentConfig from '#app/agent-configs/models/agent-config'
import type {
  AgentConfigDetailOutput,
  AgentGenerationOutput,
  AgentGenerationSkillFilesOutput,
} from '#app/agent-configs/validators/agent-configs-output'
import { SkillStatus } from '#app/skills/constants/skill'
import { SkillVersionStatus } from '#app/skills/constants/skill-version'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillVersion from '#app/skills/models/skill-version'
import type { SkillsListOutput } from '#app/skills/validators/skills-output'
import User from '#app/users/models/user'
import { withEmptySkillsCatalog } from '#tests/helpers/skills'

const json = { accept: 'application/json' }

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
    const storageKey = `skill-versions/${slug}/b.json.gz`
    await drive.use().put(
      storageKey,
      gzipSync(
        JSON.stringify([
          {
            path: 'SKILL.md',
            executable: false,
            content: `---\nname: ${slug}-named\n---\nDo it.\n`,
          },
          { path: 'scripts/run.sh', executable: true, content: 'echo run\n' },
        ]),
      ),
    )
    await SkillVersion.create({
      skillId: row.id,
      contentSha: 'b'.repeat(40),
      repository: 'acme/skills',
      commit: 'a'.repeat(40),
      folder: `skills/${slug}`,
      license: 'MIT',
      files: [],
      bytes: 0,
      storageKey,
      status: copy,
    })
  }
  return row
}

async function owner() {
  const user = await User.create({
    email: `held-skills-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  const config = await AgentConfig.create({
    userId: user.id,
    projectId: null,
    name: 'Storefront',
    targets: ['claude-code'],
    revision: 1,
  })
  return { user, config }
}

test.group('Agent configs - held skills', (group) => {
  group.each.setup(() => {
    drive.fake()
    return withEmptySkillsCatalog()
  })
  group.each.teardown(() => drive.restore())

  test('holds any skill with an approved copy, suggested or not, and removes it', async ({
    client,
    assert,
  }) => {
    await skill('browser-tests', SkillVersionStatus.Approved)
    await skill('pending-one', SkillVersionStatus.Pending)
    await skill('no-copy', null)
    const { user, config } = await owner()
    const url = `/agent-configs/${config.id}/skills`

    const listed = await client.get('/skills').qs({ installable: true }).headers(json).loginAs(user)
    listed.assertStatus(200)
    assert.deepEqual(
      (listed.body() as SkillsListOutput).data.map((item) => item.slug),
      ['browser-tests'],
    )

    for (const refused of ['pending-one', 'no-copy', 'unknown']) {
      const response = await client
        .put(url)
        .json({ skills: [refused] })
        .headers(json)
        .loginAs(user)
      response.assertStatus(422)
    }
    await config.refresh()
    assert.equal(config.revision, 1)

    const added = await client
      .put(url)
      .json({ skills: ['browser-tests'] })
      .headers(json)
      .loginAs(user)
    added.assertStatus(200)
    const body = added.body() as { config: AgentConfigDetailOutput }
    assert.deepEqual(
      body.config.skills.map((item) => item.slug),
      ['browser-tests'],
    )
    assert.equal(body.config.revision, 2)

    const generated = await client
      .post(`/agent-configs/${config.id}/generations`)
      .headers(json)
      .loginAs(user)
    generated.assertStatus(201)
    const latest = await client
      .get(`/agent-configs/${config.id}/generations/latest`)
      .headers(json)
      .loginAs(user)
    const generation = (latest.body() as { generation: AgentGenerationOutput }).generation
    assert.deepEqual(generation.skills.held, ['browser-tests'])
    assert.deepEqual(generation.targets, ['claude-code'])

    // Its files as `pull` lays them out, from the copy the generation recorded.
    const files = await client
      .get(`/agent-configs/${config.id}/generations/${generation.id}/skill-files`)
      .headers(json)
      .loginAs(user)
    files.assertStatus(200)
    assert.deepEqual(
      (files.body() as AgentGenerationSkillFilesOutput).files.map((file) => file.path),
      [
        '.claude/skills/browser-tests-named/SKILL.md',
        '.claude/skills/browser-tests-named/scripts/run.sh',
      ],
    )
    const stranger = (await owner()).user
    await client
      .get(`/agent-configs/${config.id}/generations/${generation.id}/skill-files`)
      .headers(json)
      .loginAs(stranger)
      .then((response) => response.assertStatus(404))

    // Saving the same set changes nothing; an empty one removes it.
    await client
      .put(url)
      .json({ skills: ['browser-tests'] })
      .headers(json)
      .loginAs(user)
    await config.refresh()
    assert.equal(config.revision, 2)
    const removed = await client.put(url).json({ skills: [] }).headers(json).loginAs(user)
    assert.deepEqual((removed.body() as { config: AgentConfigDetailOutput }).config.skills, [])
    assert.equal((removed.body() as { config: AgentConfigDetailOutput }).config.revision, 3)
  })

  test('keeps a held skill whose copy is no longer served, and hides others’ configurations', async ({
    client,
    assert,
  }) => {
    const held = await skill('browser-tests', SkillVersionStatus.Approved)
    await skill('other', SkillVersionStatus.Approved)
    const { user, config } = await owner()
    const url = `/agent-configs/${config.id}/skills`
    await client
      .put(url)
      .json({ skills: ['browser-tests'] })
      .headers(json)
      .loginAs(user)

    await held.merge({ status: SkillStatus.Blocked }).save()
    const kept = await client
      .put(url)
      .json({ skills: ['browser-tests', 'other'] })
      .headers(json)
      .loginAs(user)
    kept.assertStatus(200)
    assert.deepEqual(
      (kept.body() as { config: AgentConfigDetailOutput }).config.skills.map((item) => item.slug),
      ['browser-tests', 'other'],
    )

    const stranger = (await owner()).user
    const response = await client.put(url).json({ skills: [] }).headers(json).loginAs(stranger)
    response.assertStatus(404)
  })
})
