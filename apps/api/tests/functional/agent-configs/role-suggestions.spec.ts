import { TARGETS } from '@coreloom-uml/catalog'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import AgentConfig from '#app/agent-configs/models/agent-config'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import { SkillStatus } from '#app/skills/constants/skill'
import CatalogSkill from '#app/skills/models/catalog-skill'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { withEmptySkillsCatalog } from '#tests/helpers/skills'

const json = { accept: 'application/json' }
const SHA = 'c'.repeat(40)

async function makeUser({ flag }: { flag: boolean }) {
  const user = await User.create({
    email: `role-suggestions-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  if (flag) {
    await updateFlag(FeatureFlagKey.AgentRoles, { enabled: true, rollout: 100, rules: [] }, user)
  }
  return user
}

/** A skill found by the search under one tag only, with no affinity. */
async function foundSkill(slug: string, topics: string[]) {
  return CatalogSkill.create({
    slug,
    name: slug,
    description: { en: `About ${slug}` },
    url: `https://github.com/acme/skills/tree/${SHA}/${slug}`,
    targets: [...TARGETS],
    affinities: [],
    topics,
    origin: 'search',
    status: SkillStatus.Active,
    eligible: true,
    ineligibleReason: null,
    registryId: `acme/skills/${slug}`,
    source: 'acme/skills',
    installs: 10,
    audits: [],
    license: 'MIT',
    contentSha: SHA,
    firstSeenAt: DateTime.now(),
    lastSeenAt: DateTime.now(),
    checkedAt: DateTime.now(),
  })
}

test.group('Agent configs - role suggestions', (group) => {
  group.each.setup(async () => {
    const rollback = await withEmptySkillsCatalog()
    await withDefaultFlags()
    return rollback
  })

  test('suggests the roles sharing tags with the rules held, with their skills', async ({
    client,
    assert,
  }) => {
    const user = await makeUser({ flag: true })
    const config = await AgentConfig.create({
      userId: user.id,
      projectId: null,
      name: 'Storefront',
      targets: ['claude-code'],
      revision: 1,
    })
    await foundSkill('react-patterns', ['react'])
    await foundSkill('mobile-only', ['mobile'])

    const url = `/agent-configs/${config.id}/roles/suggestions`
    const none = await client.get(url).headers(json).loginAs(user)
    none.assertStatus(200)
    assert.deepEqual(none.body(), { suggestions: [] })

    await config.related('readyRules').create({ slot: 'react.state', rule: 'tanstack-query-only' })
    const response = await client.get(url).headers(json).loginAs(user)
    response.assertStatus(200)
    const [first] = response.body().suggestions
    assert.equal(first.preset, 'frontend-developer')
    assert.deepEqual(first.topics, ['react'])
    assert.deepInclude(first.skills, {
      id: 'react-patterns',
      name: 'react-patterns',
      url: `https://github.com/acme/skills/tree/${SHA}/react-patterns`,
    })
    assert.notInclude(
      first.skills.map((skill: { id: string }) => skill.id),
      'mobile-only',
    )
  })

  test('answers 404 for another account, and while the flag is off', async ({ client }) => {
    const owner = await makeUser({ flag: true })
    const config = await AgentConfig.create({
      userId: owner.id,
      projectId: null,
      name: 'Storefront',
      targets: [],
      revision: 1,
    })
    const url = `/agent-configs/${config.id}/roles/suggestions`
    ;(
      await client
        .get(url)
        .headers(json)
        .loginAs(await makeUser({ flag: true }))
    ).assertStatus(404)
    ;(
      await client
        .get(url)
        .headers(json)
        .loginAs(await makeUser({ flag: false }))
    ).assertStatus(404)
  })
})
