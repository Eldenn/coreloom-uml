import { describe, expect, it } from 'vitest'
import { COMPATIBLE_SKILLS_MAX, CONFLICTING_SKILLS_MAX, matchSkills } from './match-skills.ts'
import { findQuestionnaire } from './questionnaires/index.ts'
import type { AnswerValue, Questionnaire, Skill } from './schemas.ts'
import { SKILLS } from './skills.ts'

const frontendReact = findQuestionnaire('frontend-react') as Questionnaire

/** A fixture skill on one slot; the real catalog is checked in catalog.test.ts. */
function skill(id: string, overrides: Partial<Skill> = {}): Skill {
  return {
    id,
    name: id,
    description: { en: `${id} (en)`, fr: `${id} (fr)` },
    url: `https://example.com/${id}`,
    targets: ['claude-code'],
    affinities: [{ slot: 'typescript.any', scale: { min: 4, max: 5 } }],
    origin: 'manual',
    ...overrides,
  }
}

function match(
  answers: Record<string, AnswerValue>,
  skills: Skill[],
  targets: Skill['targets'] = ['claude-code'],
  diagramKinds: string[] = [],
) {
  return matchSkills(
    {
      questionnaires: [frontendReact],
      answers: Object.entries(answers).map(([questionId, value]) => ({
        questionnaireId: 'frontend-react',
        questionId,
        value,
      })),
      targets,
      diagramKinds,
    },
    skills,
  )
}

const strictTyping = skill('strict-typing')

describe('matchSkills', () => {
  it('counts +1 for a scale answer in the range: compatible', () => {
    const result = match({ 'ts-any': 5 }, [strictTyping])
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

  it('counts −1 for a scale answer 2 or more away from the range, with a readable reason', () => {
    const result = match({ 'ts-any': 1 }, [strictTyping])
    expect(result.compatible).toEqual([])
    expect(result.conflicting).toHaveLength(1)
    expect(result.conflicting[0]?.reasons).toEqual([
      {
        slot: 'typescript.any',
        questionLabel: frontendReact.questions[0]?.label,
        yourAnswer: { en: '1 of 5', fr: '1 sur 5' },
        skillExpects: { en: '4 to 5 of 5', fr: '4 à 5 sur 5' },
      },
    ])
  })

  it('counts 0 for a scale answer one step away: neither compatible nor conflicting', () => {
    expect(match({ 'ts-any': 3 }, [strictTyping])).toEqual({ compatible: [], conflicting: [] })
  })

  it('ignores an affinity whose slot has no answer', () => {
    expect(match({}, [strictTyping])).toEqual({ compatible: [], conflicting: [] })
  })

  it('counts +1 for a single choice among the values, 0 otherwise', () => {
    const zustand = skill('zustand', {
      affinities: [{ slot: 'react.state', values: ['zustand'] }],
    })
    expect(match({ 'state-management': 'zustand' }, [zustand]).compatible).toHaveLength(1)
    expect(match({ 'state-management': 'redux' }, [zustand])).toEqual({
      compatible: [],
      conflicting: [],
    })
    // A free-text answer is never one of the values.
    expect(match({ 'state-management': 'MobX' }, [zustand]).compatible).toEqual([])
  })

  it('counts +1 for a multiple choice that includes one of the values', () => {
    const e2e = skill('e2e', { affinities: [{ slot: 'testing.levels', values: ['e2e'] }] })
    expect(match({ 'tests-level': ['unit', 'e2e'] }, [e2e]).compatible).toHaveLength(1)
    expect(match({ 'tests-level': ['none'] }, [e2e]).compatible).toEqual([])
  })

  it('makes a skill conflicting as soon as one affinity is −1, whatever the others', () => {
    const mixed = skill('mixed', {
      affinities: [
        { slot: 'typescript.any', scale: { min: 4, max: 5 } },
        { slot: 'workflow.changes', scale: { min: 4, max: 5 } },
        { slot: 'react.state', values: ['zustand'] },
      ],
    })
    const result = match({ 'ts-any': 5, 'change-size': 1, 'state-management': 'zustand' }, [mixed])
    expect(result.compatible).toEqual([])
    expect(result.conflicting[0]).toMatchObject({
      score: 1,
      reasons: [{ slot: 'workflow.changes' }],
    })
  })

  it('never suggests a skill for none of the configuration’s targets', () => {
    const cursorOnly = skill('cursor-only', { targets: ['cursor'] })
    expect(match({ 'ts-any': 5 }, [cursorOnly], ['claude-code'])).toEqual({
      compatible: [],
      conflicting: [],
    })
    expect(match({ 'ts-any': 1 }, [cursorOnly], ['claude-code']).conflicting).toEqual([])
    expect(match({ 'ts-any': 5 }, [cursorOnly], ['claude-code', 'cursor']).compatible).toHaveLength(
      1,
    )
  })

  it('ignores an answer that does not fit its question', () => {
    expect(match({ 'ts-any': 9 }, [strictTyping])).toEqual({ compatible: [], conflicting: [] })
  })

  it('orders by score then catalog order, and keeps 5 compatible and 3 conflicting at most', () => {
    const twoPoints = skill('two-points', {
      affinities: [
        { slot: 'typescript.any', scale: { min: 4, max: 5 } },
        { slot: 'workflow.changes', scale: { min: 4, max: 5 } },
      ],
    })
    const many = Array.from({ length: 7 }, (_, index) => skill(`skill-${index}`))
    const compatible = match({ 'ts-any': 5, 'change-size': 5 }, [...many, twoPoints]).compatible
    expect(compatible.map((item) => item.id)).toEqual([
      'two-points',
      'skill-0',
      'skill-1',
      'skill-2',
      'skill-3',
    ])
    expect(compatible).toHaveLength(COMPATIBLE_SKILLS_MAX)

    const conflicting = match({ 'ts-any': 1, 'change-size': 1 }, [...many, twoPoints]).conflicting
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
    expect(match({ 'ts-any': 5 }, [found]).compatible[0]).toMatchObject({
      description: { en: 'Only English.', fr: 'Only English.' },
      audits: [{ provider: 'snyk', risk: 'low', analyzedAt: '2026-11-01T00:00:00.000Z' }],
    })
  })

  it('is deterministic', () => {
    const answers = { 'ts-any': 1, 'change-size': 5, 'tests-level': ['unit'] }
    expect(JSON.stringify(match(answers, [strictTyping]))).toBe(
      JSON.stringify(match(answers, [strictTyping])),
    )
  })
})

describe('matchSkills with the real catalog', () => {
  it('suggests skills for a configuration that asks for small changes and tests', () => {
    const result = matchSkills(
      {
        questionnaires: [frontendReact],
        answers: [
          { questionnaireId: 'frontend-react', questionId: 'change-size', value: 5 },
          { questionnaireId: 'frontend-react', questionId: 'tests-level', value: ['unit'] },
          { questionnaireId: 'frontend-react', questionId: 'ask-before-act', value: 1 },
        ],
        targets: ['claude-code'],
        diagramKinds: [],
      },
      SKILLS,
    )
    expect(result.compatible.map((item) => item.id)).toContain('test-driven-development')
    expect(result.conflicting.map((item) => item.id)).toEqual(['brainstorming', 'writing-plans'])
  })
})
