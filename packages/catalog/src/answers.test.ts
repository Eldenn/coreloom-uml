import { describe, expect, it } from 'vitest'
import { answerProblem, fragmentTexts, migrateAnswers } from './answers.ts'
import { findQuestionnaire } from './questionnaires/index.ts'
import type { Question, Questionnaire } from './schemas.ts'

const frontendReact = findQuestionnaire('frontend-react') as Questionnaire
const question = (id: string) => frontendReact.questions.find((item) => item.id === id) as Question

describe('answerProblem', () => {
  it.each([
    ['ts-any', 1, true],
    ['ts-any', 5, true],
    ['ts-any', 0, false],
    ['ts-any', 6, false],
    ['ts-any', 2.5, false],
    ['ts-any', '5', false],
    ['ts-strict', 'all', true],
    ['ts-strict', 'maybe', false],
    ['state-management', 'jotai', true],
    ['state-management', '   ', false],
    ['state-management', 'x'.repeat(501), false],
    ['tests-level', ['unit', 'e2e'], true],
    ['tests-level', ['none'], true],
    ['tests-level', ['none', 'unit'], false],
    ['tests-level', ['unit', 'unit'], false],
    ['tests-level', ['smoke'], false],
    ['tests-level', [], false],
    ['checks', 'pnpm lint', true],
    ['checks', '', false],
    ['checks', 3, false],
  ] as const)('%s = %j fits: %s', (id, value, fits) => {
    expect(answerProblem(question(id), value as never) === null).toBe(fits)
  })
})

describe('fragmentTexts', () => {
  it('follows the spec example for ts-any', () => {
    expect(fragmentTexts(question('ts-any'), 5)).toEqual([
      'Never use `any`; prefer `unknown` with narrowing or an explicit type.',
    ])
    expect(fragmentTexts(question('ts-any'), 1)).toEqual([
      '`any` is acceptable at integration boundaries when typing costs more than it brings; keep it local.',
    ])
    expect(fragmentTexts(question('ts-any'), 3)).toEqual([])
  })

  it('fills {value} with the answer on one line, escaped and cut', () => {
    expect(fragmentTexts(question('checks'), 'pnpm lint\n  && pnpm test')).toEqual([
      'Before handing back, run: pnpm lint && pnpm test.',
    ])
    expect(fragmentTexts(question('checks'), '<b>`rm`</b> *now*')).toEqual([
      'Before handing back, run: \\<b\\>\\`rm\\`\\</b\\> \\*now\\*.',
    ])
    const [long] = fragmentTexts(question('checks'), 'a'.repeat(400))
    expect(long).toHaveLength('Before handing back, run: .'.length + 200)
  })

  it('uses the free-text fragment only for an answer outside the options', () => {
    expect(fragmentTexts(question('state-management'), 'jotai')).toEqual([
      'Shared state is handled with jotai; do not add another state library.',
    ])
    expect(fragmentTexts(question('state-management'), 'zustand')).toEqual([
      'Shared client state lives in Zustand stores; do not add another state library.',
    ])
  })

  it('produces one fragment per picked option', () => {
    expect(fragmentTexts(question('tests-level'), ['e2e', 'unit'])).toHaveLength(2)
  })

  it('produces nothing for an answer that does not fit', () => {
    expect(fragmentTexts(question('ts-any'), 9)).toEqual([])
    expect(fragmentTexts(question('tests-level'), ['none', 'unit'])).toEqual([])
  })
})

describe('migrateAnswers', () => {
  const migrated: Questionnaire = {
    ...frontendReact,
    version: '1.1.0',
    migrations: { styling: { 'styled-components': 'css-modules' }, 'tests-level': { e2e: null } },
  }

  it('replaces or drops removed options and keeps the rest', () => {
    const answers = [
      { questionnaireId: 'frontend-react', questionId: 'styling', value: 'styled-components' },
      { questionnaireId: 'frontend-react', questionId: 'tests-level', value: ['unit', 'e2e'] },
      { questionnaireId: 'frontend-react', questionId: 'ts-any', value: 4 },
      { questionnaireId: 'frontend-react', questionId: 'removed-question', value: 4 },
      { questionnaireId: 'other', questionId: 'styling', value: 'styled-components' },
    ]
    expect(migrateAnswers(migrated, answers)).toEqual([
      { questionnaireId: 'frontend-react', questionId: 'styling', value: 'css-modules' },
      { questionnaireId: 'frontend-react', questionId: 'tests-level', value: ['unit'] },
      { questionnaireId: 'frontend-react', questionId: 'ts-any', value: 4 },
      { questionnaireId: 'other', questionId: 'styling', value: 'styled-components' },
    ])
  })

  it('removes a multiple choice left empty', () => {
    const answers = [
      { questionnaireId: 'frontend-react', questionId: 'tests-level', value: ['e2e'] },
    ]
    expect(migrateAnswers(migrated, answers)).toEqual([])
  })
})
