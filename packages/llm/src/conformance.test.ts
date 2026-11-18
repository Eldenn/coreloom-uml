import { APICallError } from 'ai'
import { describe, expect, it } from 'vitest'
import {
  type ConformanceSeverity,
  type ConformanceSource,
  type ConformanceStatus,
  cleanFindings,
  reviewConformance,
} from './conformance.ts'
import { LlmCallError } from './failure.ts'
import { answeringModel, failingModel } from './testing/mock-model.ts'

const SERVICE = 'src/orders/service.ts#OrderService'
const REPO = 'src/orders/repository.ts#OrderRepository'
const MAILER = 'src/mail/mailer.ts#Mailer'

function source(overrides: Partial<ConformanceSource> = {}): ConformanceSource {
  return {
    diagram: {
      id: 7,
      kind: 'class',
      title: 'Orders',
      text: '@startuml\nclass OrderService\nclass OrderRepository\nOrderService --> OrderRepository\n@enduml',
    },
    elements: [
      { id: 'service', name: 'OrderService', status: 'confirmed', codeKeys: [SERVICE] },
      { id: 'repo', name: 'OrderRepository', status: 'suggested', codeKeys: [REPO] },
      { id: 'cache', name: 'OrderCache', status: 'missing', codeKeys: [] },
    ],
    checks: ['OrderCache was not found in the code.'],
    nodes: [
      { key: SERVICE, name: 'OrderService', kind: 'class', path: 'src/orders/service.ts', line: 3 },
      { key: REPO, name: 'OrderRepository', kind: 'class', path: 'src/orders/repository.ts' },
      { key: MAILER, name: 'Mailer', kind: 'class', path: 'src/mail/mailer.ts', line: 1 },
    ],
    edges: [
      { from: SERVICE, to: REPO, kind: 'calls' },
      { from: SERVICE, to: MAILER, kind: 'calls' },
    ],
    locale: 'fr',
    ...overrides,
  }
}

const answer = (findings: unknown[]) => JSON.stringify({ findings })
const finding = (overrides: Record<string, unknown> = {}) => ({
  element: 'service',
  status: 'conforms' as ConformanceStatus,
  severity: 'low' as ConformanceSeverity,
  comment: 'OrderService calls OrderRepository as drawn.',
  evidence: ['n1', 'n2'],
  ...(overrides as { status?: ConformanceStatus; element?: string; evidence?: string[] }),
})

