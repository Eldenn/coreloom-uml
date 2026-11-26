import { test } from '@japa/runner'
import { SkillSourceKind } from '#app/skills/constants/skill'
import SkillSource from '#app/skills/models/skill-source'
import { withEmptySkillsCatalog } from '#tests/helpers/skills'

test.group('Skill sources', (group) => {
  group.each.setup(() => withEmptySkillsCatalog())

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
})
