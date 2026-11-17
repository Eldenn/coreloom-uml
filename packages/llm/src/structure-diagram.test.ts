import { describe, expect, it } from 'vitest'
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
