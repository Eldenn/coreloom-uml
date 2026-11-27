import { describe, expect, it } from 'vitest'
import {
  type AffinityDecision,
  COMPATIBLE_SKILLS_MAX,
  COMPUTED_AFFINITY_THRESHOLD,
  CONFLICTING_SKILLS_MAX,
  type ComputedAffinities,
  matchSkills,
  pairKey,
} from './match-skills.ts'
import { findRuleGroup, RULE_PACKS } from './rule-packs/index.ts'
import type { AcceptedRule, RulePack, Skill } from './schemas.ts'
import { SKILLS } from './skills.ts'

const frontendReact = RULE_PACKS.find((pack) => pack.id === 'frontend-react') as RulePack

/** A fixture skill on one slot; the real catalog is checked in catalog.test.ts. */
function skill(id: string, overrides: Partial<Skill> = {}): Skill {
  return {
    id,
    name: id,
    description: { en: `${id} (en)`, fr: `${id} (fr)` },
    url: `https://example.com/${id}`,
    targets: ['claude-code'],
    affinities: [{ slot: 'typescript.any', values: ['agree'], against: ['disagree'] }],
    origin: 'manual',
    ...overrides,
  }
}

/** The rules held, by slot: one id, several, or one with its typed text. */
type Held = Record<string, string | string[] | { rule: string; value: string }>

function ready(held: Held): AcceptedRule[] {
  return Object.entries(held).flatMap(([slot, rules]) =>
    typeof rules === 'object' && !Array.isArray(rules)
      ? [{ slot, ...rules }]
      : [rules].flat().map((rule) => ({ slot, rule })),
  )
}

function match(
  held: Held,
  skills: Skill[],
  targets: Skill['targets'] = ['claude-code'],
  diagramKinds: string[] = [],
) {
  return matchSkills({ packs: [frontendReact], ready: ready(held), targets, diagramKinds }, skills)
}

const strictTyping = skill('strict-typing')

