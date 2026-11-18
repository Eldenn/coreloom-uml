import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SOURCE_INSTRUCTIONS } from './source-excerpts.ts'
import {
  proposeStructureDiagram,
  type StructureSource,
  structurePrompt,
} from './structure-diagram.ts'
import { answeringModel } from './testing/mock-model.ts'

const ORDERS = 'app/orders/'
const MAIL = 'app/mail/'

function source(overrides: Partial<StructureSource> = {}): StructureSource {
  return {
    kind: 'package',
    nodes: [
      { key: ORDERS, name: 'orders', kind: 'folder', path: 'app/orders', files: 12 },
      { key: MAIL, name: 'mail', kind: 'folder', path: 'app/mail', files: 3 },
      {
        key: 'app/orders/order-service.ts',
        name: 'order-service.ts',
        kind: 'file',
        path: 'app/orders/order-service.ts',
        owner: ORDERS,
      },
      { key: 'module:stripe', name: 'stripe', kind: 'module', context: true },
    ],
    edges: [
      { from: ORDERS, to: MAIL, kind: 'imports', count: 4 },
      { from: ORDERS, to: 'module:stripe', kind: 'imports', count: 2 },
    ],
    architecture: 'Shop',
    titles: ['Overview'],
    request: { title: 'Main parts', reason: 'How orders reach the mailer.' },
    locale: 'en',
    ...overrides,
  }
}

const PACKAGE = {
  kind: 'package',
  elements: [
    { id: 'orders', kind: 'package', label: 'orders' },
    { id: 'mail', kind: 'package', label: 'mail' },
  ],
  relations: [{ from: 'orders', to: 'mail', kind: 'dependency' }],
}

describe('structurePrompt', () => {
  it('numbers the nodes, with their size, holder and context, and the request', () => {
    const prompt = structurePrompt(source(), source().nodes)
    expect(prompt).toContain('n1 | folder | orders | app/orders | 12 files')
    expect(prompt).toContain('n3 | file | order-service.ts | app/orders/order-service.ts | in n1')
    expect(prompt).toContain('n4 | module | stripe | context')
    expect(prompt).toContain('n1 imports n2 (4)')
    expect(prompt).toContain('<request>Main parts: How orders reach the mailer.</request>')
  })
})

describe('proposeStructureDiagram', () => {
  it('returns a checked diagram linked to the folders', async () => {
    const model = answeringModel(
      JSON.stringify({
        title: 'Main parts',
        summary: 'Orders depend on mail.',
        diagram: JSON.stringify(PACKAGE),
        links: [
          { element: 'orders', nodes: ['n1'] },
          { element: 'mail', nodes: ['n2', 'n9'] },
        ],
      }),
    )
    const result = await proposeStructureDiagram(model, source())
    if ('failed' in result) throw new Error(`expected a diagram: ${JSON.stringify(result.failed)}`)
    expect(result.diagram.kind).toBe('package')
    expect(result.links).toEqual([
      { elementId: 'orders', codeKeys: [ORDERS] },
      { elementId: 'mail', codeKeys: [MAIL] },
    ])
  })

  it('leaves out the last nodes past the budget', async () => {
    const nodes = Array.from({ length: 600 }, (_, index) => ({
      key: `app/f${String(index)}/`,
      name: `f${String(index)}`,
      kind: 'folder',
      path: `app/f${String(index)}`,
      files: 2,
    }))
    const model = answeringModel(
      JSON.stringify({ title: 'Parts', summary: '', diagram: JSON.stringify(PACKAGE), links: [] }),
    )
    const result = await proposeStructureDiagram(model, source({ nodes, edges: [] }), {
      maxInputTokens: 2500,
    })
    expect(result.omittedNodes).toBeGreaterThan(0)
  })
})

describe('proposeStructureDiagram with sources', () => {
  const sources = [
    {
      path: 'app/orders/orders-controller.ts',
      text: '1: export class OrdersController {}',
      partial: false,
    },
  ]
  const answer = () =>
    JSON.stringify({ title: 'Parts', summary: '', diagram: JSON.stringify(PACKAGE), links: [] })
  const sent = (model: ReturnType<typeof answeringModel>) =>
    JSON.stringify(model.doGenerateCalls[0]?.prompt)

  it('with sources, the prompt holds the files and the instructions say how to read them', async () => {
    const model = answeringModel(answer())
    await proposeStructureDiagram(model, source({ kind: 'class', sources }))
    const [system, user] = model.doGenerateCalls[0]?.prompt ?? []
    expect(JSON.stringify(system)).toContain(JSON.stringify(SOURCE_INSTRUCTIONS).slice(1, -1))
    expect(JSON.stringify(system)).not.toContain('You never see the source code.')
    expect(JSON.stringify(user)).toContain(
      '<source_file path=\\"app/orders/orders-controller.ts\\">',
    )
    expect(JSON.stringify(user)).toContain('1: export class')
  })

  it('without sources, the instructions and the prompt are what they were', async () => {
    for (const extra of [{}, { sources: [] }]) {
      const model = answeringModel(answer())
      await proposeStructureDiagram(model, source({ kind: 'class', ...extra }))
      const text = sent(model)
      expect(text).toContain('You never see the source code.')
      expect(text).not.toContain('<source_file')
      expect(text).not.toContain(SOURCE_INSTRUCTIONS.slice(0, 40))
      expect(createHash('sha256').update(text).digest('hex')).toBe(
        '86ea01789d56c1928cbb34c9c953fe132fd47b72035cc8cbfdb9354d47714da5',
      )
    }
    expect(structurePrompt(source({ sources: [] }), source().nodes)).toBe(
      structurePrompt(source(), source().nodes),
    )
  })

  it('sources do not count against the nodes: the same nodes are kept with and without them', async () => {
    const nodes = Array.from({ length: 600 }, (_, index) => ({
      key: `app/f${String(index)}/`,
      name: `f${String(index)}`,
      kind: 'folder',
      path: `app/f${String(index)}`,
      files: 2,
    }))
    const big = [{ path: 'app/x.ts', text: 'x'.repeat(40_000), partial: false }]
    const without = answeringModel(answer())
    const withSources = answeringModel(answer())
    const a = await proposeStructureDiagram(without, source({ nodes, edges: [] }), {
      maxInputTokens: 2500,
    })
    const b = await proposeStructureDiagram(
      withSources,
      source({ nodes, edges: [], sources: big }),
      { maxInputTokens: 2500 },
    )
    expect(a.omittedNodes).toBeGreaterThan(0)
    expect(b.omittedNodes).toBe(a.omittedNodes)
    const codeNodes = (text: string) =>
      text.slice(text.indexOf('<code_nodes>'), text.indexOf('</code_nodes>'))
    expect(codeNodes(sent(withSources))).toBe(codeNodes(sent(without)))
  })
})
