import { describe, expect, it } from 'vitest'
import { ROLE_SKILLS_MAX, ROLE_SUGGESTIONS_MAX, suggestRoles } from './match-roles.ts'
import { ROLE_PRESETS } from './roles/presets/agency-agents.ts'
import { PRESET_TOPICS } from './roles/presets/topics.ts'
import { RULE_PACKS } from './rule-packs/index.ts'
import type { Skill } from './schemas.ts'
import { SLOT_PREFIX_TOPICS, SLOT_TOPICS, slotTopics, TOPICS, type Topic } from './topics.ts'

function skill(id: string, topics: Topic[], targets: Skill['targets'] = ['claude-code']): Skill {
  return {
    id,
    name: id,
    description: { en: id },
    url: `https://example.com/${id}`,
    targets,
    affinities: [],
    topics,
    origin: 'manual',
  }
}

describe('tags', () => {
  it('tags every slot of every pack', () => {
    for (const pack of RULE_PACKS) {
      for (const group of pack.groups) expect(slotTopics(group.slot), group.slot).not.toEqual([])
    }
  })

  it('names only slots and prefixes that exist', () => {
    const slots = new Set<string>(RULE_PACKS.flatMap((pack) => pack.groups.map((g) => g.slot)))
    const prefixes = new Set([...slots].map((slot) => slot.split('.')[0]))
    expect(Object.keys(SLOT_PREFIX_TOPICS).sort()).toEqual([...prefixes].sort())
    for (const slot of Object.keys(SLOT_TOPICS)) expect(slots.has(slot), slot).toBe(true)
  })

  it('tags every ready-made role, and nothing else', () => {
    expect(Object.keys(PRESET_TOPICS).sort()).toEqual(ROLE_PRESETS.map((p) => p.slug).sort())
    for (const topics of Object.values(PRESET_TOPICS)) {
      expect(new Set(topics).size).toBe(topics.length)
      for (const topic of topics) expect(TOPICS).toContain(topic)
    }
  })
})

describe('suggestRoles', () => {
  it('suggests the roles sharing the most tags, never one without', () => {
    const roles = suggestRoles(['frontend', 'react', 'typescript'], [], ['claude-code'])
    expect(roles[0]).toEqual({
      preset: 'frontend-developer',
      topics: ['frontend', 'react', 'typescript'],
      skills: [],
    })
    expect(roles.length).toBeLessThanOrEqual(ROLE_SUGGESTIONS_MAX)
    for (const role of roles) expect(PRESET_TOPICS[role.preset]).not.toEqual([])
    expect(suggestRoles([], [], ['claude-code'])).toEqual([])
  })

  it('gives each role the loadable skills sharing its own tags, the most shared first', () => {
    const skills = [
      skill('react-only', ['react']),
      skill('cursor-only', ['frontend', 'react'], ['cursor']),
      skill('both', ['frontend', 'react']),
      skill('backend', ['backend']),
      ...Array.from({ length: 4 }, (_, i) => skill(`extra-${i}`, ['typescript'])),
    ]
    const [first] = suggestRoles(['react'], skills, ['claude-code'])
    expect(first?.preset).toBe('frontend-developer')
    expect(first?.topics).toEqual(['react'])
    expect(first?.skills.map((item) => item.id)).toEqual(['both', 'react-only', 'extra-0'])
    expect(first?.skills).toHaveLength(ROLE_SKILLS_MAX)
  })
})
