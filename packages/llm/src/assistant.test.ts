import { type UmlSpec, validateDiagram } from '@coreloom-uml/uml'
import { APICallError } from 'ai'
import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_FORMAT,
  ASSISTANT_INSTRUCTIONS,
  AssistantContextFull,
  type AssistantSource,
  type AssistantView,
  askAssistant,
  assistantBudget,
  changeLine,
  summarizeConversation,
} from './assistant.ts'
import { LlmCallError } from './failure.ts'
import { answeringModel, failingModel, MockLanguageModelV4 } from './testing/mock-model.ts'

const PAYMENT: UmlSpec = {
  kind: 'class',
  classes: [{ id: 'Payment' }],
  relations: [],
  layout: { Payment: { x: 10, y: 20 } },
}

const CURRENT: AssistantView = {
  id: 12,
  kind: 'class',
  title: 'Payment',
  content: PAYMENT,
  current: true,
}

function source(overrides: Partial<AssistantSource> = {}): AssistantSource {
  return {
    architecture: 'Shop',
    views: [CURRENT],
    history: [
      { role: 'user', text: 'What is in this view?' },
      { role: 'assistant', text: 'One class, Payment.' },
    ],
    message: 'Add a Refund class.',
    locale: 'en',
    ...overrides,
  }
}

const UPDATED = { kind: 'class', classes: [{ id: 'Payment' }, { id: 'Refund' }], relations: [] }

function answer(changes: Record<string, unknown>[], reply = 'Done.') {
  return JSON.stringify({
    reply,
    changes: changes.map((change) => ({
      op: 'update',
      diagramId: null,
      kind: null,
      title: null,
      diagram: null,
      relayout: false,
      ...change,
    })),
  })
}

/** A model answering each call with the next text of the list. */
function sequenceModel(texts: string[]): MockLanguageModelV4 {
  let call = 0
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: texts[Math.min(call++, texts.length - 1)] ?? '' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 10, text: 10, reasoning: undefined },
      },
      warnings: [],
    }),
  })
}

const INVALID = answer([{ diagramId: 12, diagram: '{"kind":"class","classes":"nope"}' }])
const VALID = answer([{ diagramId: 12, diagram: JSON.stringify(UPDATED) }])