describe('matchSkills', () => {
  it('counts +1 for a held rule the skill fits: compatible', () => {
    const result = match({ 'typescript.any': 'agree' }, [strictTyping])
    expect(result.compatible).toEqual([
      {
        id: 'strict-typing',
        name: 'strict-typing',
        description: { en: 'strict-typing (en)', fr: 'strict-typing (fr)' },
        url: 'https://example.com/strict-typing',
        targets: ['claude-code'],
        score: 1,
        reasons: [],
        audits: [],
      },
    ])
    expect(result.conflicting).toEqual([])
  })

  it('counts −1 for a held rule the skill goes against, with a readable reason', () => {
    const result = match({ 'typescript.any': 'disagree' }, [strictTyping])
    expect(result.compatible).toEqual([])
    expect(result.conflicting).toHaveLength(1)
    const group = findRuleGroup([frontendReact], 'typescript.any')
    const [agree, disagree] = (group?.rules ?? []).map((rule) => rule.lines[0])
    expect(result.conflicting[0]?.reasons).toEqual([
      {
        slot: 'typescript.any',
        questionLabel: group?.label,
        yourAnswer: { en: disagree, fr: disagree },
        skillExpects: { en: agree, fr: agree },
      },
    ])
  })

  it('names the rules a skill expects by their labels, in the group’s order', () => {
    const state = skill('state', {
      affinities: [{ slot: 'react.state', values: ['redux', 'zustand'], against: ['context'] }],
    })
    expect(match({ 'react.state': 'context' }, [state]).conflicting[0]?.reasons).toMatchObject([
      {
        yourAnswer: { en: 'React context', fr: 'Le contexte React' },
        skillExpects: { en: 'Zustand / Redux', fr: 'Zustand / Redux' },
      },
    ])
  })

  it('counts 0 for a held rule the skill neither fits nor goes against', () => {
    const asksFirst = skill('asks-first', {
      affinities: [
        { slot: 'workflow.autonomy', values: ['ask-before-writing'], against: ['disagree'] },
      ],
    })
    expect(match({ 'workflow.autonomy': 'agree' }, [asksFirst])).toEqual({
      compatible: [],
      conflicting: [],
    })
  })

  it('ignores an affinity whose slot holds no rule', () => {
    expect(match({}, [strictTyping])).toEqual({ compatible: [], conflicting: [] })
  })

  it('counts +1 for the one rule of a group among the values, 0 otherwise', () => {
    const zustand = skill('zustand', {
      affinities: [{ slot: 'react.state', values: ['zustand'] }],
    })
    expect(match({ 'react.state': 'zustand' }, [zustand]).compatible).toHaveLength(1)
    expect(match({ 'react.state': 'redux' }, [zustand])).toEqual({
      compatible: [],
      conflicting: [],
    })
    // A typed text is never one of the values, whatever it says.
    const typed = { 'react.state': { rule: 'other', value: 'zustand' } }
    expect(match(typed, [zustand]).compatible).toEqual([])
  })

  it('counts +1 when one of several rules held is among the values', () => {
    const e2e = skill('e2e', { affinities: [{ slot: 'testing.levels', values: ['e2e'] }] })
    expect(match({ 'testing.levels': ['unit', 'e2e'] }, [e2e]).compatible).toHaveLength(1)
    expect(match({ 'testing.levels': ['none'] }, [e2e]).compatible).toEqual([])
  })

  it('counts −1, not +1, when rules held are both fitted and gone against', () => {
    const tested = skill('tested', {
      affinities: [{ slot: 'testing.levels', values: ['unit'], against: ['e2e'] }],
    })
    const result = match({ 'testing.levels': ['unit', 'e2e'] }, [tested])
    expect(result.compatible).toEqual([])
    expect(result.conflicting[0]).toMatchObject({
      score: -1,
      reasons: [{ slot: 'testing.levels' }],
    })
  })

  it('makes a skill conflicting as soon as one affinity is −1, whatever the others', () => {
    const mixed = skill('mixed', {
      affinities: [
        { slot: 'typescript.any', values: ['agree'], against: ['disagree'] },
        { slot: 'workflow.changes', values: ['agree'], against: ['disagree'] },
        { slot: 'react.state', values: ['zustand'] },
      ],
    })
    const result = match(
      { 'typescript.any': 'agree', 'workflow.changes': 'disagree', 'react.state': 'zustand' },
      [mixed],
    )
    expect(result.compatible).toEqual([])
    expect(result.conflicting[0]).toMatchObject({
      score: 1,
      reasons: [{ slot: 'workflow.changes' }],
    })
  })

  it('never suggests a skill for none of the configuration’s targets', () => {
    const cursorOnly = skill('cursor-only', { targets: ['cursor'] })
    const agree = { 'typescript.any': 'agree' }
    expect(match(agree, [cursorOnly], ['claude-code'])).toEqual({
      compatible: [],
      conflicting: [],
    })
    expect(
      match({ 'typescript.any': 'disagree' }, [cursorOnly], ['claude-code']).conflicting,
    ).toEqual([])
    expect(match(agree, [cursorOnly], ['claude-code', 'cursor']).compatible).toHaveLength(1)
  })

  it('ignores rules that cannot be held together, and rules of a pack it was not given', () => {
    const none = { compatible: [], conflicting: [] }
    expect(match({ 'typescript.any': ['agree', 'disagree'] }, [strictTyping])).toEqual(none)
    expect(match({ 'typescript.any': 'maybe' }, [strictTyping])).toEqual(none)
    const typed = { 'typescript.any': { rule: 'agree', value: 'typed' } }
    expect(match(typed, [strictTyping])).toEqual(none)
    const input = {
      packs: [],
      ready: ready({ 'typescript.any': 'agree' }),
      targets: ['claude-code' as const],
      diagramKinds: [],
    }
    expect(matchSkills(input, [strictTyping])).toEqual(none)
  })

  it('makes a skill sharing a tag with the slots held compatible, never conflicting', () => {
    const tagged = skill('tagged', { affinities: [], topics: ['typescript', 'security'] })
    const elsewhere = skill('elsewhere', { affinities: [], topics: ['mobile'] })
    const opposed = skill('opposed', { topics: ['typescript'] })
    const result = match({ 'typescript.any': 'disagree' }, [tagged, elsewhere, opposed])
    expect(result.compatible.map((item) => [item.id, item.score])).toEqual([['tagged', 0]])
    expect(result.conflicting.map((item) => item.id)).toEqual(['opposed'])
  })

  it('puts an affinity before a tag, then the skills sharing more tags first', () => {
    const one = skill('one', { affinities: [], topics: ['typescript'] })
    const two = skill('two', { affinities: [], topics: ['typescript', 'workflow'] })
    const held = { 'typescript.any': 'agree', 'workflow.changes': 'agree' }
    const ids = match(held, [one, two, strictTyping]).compatible.map((item) => item.id)
    expect(ids).toEqual(['strict-typing', 'two', 'one'])
  })

  it('orders by score then catalog order, and keeps 5 compatible and 3 conflicting at most', () => {
    const twoPoints = skill('two-points', {
      affinities: [
        { slot: 'typescript.any', values: ['agree'], against: ['disagree'] },
        { slot: 'workflow.changes', values: ['agree'], against: ['disagree'] },
      ],
    })
    const many = Array.from({ length: 7 }, (_, index) => skill(`skill-${index}`))
    const agree = { 'typescript.any': 'agree', 'workflow.changes': 'agree' }
    const compatible = match(agree, [...many, twoPoints]).compatible
    expect(compatible.map((item) => item.id)).toEqual([
      'two-points',
      'skill-0',
      'skill-1',
      'skill-2',
      'skill-3',
    ])
    expect(compatible).toHaveLength(COMPATIBLE_SKILLS_MAX)

    // Conflicting skills come by number of reasons.
    const disagree = { 'typescript.any': 'disagree', 'workflow.changes': 'disagree' }
    const conflicting = match(disagree, [...many, twoPoints]).conflicting
    expect(conflicting.map((item) => item.id)).toEqual(['two-points', 'skill-0', 'skill-1'])
    expect(conflicting).toHaveLength(CONFLICTING_SKILLS_MAX)
  })

  it('counts +1 when the project holds a diagram of one of the kinds, never −1', () => {
    const c4 = skill('c4', { affinities: [{ diagramKinds: ['c4', 'component'] }] })
    expect(match({}, [c4], ['claude-code'], ['sequence', 'component']).compatible).toMatchObject([
      { id: 'c4', score: 1 },
    ])
    expect(match({}, [c4], ['claude-code'], ['sequence'])).toEqual({
      compatible: [],
      conflicting: [],
    })
  })

  it('falls back to English when a description has no French, and copies the audits', () => {
    const found = skill('found', {
      description: { en: 'Only English.' },
      origin: 'search',
      provenance: {
        registry: 'skills.sh',
        id: 'someone/skills/found',
        installs: 1200,
        audits: [{ provider: 'snyk', risk: 'low', analyzedAt: '2026-11-01T00:00:00.000Z' }],
        checkedOn: '2026-11-08',
        contentSha: 'a'.repeat(40),
      },
    })
    expect(match({ 'typescript.any': 'agree' }, [found]).compatible[0]).toMatchObject({
      description: { en: 'Only English.', fr: 'Only English.' },
      audits: [{ provider: 'snyk', risk: 'low', analyzedAt: '2026-11-01T00:00:00.000Z' }],
    })
  })

  it('is deterministic, whatever the order the rules are given in', () => {
    const held = {
      'typescript.any': 'disagree',
      'workflow.changes': 'agree',
      'testing.levels': ['unit', 'e2e'],
    }
    const e2e = skill('e2e', { affinities: [{ slot: 'testing.levels', values: ['e2e'] }] })
    const first = match(held, [strictTyping, e2e])
    expect(JSON.stringify(match(held, [strictTyping, e2e]))).toBe(JSON.stringify(first))
    const reversed = matchSkills(
      {
        packs: [frontendReact],
        ready: ready(held).reverse(),
        targets: ['claude-code'],
        diagramKinds: [],
      },
      [strictTyping, e2e],
    )
    expect(reversed).toEqual(first)
  })
})

