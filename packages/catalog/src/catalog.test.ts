import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APPLIED_RULES } from './ready-rules.ts'
import { findRuleGroup, RULE_PACKS } from './rule-packs/index.ts'
import {
  isSlotAffinity,
  type RuleGroup,
  type RulePack,
  rulePackSchema,
  type SkillAffinity,
  skillAffinitySchema,
  skillSchema,
} from './schemas.ts'
import { RESERVED_SECTIONS, SHARED_SECTIONS, sectionOrder } from './sections.ts'
import { SKILL_SEARCH_PLAN } from './skill-search-plan.ts'
import { SKILL_TARGET_SOURCES, SKILLS, SKILLS_MAX, SKILLS_VERIFIED_ON } from './skills.ts'
import { SLOTS } from './slots.ts'
import { TARGET_TEMPLATES } from './targets/index.ts'
import { TARGETS } from './targets.ts'
import { CATALOG_VERSION } from './version.ts'

const frontendReact = RULE_PACKS.find((pack) => pack.id === 'frontend-react') as RulePack
const GROUPS = RULE_PACKS.flatMap((pack) => pack.groups)

/** Checks a slot affinity against the group that feeds its slot. */
function expectAffinityFits(affinity: SkillAffinity, name: string) {
  if (!isSlotAffinity(affinity)) return
  const group = findRuleGroup(RULE_PACKS, affinity.slot)
  expect(group, `${name}: no group feeds ${affinity.slot}`).toBeDefined()
  const ids = group?.rules.map((rule) => rule.id) ?? []
  for (const rule of [...affinity.values, ...(affinity.against ?? [])]) {
    expect(ids, `${name}: ${affinity.slot}`).toContain(rule)
  }
}

