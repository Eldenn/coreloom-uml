import { describe, expect, it } from 'vitest'
import { skillProvenanceSchema } from './schemas.ts'

const provenance = {
  id: 'acme/skills/lint-rules',
  installs: 0,
  audits: [],
  checkedOn: '2026-11-26',
  contentSha: 'a'.repeat(40),
}

describe('skillProvenanceSchema', () => {
  it('takes a skill a GitHub source listed with no audit', () => {
    expect(skillProvenanceSchema.safeParse({ ...provenance, registry: 'github' }).success).toBe(
      true,
    )
  })

  it('still needs an audit for a skill skills.sh vouches for', () => {
    const result = skillProvenanceSchema.safeParse({ ...provenance, registry: 'skills.sh' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['audits'])
  })
})
