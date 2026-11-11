import { APICallError } from 'ai'
import { describe, expect, it } from 'vitest'
import { LlmCallError } from './failure.ts'
import { type FeedbackSource, feedbackPrompt, proposeFeedbackRules } from './feedback.ts'
import { answeringModel, failingModel } from './testing/mock-model.ts'

function source(overrides: Partial<FeedbackSource> = {}): FeedbackSource {
  return {
    feedback: 'Again a raw fetch in a component. Use the query hooks, third time I say it.',
    sections: ['Project', 'Working style', 'Testing'],
    existing: [{ section: 'Testing', text: 'Write a test for every bug fix.' }],
    ...overrides,
  }
}

const answer = (proposals: unknown[]) => JSON.stringify({ proposals })

describe('proposeFeedbackRules', () => {
  it('keeps only valid proposals that are not already rules', async () => {
    const model = answeringModel(
      answer([
        { section: 'Working style', text: 'Never call `fetch` in a component.' },
        { section: 'Security', text: 'Never log secrets.' },
        { section: 'Testing', text: 'write a test for every bug fix' },
        { section: 'Working style', text: 'Never call `fetch` in a component.' },
      ]),
    )
    expect(await proposeFeedbackRules(model, source())).toEqual({
      proposals: [
        { section: 'Working style', text: 'Never call `fetch` in a component.', basedOn: null },
      ],
      truncated: false,
    })
  })

  it('sends the feedback as data, with what is already present', async () => {
    const model = answeringModel(answer([]))
    await proposeFeedbackRules(model, source())
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('<feedback>')
    expect(prompt).toContain('Again a raw fetch in a component.')
    expect(prompt).toContain('Write a test for every bug fix.')
  })

  it('cuts the end of a feedback past the budget', async () => {
    const model = answeringModel(answer([]))
    const result = await proposeFeedbackRules(
      model,
      source({ feedback: `START ${'x'.repeat(8000)} END` }),
      { maxInputTokens: 1000 },
    )
    expect(result.truncated).toBe(true)
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('START')
    expect(prompt).not.toContain('END')
  })

  it('calls no model when there is nothing to read', async () => {
    const model = answeringModel(answer([]))
    expect(await proposeFeedbackRules(model, source({ feedback: '  ' }))).toEqual({
      proposals: [],
      truncated: false,
    })
    expect(model.doGenerateCalls).toHaveLength(0)
  })

  it('reduces a provider failure to its reason', async () => {
    const error = new APICallError({
      message: 'Unauthorized',
      url: 'https://api.example.test',
      requestBodyValues: {},
      statusCode: 401,
    })
    await expect(proposeFeedbackRules(failingModel(error), source())).rejects.toBeInstanceOf(
      LlmCallError,
    )
  })

  it('writes an empty list of present rules as none', () => {
    expect(feedbackPrompt('x', ['Testing'], [])).toContain('- (none)')
  })
})