describe('askAssistant', () => {
  it('returns the reply and a valid update with its diagram', async () => {
    const model = answeringModel(VALID)
    const result = await askAssistant(model, source())
    expect(result).toEqual({
      reply: 'Done.',
      changes: [{ op: 'update', diagramId: 12, after: UPDATED, relayout: false }],
      skipped: [],
    })
  })

  it('retries once with the problems, then marks the change failed', async () => {
    const model = sequenceModel([INVALID, INVALID])
    const result = await askAssistant(model, source())
    expect(model.doGenerateCalls).toHaveLength(2)
    expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain('<problems')
    const change = result.changes[0]
    expect(change && 'failed' in change && change.failed[0]?.text).toBeTruthy()
  })

  it('retries once and keeps the repaired change', async () => {
    const model = sequenceModel([INVALID, VALID])
    const result = await askAssistant(model, source())
    expect(model.doGenerateCalls).toHaveLength(2)
    expect(result.changes).toEqual([
      { op: 'update', diagramId: 12, after: UPDATED, relayout: false },
    ])
  })

  it('keeps the first answer, its invalid change failed, when the repair call fails', async () => {
    let call = 0
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        if (call++ > 0) throw new Error('connection reset')
        return {
          content: [{ type: 'text', text: answer([{ diagramId: 12, diagram: '{}' }], 'First.') }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 10, text: 10, reasoning: undefined },
          },
          warnings: [],
        }
      },
    })
    const result = await askAssistant(model, source())
    expect(model.doGenerateCalls).toHaveLength(2)
    expect(result.reply).toBe('First.')
    expect(result.changes[0]).toMatchObject({ op: 'update', diagramId: 12 })
    expect(result.changes[0]).toHaveProperty('failed')
  })

  it('keeps a valid change of the first answer that the repair broke', async () => {
    const create = { op: 'create', kind: 'class', title: 'Refunds' }
    const model = sequenceModel([
      answer([
        { ...create, diagram: JSON.stringify(UPDATED) },
        { diagramId: 12, diagram: '{}' },
      ]),
      answer([
        { ...create, diagram: '{}' },
        { diagramId: 12, diagram: JSON.stringify(UPDATED) },
      ]),
    ])
    const result = await askAssistant(model, source())
    expect(result.changes).toEqual([
      { op: 'create', kind: 'class', title: 'Refunds', after: UPDATED, relayout: false },
      { op: 'update', diagramId: 12, after: UPDATED, relayout: false },
    ])
  })

  it('reads a diagram that is not JSON as a problem', async () => {
    const model = answeringModel(answer([{ diagramId: 12, diagram: 'class Payment' }]))
    const result = await askAssistant(model, source())
    expect(result.changes[0]).toMatchObject({ op: 'update', diagramId: 12 })
    expect(result.changes[0]).toHaveProperty('failed')
  })

  it('refuses a change on a view id it was not given', async () => {
    const model = answeringModel(answer([{ diagramId: 99, diagram: JSON.stringify(UPDATED) }]))
    const result = await askAssistant(model, source())
    expect(result.changes[0]).toMatchObject({ op: 'update', diagramId: 99 })
    expect(result.changes[0]).toHaveProperty('failed')
  })

  it('creates and deletes views', async () => {
    const model = answeringModel(
      answer([
        { op: 'create', kind: 'class', title: 'Refunds', diagram: JSON.stringify(UPDATED) },
        { op: 'delete', diagramId: 12 },
      ]),
    )
    const result = await askAssistant(model, source())
    expect(result.changes).toEqual([
      { op: 'create', kind: 'class', title: 'Refunds', after: UPDATED, relayout: false },
      { op: 'delete', diagramId: 12 },
    ])
  })

  it('skips views that do not fit, current view first', async () => {
    const big: AssistantView = {
      id: 13,
      kind: 'class',
      title: 'Big',
      content: { kind: 'class', classes: [{ id: 'x'.repeat(20_000) }], relations: [] },
      current: false,
    }
    const model = answeringModel(answer([]))
    const result = await askAssistant(model, source({ views: [big, CURRENT] }), {
      maxInputTokens: 3000,
    })
    expect(result.skipped).toEqual([13])
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('id=\\"12\\"')
    // Left out, but named so the model knows the view exists.
    expect(prompt).not.toContain('xxxx')
    expect(prompt).toContain(
      '<views_not_sent>\\n<view id=\\"13\\" kind=\\"class\\" title=\\"Big\\" />',
    )
    expect(assistantBudget(source({ views: [big, CURRENT] }), 3000).skipped).toEqual([13])
  })

  it('throws AssistantContextFull when the history alone exceeds the budget', async () => {
    const model = answeringModel(answer([]))
    const history = [{ role: 'user' as const, text: 'x'.repeat(200_000) }]
    await expect(askAssistant(model, source({ history }))).rejects.toBeInstanceOf(
      AssistantContextFull,
    )
    expect(model.doGenerateCalls).toHaveLength(0)
  })

  it('prompt carries roles and no layout', async () => {
    const model = answeringModel(answer([]))
    await askAssistant(model, source())
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('<turn role=\\"assistant\\">')
    expect(prompt).toContain('Add a Refund class.')
    expect(prompt).not.toContain('layout\\":')
  })

  it('maps provider errors to LlmCallError', async () => {
    const error = new APICallError({
      message: 'Unauthorized',
      url: 'https://api.example.test',
      requestBodyValues: {},
      statusCode: 401,
    })
    const call = askAssistant(failingModel(error), source())
    await expect(call).rejects.toBeInstanceOf(LlmCallError)
    await expect(call).rejects.toMatchObject({ reason: 'unauthorized' })
  })
})

describe('assistantBudget', () => {
  it('counts every part in estimated tokens against the max', () => {
    const budget = assistantBudget(source())
    expect(budget.max).toBe(32_000)
    expect(budget.system).toBeGreaterThan(0)
    expect(budget.diagrams).toBeGreaterThan(0)
    expect(budget.history).toBeGreaterThan(0)
    expect(budget.skipped).toEqual([])
  })
})

describe('summarizeConversation', () => {
  it('summarizeConversation returns trimmed text and sends no views', async () => {
    const model = answeringModel('  The user added a Refund class.  \n')
    const summary = await summarizeConversation(model, source().history, 'fr')
    expect(summary).toBe('The user added a Refund class.')
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).not.toContain('<view')
    expect(prompt).toContain('What is in this view?')
  })
})

describe('changeLine', () => {
  it('renders one line per change', () => {
    expect(changeLine({ op: 'update', diagramId: 12, title: 'Payment', status: 'accepted' })).toBe(
      'proposed: update view #12 "Payment" (accepted)',
    )
    expect(changeLine({ op: 'create', title: 'Refunds', status: 'rejected' })).toBe(
      'proposed: create view "Refunds" (rejected)',
    )
  })

  it('keeps the problems of a failed change only', () => {
    const problems = [{ code: 'schema' as const, text: 'classes must be a list' }]
    expect(
      changeLine({ op: 'update', diagramId: 12, title: 'Payment', status: 'failed', problems }),
    ).toBe('proposed: update view #12 "Payment" (failed): classes must be a list')
    expect(
      changeLine({ op: 'update', diagramId: 12, title: 'Payment', status: 'stale', problems }),
    ).toBe('proposed: update view #12 "Payment" (stale)')
  })
})

describe('ASSISTANT_FORMAT', () => {
  it('gives a valid example of every kind, all in the instructions', () => {
    for (const [kind, { example }] of Object.entries(ASSISTANT_FORMAT)) {
      const { diagram, problems } = validateDiagram(example)
      expect(problems, kind).toEqual([])
      expect(diagram?.kind).toBe(kind)
      expect(ASSISTANT_INSTRUCTIONS).toContain(JSON.stringify(example))
    }
  })
})