describe('matchSkills with the real catalog', () => {
  const suggest = (held: Held) =>
    matchSkills(
      { packs: RULE_PACKS, ready: ready(held), targets: ['claude-code'], diagramKinds: [] },
      SKILLS,
    )

  it('suggests skills for a configuration that asks for small changes and tests', () => {
    const result = suggest({
      'workflow.changes': 'agree',
      'testing.levels': 'unit',
      'workflow.autonomy': 'disagree',
    })
    expect(result.compatible.map((item) => item.id)).toContain('test-driven-development')
    expect(result.conflicting.map((item) => item.id)).toEqual(['brainstorming', 'writing-plans'])
  })

  it('counts the rule that makes the assistant ask before writing as asking first', () => {
    const result = suggest({ 'workflow.autonomy': 'ask-before-writing' })
    expect(result.compatible.map((item) => item.id)).toContain('brainstorming')
    expect(result.conflicting).toEqual([])
  })
})

describe('matchSkills with computed affinities', () => {
  /** Computed affinities from a table of cosines keyed by `pairKey`. */
  function computed(
    cosines: Record<string, number>,
    decisions: Record<string, AffinityDecision> = {},
    duplicateOf: Record<string, string> = {},
  ): ComputedAffinities {
    return {
      threshold: COMPUTED_AFFINITY_THRESHOLD.value,
      cosine: (id, slot, rule) => cosines[pairKey(id, slot, rule)],
      decisions: new Map(Object.entries(decisions)),
      duplicateOf: new Map(Object.entries(duplicateOf)),
    }
  }

  function matchComputed(held: Held, skills: Skill[], affinities: ComputedAffinities) {
    return matchSkills(
      {
        packs: [frontendReact],
        ready: ready(held),
        targets: ['claude-code'],
        diagramKinds: [],
        computed: affinities,
      },
      skills,
    )
  }

  const router = skill('router', { affinities: [], topics: ['frontend'] })
  const other = skill('other', { affinities: [], topics: ['frontend'] })
  const routed = { 'frontend.routing': 'react-router' }
  const noRouter = { 'frontend.routing': 'none' }
  const noRouterPair = pairKey('router', 'frontend.routing', 'none')

  it('counts +1 for a pair at the threshold, 0 below it', () => {
    const key = pairKey('router', 'frontend.routing', 'react-router')
    expect(matchComputed(routed, [router], computed({ [key]: 0.656 })).compatible).toMatchObject([
      { id: 'router', score: 1 },
    ])
    expect(matchComputed(routed, [router], computed({ [key]: 0.655 }))).toEqual({
      compatible: [],
      conflicting: [],
    })
  })

  it('no longer makes a skill compatible by a shared tag alone', () => {
    expect(match(routed, [router]).compatible).toHaveLength(1)
    expect(matchComputed(routed, [router], computed({})).compatible).toEqual([])
  })

  it('gives no automatic suggestion for a marked rule, but counts a pair the admin accepted', () => {
    const high = { [noRouterPair]: 0.9 }
    expect(matchComputed(noRouter, [router], computed(high)).compatible).toEqual([])
    expect(
      matchComputed(noRouter, [router], computed(high, { [noRouterPair]: 'accepted' })).compatible,
    ).toMatchObject([{ id: 'router', score: 1 }])
  })

  it('ignores a pair the admin rejected, and makes a conflict of one marked against', () => {
    const key = pairKey('router', 'frontend.routing', 'react-router')
    expect(
      matchComputed(routed, [router], computed({ [key]: 0.9 }, { [key]: 'rejected' })),
    ).toEqual({ compatible: [], conflicting: [] })
    const against = matchComputed(noRouter, [router], computed({}, { [noRouterPair]: 'against' }))
    expect(against.compatible).toEqual([])
    expect(against.conflicting).toMatchObject([
      { id: 'router', score: -1, reasons: [{ slot: 'frontend.routing' }] },
    ])
    const group = findRuleGroup([frontendReact], 'frontend.routing')
    const titles = (id: string) => group?.rules.find((rule) => rule.id === id)?.label?.en
    const reason = against.conflicting[0]?.reasons[0]
    expect(reason?.yourAnswer.en).toBe(titles('none'))
    // The skill expects any other answer of the group.
    expect(reason?.skillExpects.en).toContain(titles('react-router'))
    expect(reason?.skillExpects.en).not.toContain(titles('none'))
  })

  it('counts a rule once when a written affinity already fits it', () => {
    const key = pairKey('strict-typing', 'typescript.any', 'agree')
    const result = matchComputed(
      { 'typescript.any': 'agree' },
      [strictTyping],
      computed({ [key]: 0.9 }),
    )
    expect(result.compatible).toMatchObject([{ id: 'strict-typing', score: 1 }])
  })

  const cosines = {
    [pairKey('router', 'frontend.routing', 'react-router')]: 0.7,
    [pairKey('other', 'frontend.routing', 'react-router')]: 0.8,
  }

  it('sorts by score, then by the best cosine, before the catalog order', () => {
    expect(
      matchComputed(routed, [router, other], computed(cosines)).compatible.map((item) => item.id),
    ).toEqual(['other', 'router'])
  })

  it('skips a skill whose near duplicate is already listed', () => {
    const result = matchComputed(
      routed,
      [router, other],
      computed(cosines, {}, { other: 'router' }),
    )
    expect(result.compatible.map((item) => item.id)).toEqual(['other'])
  })
})