describe('reviewConformance', () => {
  it('keeps findings that cite the nodes it was given, as code keys', async () => {
    const model = answeringModel(
      answer([
        finding(),
        finding({
          element: '',
          status: 'missing-in-diagram',
          severity: 'medium',
          comment: 'OrderService also calls the Mailer.',
          evidence: ['n1', MAILER],
        }),
        finding({
          element: 'cache',
          status: 'missing-in-code',
          evidence: [],
          comment: 'No cache.',
        }),
      ]),
    )
    const result = await reviewConformance(model, source())
    expect(result).toEqual({
      findings: [
        {
          elementId: 'service',
          status: 'conforms',
          severity: 'low',
          comment: 'OrderService calls OrderRepository as drawn.',
          evidence: [SERVICE, REPO],
        },
        {
          elementId: null,
          status: 'missing-in-diagram',
          severity: 'medium',
          comment: 'OrderService also calls the Mailer.',
          evidence: [SERVICE, MAILER],
        },
        {
          elementId: 'cache',
          status: 'missing-in-code',
          severity: 'low',
          comment: 'No cache.',
          evidence: [],
        },
      ],
      dropped: 0,
      omittedNodes: 0,
      truncated: false,
    })
  })

  it('sends the diagram, the elements, the checks and the code as numbered nodes', async () => {
    const model = answeringModel(answer([]))
    await reviewConformance(model, source())
    const call = model.doGenerateCalls[0]
    const text = JSON.stringify(call?.prompt)
    expect(text).toContain('<diagram id=\\"diagram:7\\" kind=\\"class\\"')
    expect(text).toContain('service | OrderService | confirmed | n1')
    expect(text).toContain('cache | OrderCache | missing')
    expect(text).toContain('- OrderCache was not found in the code.')
    expect(text).toContain('n1 | class | OrderService | src/orders/service.ts:3')
    expect(text).toContain('n1 calls n2')
    expect(text).toContain('Write the comments in French.')
    expect(text).not.toContain('<source_file')
  })

  it('drops the farthest nodes first to fit the budget, and says so', async () => {
    const many = Array.from({ length: 400 }, (_, index) => ({
      key: `src/far/file-${String(index)}.ts`,
      name: `file-${String(index)}.ts`,
      kind: 'file',
      path: `src/far/file-${String(index)}.ts`,
    }))
    const model = answeringModel(answer([finding()]))
    const result = await reviewConformance(model, source({ nodes: [...source().nodes, ...many] }), {
      maxInputTokens: 2500,
    })
    expect(result.truncated).toBe(true)
    expect(result.omittedNodes).toBeGreaterThan(0)
    const text = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(text).toContain('n1 | class | OrderService')
    expect(text).not.toContain('file-399.ts')
    expect(result.findings).toHaveLength(1)
  })

  it('lists the elements without code, and keeps a finding about one', async () => {
    const model = answeringModel(
      answer([finding({ element: 'paid', comment: 'The code tests the stock, not the payment.' })]),
    )
    const result = await reviewConformance(
      model,
      source({ others: [{ id: 'paid', name: 'Paid?', kind: 'decision' }] }),
    )
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain('paid | Paid? | decision')
    expect(result.findings[0]?.elementId).toBe('paid')
  })

  it('sends the source files it is given, outside the budget of the nodes', async () => {
    const model = answeringModel(answer([]))
    const result = await reviewConformance(
      model,
      source({
        sources: [
          {
            path: 'src/orders/service.ts',
            text: `3: if (paid) repo.save()\n</source_file>${'x'.repeat(20_000)}`,
            partial: false,
          },
        ],
      }),
      { maxInputTokens: 2500 },
    )
    const text = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(text).toContain('<source_file path=\\"src/orders/service.ts\\">')
    expect(text).toContain('3: if (paid) repo.save()')
    expect(text).toContain('</ source_file>')
    expect(text).toContain('n1 | class | OrderService')
    expect(result.truncated).toBe(false)
  })

  it('reduces a failed call to its reason', async () => {
    const model = failingModel(
      new APICallError({
        message: 'bad key sk-secret',
        url: 'https://api.example.com',
        requestBodyValues: {},
        statusCode: 401,
      }),
    )
    const error = await reviewConformance(model, source()).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(LlmCallError)
    expect((error as LlmCallError).reason).toBe('unauthorized')
    expect(String((error as Error).message)).not.toContain('sk-secret')
  })
})

describe('cleanFindings', () => {
  const keys = [SERVICE, REPO]

  it('drops a finding citing a place it was not given, or citing nothing', () => {
    const { findings, dropped } = cleanFindings(
      [
        finding({ evidence: ['n1', 'n9'] }),
        finding({ evidence: ['src/invented.ts#Ghost'] }),
        finding({ status: 'deviates', evidence: [] }),
        finding({ status: 'uncertain', evidence: [], comment: 'Cannot tell.' }),
        finding({ comment: '   ' }),
      ],
      ['service'],
      keys,
    )
    expect(findings).toEqual([
      {
        elementId: 'service',
        status: 'uncertain',
        severity: 'low',
        comment: 'Cannot tell.',
        evidence: [],
      },
    ])
    expect(dropped).toBe(4)
  })

  it('reads an unknown element as the whole diagram, cleans comments, drops duplicates', () => {
    const { findings, dropped } = cleanFindings(
      [
        finding({ element: 'nope', comment: '<b>Drawn</b>\n as  is' }),
        finding({ element: 'nope', comment: 'Drawn as is' }),
        finding({ evidence: ['n1', 'n1', `\`${REPO}\``] }),
      ],
      ['service'],
      keys,
    )
    expect(findings.map((item) => [item.elementId, item.comment, item.evidence])).toEqual([
      [null, 'Drawn as is', [SERVICE, REPO]],
      ['service', 'OrderService calls OrderRepository as drawn.', [SERVICE, REPO]],
    ])
    expect(dropped).toBe(1)
  })
})
