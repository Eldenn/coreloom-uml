import {
  findQuestionnaire,
  MANAGED_BLOCK_BEGIN,
  MANAGED_BLOCK_END,
  type Questionnaire,
} from '@coreloom-uml/catalog'
import { APICallError } from 'ai'
import { describe, expect, it } from 'vitest'
import { LlmCallError } from './failure.ts'
import { type ImportSource, importAgentFile, withoutManagedBlock } from './import.ts'
import { answeringModel, failingModel } from './testing/mock-model.ts'

const questionnaire = findQuestionnaire('frontend-react') as Questionnaire
const Q = 'frontend-react'

function source(overrides: Partial<ImportSource> = {}): ImportSource {
  return {
    questionnaires: [questionnaire],
    answers: [{ questionnaireId: Q, questionId: 'styling', value: 'tailwind' }],
    sections: ['Project', 'Architecture', 'Working style', 'TypeScript', 'React', 'Testing'],
    existing: [{ section: 'React', text: 'Keep components under 200 lines.' }],
    content: '# Conventions\n\n- Never use any.\n- Use pnpm.\n- Deploy on Fridays only.',
    ...overrides,
  }
}

const reply = (answers: unknown[], rules: unknown[] = []) => JSON.stringify({ answers, rules })

describe('importAgentFile', () => {
  it('keeps the answers that fit their question and are new', async () => {
    const model = answeringModel(
      reply([
        { id: `${Q}/ts-any`, value: 5, evidence: 'Never use\n any.' },
        { id: `${Q}/ts-any`, value: 4, evidence: 'second answer' },
        { id: `${Q}/ts-strict`, value: 'mostly', evidence: 'not an option' },
        { id: `${Q}/components-size`, value: 9, evidence: 'out of the scale' },
        { id: `${Q}/styling`, value: 'tailwind', evidence: 'same as now' },
        { id: `${Q}/tests-level`, value: ['unit', 'none'], evidence: 'exclusive' },
        { id: 'other/question', value: 'x', evidence: 'unknown' },
        { id: `${Q}/state-management`, value: 'Jotai atoms', evidence: 'free text' },
      ]),
    )
    const result = await importAgentFile(model, source())
    expect(result.answers).toEqual([
      { questionnaireId: Q, questionId: 'ts-any', value: 5, evidence: 'Never use any.' },
      {
        questionnaireId: Q,
        questionId: 'state-management',
        value: 'Jotai atoms',
        evidence: 'free text',
      },
    ])
    expect(result.truncated).toBe(false)
  })

  it('drops rules already present or covered by an imported answer', async () => {
    const model = answeringModel(
      reply(
        [{ id: `${Q}/ts-any`, value: 5, evidence: 'Never use any.' }],
        [
          { section: 'Workflow', text: 'Deploy on Fridays only.' },
          { section: 'Working style', text: 'Deploy on Fridays only.' },
          { section: 'React', text: 'keep components under 200 lines' },
          {
            section: 'TypeScript',
            text: 'Never use `any`; prefer `unknown` with narrowing or an explicit type.',
          },
        ],
      ),
    )
    const result = await importAgentFile(model, source())
    expect(result.rules).toEqual([{ section: 'Working style', text: 'Deploy on Fridays only.' }])
  })

  it('never sends the managed block, and cuts a file past the budget', async () => {
    const model = answeringModel(reply([]))
    const content = `Mine.\n${MANAGED_BLOCK_BEGIN}\nGenerated.\n${MANAGED_BLOCK_END}\n${'x'.repeat(20_000)}`
    const result = await importAgentFile(model, source({ content }), { maxInputTokens: 6000 })
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('Mine.')
    expect(prompt).not.toContain('Generated.')
    expect(result.truncated).toBe(true)
  })

  it('calls no model for a file that is only the managed block', async () => {
    const model = answeringModel(reply([]))
    const content = `${MANAGED_BLOCK_BEGIN}\nGenerated.\n${MANAGED_BLOCK_END}\n`
    expect(await importAgentFile(model, source({ content }))).toEqual({
      answers: [],
      rules: [],
      truncated: false,
    })
    expect(model.doGenerateCalls).toHaveLength(0)
  })

  it('reduces a provider failure to its reason', async () => {
    const error = new APICallError({
      message: 'Too many requests',
      url: 'https://api.example.test',
      requestBodyValues: {},
      statusCode: 429,
    })
    await expect(importAgentFile(failingModel(error), source())).rejects.toBeInstanceOf(
      LlmCallError,
    )
  })
})

describe('withoutManagedBlock', () => {
  it('keeps a file with unbalanced markers as it is', () => {
    const text = `Mine.\n${MANAGED_BLOCK_BEGIN}\nno end`
    expect(withoutManagedBlock(text)).toBe(text)
  })
})
