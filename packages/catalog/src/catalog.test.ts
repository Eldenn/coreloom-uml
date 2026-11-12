import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { composeQuestionnaires, findQuestionnaire, QUESTIONNAIRES } from './questionnaires/index.ts'
import {
  isSlotAffinity,
  type Question,
  type Questionnaire,
  questionnaireSchema,
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

const frontendReact = findQuestionnaire('frontend-react') as Questionnaire

describe('the real catalog', () => {
  it.each(
    QUESTIONNAIRES.map((questionnaire) => [questionnaire.id, questionnaire] as const),
  )('%s passes its schema', (_id, questionnaire) => {
    const result = questionnaireSchema.safeParse(questionnaire)
    expect(result.success ? [] : result.error.issues).toEqual([])
  })

  it('has unique questionnaire ids', () => {
    const ids = QUESTIONNAIRES.map((questionnaire) => questionnaire.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('feeds only registered slots, each from one questionnaire', () => {
    const slots = QUESTIONNAIRES.flatMap((q) => q.questions.map((question) => question.slot))
    for (const slot of slots) expect(Object.keys(SLOTS)).toContain(slot)
    expect(new Set(slots).size).toBe(slots.length)
  })

  it('still asks the eleven frontend-react questions of the spec first', () => {
    const spec = frontendReact.questions.slice(0, 11)
    expect(spec.map((question) => question.id)).toEqual([
      'ts-any',
      'ts-strict',
      'components-size',
      'state-management',
      'styling',
      'tests-level',
      'comments',
      'change-size',
      'ask-before-act',
      'package-manager',
      'checks',
    ])
  })

  it('adds questionnaires that combine with every other one, each with its own sections', () => {
    expect(QUESTIONNAIRES.map((questionnaire) => questionnaire.id)).toEqual([
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
    for (const questionnaire of QUESTIONNAIRES) {
      expect(questionnaire.questions.length).toBeGreaterThanOrEqual(5)
    }
    expect(composeQuestionnaires(QUESTIONNAIRES)).toMatchObject({ ok: true })
    const own = QUESTIONNAIRES.flatMap((questionnaire) => questionnaire.sections)
    expect(new Set(own).size).toBe(own.length)
    expect(sectionOrder(QUESTIONNAIRES).slice(3, -4)).toEqual(own)
  })

  it('never reuses a question id across questionnaires', () => {
    const ids = QUESTIONNAIRES.flatMap((q) => q.questions.map((question) => question.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps every fragment in English, on one line, without markers', () => {
    for (const question of QUESTIONNAIRES.flatMap((questionnaire) => questionnaire.questions)) {
      for (const fragment of question.fragments) {
        expect(fragment.text).not.toMatch(/[\r\n]|coreloom-uml:|[àâçéèêëîïôûùüÿœ]/i)
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

  it('matches every skill affinity to the question that feeds its slot', () => {
    const questions = QUESTIONNAIRES.flatMap((questionnaire) => questionnaire.questions)
    for (const skill of SKILLS) {
      for (const affinity of skill.affinities.filter(isSlotAffinity)) {
        const question = questions.find((item) => item.slot === affinity.slot)
        expect(question, `${skill.id}: no question feeds ${affinity.slot}`).toBeDefined()
        if (affinity.scale) expect(question?.type).toBe('scale')
        if (affinity.values) {
          expect(['single', 'multi']).toContain(question?.type)
          const options = question?.options?.map((option) => option.value) ?? []
          for (const value of affinity.values) expect(options).toContain(value)
        }
      }
    }
  })

  it('gives every search query an affinity that passes the schema and fits its question', () => {
    const questions = QUESTIONNAIRES.flatMap((questionnaire) => questionnaire.questions)
    const queries = SKILL_SEARCH_PLAN.map((item) => item.query)
    expect(new Set(queries).size).toBe(queries.length)
    for (const { query, affinity } of SKILL_SEARCH_PLAN) {
      if (!affinity) continue
      expect(skillAffinitySchema.safeParse(affinity).success, query).toBe(true)
      if (!isSlotAffinity(affinity)) continue
      const question = questions.find((item) => item.slot === affinity.slot)
      if (affinity.scale) expect(question?.type, query).toBe('scale')
      const options = question?.options?.map((option) => option.value) ?? []
      for (const value of affinity.values ?? []) expect(options, query).toContain(value)
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

describe('questionnaireSchema', () => {
  const valid = {
    ...frontendReact,
    questions: [frontendReact.questions[0]],
  }

  it('refuses an unknown slot', () => {
    const questions = [{ ...frontendReact.questions[0], slot: 'typescript.unknown' }]
    expect(questionnaireSchema.safeParse({ ...valid, questions }).success).toBe(false)
  })

  it('refuses a section that is neither its own nor shared', () => {
    const questions = [{ ...frontendReact.questions[0], section: 'Elsewhere' }]
    expect(questionnaireSchema.safeParse({ ...valid, questions }).success).toBe(false)
  })

  it('refuses to declare a shared or reserved section as its own', () => {
    for (const section of [...SHARED_SECTIONS, ...RESERVED_SECTIONS]) {
      expect(questionnaireSchema.safeParse({ ...valid, sections: [section] }).success).toBe(false)
    }
  })

  it('refuses a fragment condition that does not fit the question type', () => {
    const question = {
      ...frontendReact.questions[0],
      fragments: [{ when: { equals: 'all' }, text: 'Never do this.' }],
    }
    expect(questionnaireSchema.safeParse({ ...valid, questions: [question] }).success).toBe(false)
  })

  it('refuses an option value no fragment can match', () => {
    const strict = frontendReact.questions[1]
    const question = { ...strict, fragments: [{ when: { equals: 'maybe' }, text: 'Do this.' }] }
    expect(questionnaireSchema.safeParse({ ...valid, questions: [question] }).success).toBe(false)
  })

  it('refuses a fragment without condition and a two-line fragment', () => {
    const base = frontendReact.questions[0]
    for (const fragment of [
      { when: {}, text: 'Always do this.' },
      { when: { scaleAtLeast: 4 }, text: 'Line one.\nLine two.' },
    ]) {
      const question = { ...base, fragments: [fragment] }
      expect(questionnaireSchema.safeParse({ ...valid, questions: [question] }).success).toBe(false)
    }
  })
})

describe('composeQuestionnaires', () => {
  const backend: Questionnaire = {
    ...frontendReact,
    id: 'backend-node',
    sections: ['Node', 'TypeScript'],
    questions: [
      { ...(frontendReact.questions[0] as Question), id: 'other-question', section: 'Node' },
    ],
  }

  it('returns the sections in render order', () => {
    const composition = composeQuestionnaires([frontendReact])
    expect(composition).toMatchObject({
      ok: true,
      sections: [
        'Project',
        'Architecture',
        'Working style',
        ...frontendReact.sections,
        'Testing',
        'Workflow',
        'Tooling',
        'Project notes',
      ],
    })
  })

  it('refuses two questionnaires feeding the same slot', () => {
    const composition = composeQuestionnaires([frontendReact, backend])
    expect(composition.ok).toBe(false)
    if (!composition.ok) expect(composition.problems[0]).toContain('typescript.any')
  })

  it('merges sections in questionnaire order without duplicates', () => {
    const disjoint = { ...backend, questions: [] } as unknown as Questionnaire
    expect(sectionOrder([frontendReact, disjoint]).slice(3, -4)).toEqual([
      ...frontendReact.sections,
      'Node',
    ])
  })

  it('refuses a questionnaire listed twice and an empty list', () => {
    expect(composeQuestionnaires([frontendReact, frontendReact]).ok).toBe(false)
    expect(composeQuestionnaires([]).ok).toBe(false)
  })
})

describe('skillSchema', () => {
  const valid = {
    id: 'a-skill',
    name: 'A skill',
    description: { en: 'A skill.', fr: 'Un skill.' },
    url: 'https://example.com/a-skill',
    targets: ['cursor'],
    affinities: [{ slot: 'typescript.any', scale: { min: 4, max: 5 } }],
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

  it('refuses an affinity with both or neither of scale and values, or an inverted range', () => {
    for (const affinity of [
      { slot: 'typescript.any' },
      { slot: 'typescript.any', scale: { min: 4, max: 5 }, values: ['x'] },
      { slot: 'typescript.any', scale: { min: 5, max: 4 } },
    ]) {
      expect(skillSchema.safeParse({ ...valid, affinities: [affinity] }).success).toBe(false)
    }
  })
})
