import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { composeQuestionnaires, findQuestionnaire, QUESTIONNAIRES } from './questionnaires/index.ts'
import { type Question, type Questionnaire, questionnaireSchema } from './schemas.ts'
import { RESERVED_SECTIONS, SHARED_SECTIONS, sectionOrder } from './sections.ts'
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

  it('asks the eleven frontend-react questions of the spec', () => {
    expect(frontendReact.version).toBe('1.0.0')
    expect(frontendReact.questions.map((question) => question.id)).toEqual([
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
        'Working style',
        'TypeScript',
        'React',
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
    expect(sectionOrder([frontendReact, disjoint]).slice(2, 5)).toEqual([
      'TypeScript',
      'React',
      'Node',
    ])
  })

  it('refuses a questionnaire listed twice and an empty list', () => {
    expect(composeQuestionnaires([frontendReact, frontendReact]).ok).toBe(false)
    expect(composeQuestionnaires([]).ok).toBe(false)
  })
})