describe('the real catalog', () => {
  it.each(
    RULE_PACKS.map((pack) => [pack.id, pack] as const),
  )('%s passes its schema', (_id, pack) => {
    const result = rulePackSchema.safeParse(pack)
    expect(result.success ? [] : result.error.issues).toEqual([])
  })

  it('has unique pack ids', () => {
    const ids = RULE_PACKS.map((pack) => pack.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('feeds only registered slots, each from one group', () => {
    const slots = GROUPS.map((group) => group.slot)
    for (const slot of slots) expect(Object.keys(SLOTS)).toContain(slot)
    expect(new Set(slots).size).toBe(slots.length)
    for (const slot of slots) expect(findRuleGroup(RULE_PACKS, slot)?.slot).toBe(slot)
    expect(findRuleGroup(RULE_PACKS, 'typescript.unknown')).toBeUndefined()
  })

  it('holds packs that combine with every other one, each with its own sections', () => {
    expect(RULE_PACKS.map((pack) => pack.id)).toEqual([
      'frontend-react',
      'backend-node',
      'git-workflow',
      'security',
      'system-design',
      'software-design',
      'ai-engineering',
      'ai-agents',
      'frontend-performance',
    ])
    for (const pack of RULE_PACKS) expect(pack.groups.length).toBeGreaterThanOrEqual(5)
    const own = RULE_PACKS.flatMap((pack) => pack.sections)
    expect(new Set(own).size).toBe(own.length)
    for (const section of own) {
      expect(SHARED_SECTIONS).not.toContain(section)
      expect(RESERVED_SECTIONS).not.toContain(section)
    }
    expect(sectionOrder(RULE_PACKS).slice(3, -4)).toEqual(own)
  })

  it('keeps every line in English, on one line, without markers', () => {
    for (const group of GROUPS) {
      for (const line of [...group.rules.flatMap((rule) => rule.lines), ...(group.lines ?? [])]) {
        expect(line).not.toMatch(/[\r\n]|coreloom-uml:|[àâçéèêëîïôûùüÿœ]/i)
      }
    }
  })

  it('gives every applied slot a group, and every applied rule a place in it', () => {
    for (const [slot, applied] of Object.entries(APPLIED_RULES)) {
      const group = findRuleGroup(RULE_PACKS, slot)
      expect(group, slot).toBeDefined()
      if (applied === 'all') continue
      const ids = group?.rules.map((rule) => rule.id) ?? []
      for (const rule of applied) expect(ids, slot).toContain(rule)
    }
  })

  it('writes `{value}` in a group line only for a group that holds one rule', () => {
    for (const group of GROUPS) {
      if (group.lines?.some((line) => line.includes('{value}'))) {
        expect(group.pick, group.slot).toBe('one')
      }
    }
  })

  it('writes the text typed into a rule: an `input` rule has a line with `{value}`', () => {
    for (const group of GROUPS) {
      for (const rule of group.rules.filter((item) => item.input)) {
        const lines = [...rule.lines, ...(group.lines ?? [])]
        expect(
          lines.some((line) => line.includes('{value}')),
          `${group.slot}: ${rule.id}`,
        ).toBe(true)
      }
    }
  })

  it('has a template for every target, dated and sourced', () => {
    for (const target of TARGETS) {
      const template = TARGET_TEMPLATES[target]
      expect(template.target).toBe(target)
      expect(template.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(template.sources.length).toBeGreaterThan(0)
      expect(template.readsAgentsMd).toBe(template.pointer === undefined)
    }
  })

  it(`has 6 to ${SKILLS_MAX} skills, each passing its schema, with unique ids and URLs`, () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(6)
    expect(SKILLS.length).toBeLessThanOrEqual(SKILLS_MAX)
    expect(new Set(SKILLS.map((skill) => skill.url)).size).toBe(SKILLS.length)
    for (const skill of SKILLS) expect(skill.origin).toBe('manual')
    for (const skill of SKILLS) {
      const result = skillSchema.safeParse(skill)
      expect(result.success ? [] : result.error.issues).toEqual([])
    }
    const ids = SKILLS.map((skill) => skill.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('pins every skill URL to a tag or a commit', () => {
    for (const skill of SKILLS) {
      expect(skill.url).toMatch(
        /^https:\/\/github\.com\/[^/]+\/[^/]+\/tree\/(v\d+\.\d+\.\d+|[0-9a-f]{40})\//,
      )
    }
  })

  it('matches every skill affinity to the group that feeds its slot', () => {
    for (const skill of SKILLS) {
      for (const affinity of skill.affinities) expectAffinityFits(affinity, skill.id)
    }
  })

  it('gives every search query an affinity that passes the schema and fits its group', () => {
    const queries = SKILL_SEARCH_PLAN.map((item) => item.query)
    expect(new Set(queries).size).toBe(queries.length)
    for (const { query, affinity } of SKILL_SEARCH_PLAN) {
      if (!affinity) continue
      expect(skillAffinitySchema.safeParse(affinity).success, query).toBe(true)
      expectAffinityFits(affinity, query)
    }
  })

  it('dates the skills and sources their targets', () => {
    expect(SKILLS_VERIFIED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    for (const target of new Set(SKILLS.flatMap((skill) => skill.targets))) {
      expect(SKILL_TARGET_SOURCES[target]).toMatch(/^https:\/\//)
    }
  })

  it('states the version of package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    expect(CATALOG_VERSION).toBe(pkg.version)
  })
})

describe('rulePackSchema', () => {
  const group = frontendReact.groups[0] as RuleGroup
  const many = frontendReact.groups.find((item) => item.pick === 'many') as RuleGroup
  const withGroups = (...groups: unknown[]) =>
    rulePackSchema.safeParse({ ...frontendReact, groups }).success

  it('accepts a pack of one group', () => {
    expect(withGroups(group)).toBe(true)
  })

  it('refuses an unknown slot', () => {
    expect(withGroups({ ...group, slot: 'typescript.unknown' })).toBe(false)
  })

  it('refuses a section that is neither its own nor shared', () => {
    expect(withGroups({ ...group, section: 'Elsewhere' })).toBe(false)
  })

  it('refuses to declare a shared or reserved section as its own', () => {
    for (const section of [...SHARED_SECTIONS, ...RESERVED_SECTIONS]) {
      const pack = { ...frontendReact, groups: [group], sections: ['TypeScript', section] }
      expect(rulePackSchema.safeParse(pack).success).toBe(false)
    }
  })

  it('refuses two groups feeding the same slot, and a rule id used twice', () => {
    expect(withGroups(group, group)).toBe(false)
    expect(withGroups({ ...group, rules: [group.rules[0], group.rules[0]] })).toBe(false)
  })

  it('refuses a rule that writes nothing, a two-line line and a group without rule', () => {
    const rule = { id: 'quiet', lines: [] }
    expect(withGroups({ ...group, rules: [rule] })).toBe(false)
    expect(withGroups({ ...group, rules: [rule], lines: ['Always do this.'] })).toBe(true)
    expect(withGroups({ ...group, rules: [{ id: 'two', lines: ['One.\nTwo.'] }] })).toBe(false)
    expect(withGroups({ ...group, rules: [] })).toBe(false)
  })

  it('refuses a rule that stands alone in a group that holds one', () => {
    const alone = { id: 'none', lines: ['Do nothing.'], alone: true }
    expect(withGroups({ ...group, rules: [alone] })).toBe(false)
    expect(withGroups({ ...many, rules: [alone] })).toBe(true)
  })

  it('refuses `{value}` in a line of a group that holds several rules', () => {
    expect(withGroups({ ...many, lines: ['Use {value}.'] })).toBe(false)
    expect(withGroups({ ...many, lines: ['Use them all.'] })).toBe(true)
    expect(withGroups({ ...group, lines: ['Use {value}.'] })).toBe(true)
  })
})

describe('sectionOrder', () => {
  it('returns the sections in render order', () => {
    expect(sectionOrder([frontendReact])).toEqual([
      'Project',
      'Architecture',
      'Working style',
      ...frontendReact.sections,
      'Testing',
      'Workflow',
      'Tooling',
      'Project notes',
    ])
  })

  it('merges sections in pack order without duplicates', () => {
    const other = { sections: ['Node', 'TypeScript'] }
    expect(sectionOrder([frontendReact, other]).slice(3, -4)).toEqual([
      ...frontendReact.sections,
      'Node',
    ])
  })
})

describe('skillSchema', () => {
  const valid = {
    id: 'a-skill',
    name: 'A skill',
    description: { en: 'A skill.', fr: 'Un skill.' },
    url: 'https://example.com/a-skill',
    targets: ['cursor'],
    affinities: [{ slot: 'typescript.any', values: ['agree'], against: ['disagree'] }],
    origin: 'manual',
  }

  it('accepts a valid skill', () => {
    expect(skillSchema.safeParse(valid).success).toBe(true)
  })

  it('refuses an unknown slot, an unknown target, an http URL and an install field', () => {
    for (const skill of [
      { ...valid, affinities: [{ slot: 'typescript.unknown', values: ['x'] }] },
      { ...valid, targets: ['vim'] },
      { ...valid, url: 'http://example.com/a-skill' },
      { ...valid, install: 'npx something' },
      { ...valid, origin: 'search' },
      { ...valid, affinities: [{ diagramKinds: ['flowchart'] }] },
      { ...valid, affinities: [{ diagramKinds: ['c4'] }, { diagramKinds: ['class'] }] },
    ]) {
      expect(skillSchema.safeParse(skill).success).toBe(false)
    }
  })

  it('refuses an affinity without values, with a scale, or with a rule both fitted and gone against', () => {
    for (const affinity of [
      { slot: 'typescript.any' },
      { slot: 'typescript.any', values: [] },
      { slot: 'typescript.any', values: ['agree'], against: [] },
      { slot: 'typescript.any', scale: { min: 4, max: 5 } },
      { slot: 'typescript.any', values: ['agree'], against: ['agree'] },
    ]) {
      expect(skillSchema.safeParse({ ...valid, affinities: [affinity] }).success).toBe(false)
    }
  })
})
