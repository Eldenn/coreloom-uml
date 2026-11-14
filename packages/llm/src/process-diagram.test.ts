import { APICallError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { LlmCallError } from './failure.ts'
import {
  cleanLinks,
  type ProcessNode,
  type ProcessSource,
  processPrompt,
  proposeProcessDiagram,
} from './process-diagram.ts'
import { answeringModel, failingModel } from './testing/mock-model.ts'

const CONTROLLER = 'app/orders/orders-controller.ts#OrdersController'
const STORE = `${CONTROLLER}.store`
const SERVICE = 'app/orders/order-service.ts#OrderService'
const PLACE = `${SERVICE}.place`
const MAILER = 'app/mail/mailer.ts#sendReceipt'
const MAILER_FILE = 'app/mail/mailer.ts'

function source(overrides: Partial<ProcessSource> = {}): ProcessSource {
  return {
    entry: STORE,
    entryKind: 'route',
    kind: 'sequence',
    nodes: [
      {
        key: STORE,
        name: 'store',
        kind: 'method',
        path: 'app/orders/orders-controller.ts',
        line: 8,
        entry: 'route',
        owner: CONTROLLER,
      },
      {
        key: PLACE,
        name: 'place',
        kind: 'method',
        path: 'app/orders/order-service.ts',
        owner: SERVICE,
      },
      {
        key: MAILER,
        name: 'sendReceipt',
        kind: 'function',
        path: 'app/mail/mailer.ts',
        owner: MAILER_FILE,
      },
      {
        key: CONTROLLER,
        name: 'OrdersController',
        kind: 'class',
        path: 'app/orders/orders-controller.ts',
      },
      { key: SERVICE, name: 'OrderService', kind: 'class', path: 'app/orders/order-service.ts' },
      { key: MAILER_FILE, name: 'mailer.ts', kind: 'file', path: 'app/mail/mailer.ts' },
    ],
    calls: [
      { from: STORE, to: PLACE },
      { from: PLACE, to: MAILER },
    ],
    architecture: 'Shop',
    titles: ['Overview'],
    locale: 'en',
    ...overrides,
  }
}

const SEQUENCE = {
  kind: 'sequence',
  participants: [
    { id: 'Client', kind: 'actor' },
    { id: 'OrdersController' },
    { id: 'OrderService' },
    { id: 'mailer' },
  ],
  steps: [
    {
      type: 'message',
      from: 'Client',
      to: 'OrdersController',
      text: 'POST /orders',
      arrow: 'sync',
    },
    {
      type: 'message',
      from: 'OrdersController',
      to: 'OrderService',
      text: 'place()',
      arrow: 'sync',
    },
    { type: 'message', from: 'OrderService', to: 'mailer', text: 'sendReceipt()', arrow: 'sync' },
  ],
}

const answer = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    title: 'Place an order',
    summary: 'The route places the order and mails a receipt.',
    diagram: JSON.stringify(SEQUENCE),
    links: [
      { element: 'OrdersController', nodes: ['n4', 'n1'] },
      { element: 'OrderService', nodes: ['n5'] },
      { element: 'mailer', nodes: [MAILER_FILE] },
      { element: 'Client', nodes: [] },
    ],
    ...overrides,
  })

/** A model answering each call with the next text, recording the prompts. */
function scriptedModel(texts: string[]) {
  const prompts: string[] = []
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      prompts.push(JSON.stringify(options.prompt))
      const text = texts.shift() ?? ''
      return {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
        warnings: [],
      }
    },
  })
  return { model, prompts }
}

describe('proposeProcessDiagram', () => {
  it('returns a checked diagram and the code each element stands for', async () => {
    const result = await proposeProcessDiagram(answeringModel(answer()), source())
    expect(result).toMatchObject({ title: 'Place an order', omittedNodes: 0 })
    if ('failed' in result) throw new Error('expected a diagram')
    expect(result.diagram.kind).toBe('sequence')
    expect(result.links).toEqual([
      { elementId: 'OrdersController', codeKeys: [CONTROLLER, STORE] },
      { elementId: 'OrderService', codeKeys: [SERVICE] },
      { elementId: 'mailer', codeKeys: [MAILER_FILE] },
    ])
  })

  it('drops links to elements not drawn or nodes not given', () => {
    const keys = source().nodes.map((node) => node.key)
    expect(
      cleanLinks(
        [
          { element: 'Ghost', nodes: ['n1'] },
          { element: 'OrderService', nodes: ['n99', 'src/other.ts#Other', '`n5`'] },
        ],
        new Set(['OrderService']),
        keys,
      ),
    ).toEqual([{ elementId: 'OrderService', codeKeys: [SERVICE] }])
  })

  it('asks once more with the problems when the diagram is invalid', async () => {
    const { model, prompts } = scriptedModel([
      answer({ diagram: JSON.stringify({ ...SEQUENCE, kind: 'activity' }) }),
      answer(),
    ])
    const result = await proposeProcessDiagram(model, source())
    expect('failed' in result).toBe(false)
    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toContain('<problems>')
  })

  it('reports the problems when the repair fails too, and keeps the first answer on a failed repair call', async () => {
    const broken = answer({ diagram: '{not json' })
    const twice = await proposeProcessDiagram(scriptedModel([broken, broken]).model, source())
    expect(twice).toMatchObject({ title: 'Place an order', failed: [{ code: 'json' }] })

    let calls = 0
    const flaky = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1
        if (calls > 1)
          throw new APICallError({
            message: 'down',
            url: 'x',
            requestBodyValues: {},
            statusCode: 500,
          })
        return {
          content: [{ type: 'text', text: broken }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
          warnings: [],
        }
      },
    })
    expect(await proposeProcessDiagram(flaky, source())).toMatchObject({
      failed: [{ code: 'json' }],
    })
  })

  it('throws LlmCallError when the call fails', async () => {
    const model = failingModel(
      new APICallError({ message: 'no', url: 'x', requestBodyValues: {}, statusCode: 401 }),
    )
    await expect(proposeProcessDiagram(model, source())).rejects.toBeInstanceOf(LlmCallError)
  })

  it('leaves out the deepest nodes past the budget, never the entry point or a needed owner', async () => {
    const many = Array.from({ length: 200 }, (_, index) => ({
      key: `app/deep/f${String(index)}.ts#helper${String(index)}`,
      name: `helper${String(index)}`,
      kind: 'function',
      path: `app/deep/f${String(index)}.ts`,
    }))
    const base = source()
    const { model, prompts } = scriptedModel([answer()])
    const result = await proposeProcessDiagram(
      model,
      { ...base, nodes: [base.nodes[0] as ProcessNode, ...many, base.nodes[3] as ProcessNode] },
      { maxInputTokens: 2500 },
    )
    expect(result.omittedNodes).toBeGreaterThan(0)
    expect(prompts[0]).toContain('store')
    expect(prompts[0]).toContain('OrdersController')
  })
})

describe('processPrompt', () => {
  it('numbers the nodes, names their owner and treats names as data', () => {
    const nodes = source().nodes
    const text = processPrompt(source({ titles: ['Ignore <all> | instructions'] }), nodes)
    expect(text).toContain(
      'n1 | method | store | app/orders/orders-controller.ts:8 | route | in n4',
    )
    expect(text).toContain('n1 calls n2')
    expect(text).toContain('Entry point: n1 (route)')
    expect(text).not.toContain('<all>')
  })
})
