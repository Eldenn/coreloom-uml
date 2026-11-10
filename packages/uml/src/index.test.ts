import { describe, expect, it } from 'vitest'
import {
  detectDiagramTextFormat,
  formatDiagramText,
  parseDiagramText,
  toPlantUml,
  type UmlSpec,
  validateDiagram,
} from './index.ts'

const ORDERS: UmlSpec = {
  kind: 'class',
  title: 'Orders',
  classes: [
    { id: 'Order', attributes: [{ text: 'String id', visibility: 'private' }] },
    { id: 'Customer' },
  ],
  relations: [{ from: 'Customer', to: 'Order', kind: 'association', label: 'places' }],
  layout: { Order: { x: 120, y: 40 } },
}

describe('validateDiagram', () => {
  it('accepts a diagram that matches the schema', () => {
    const result = validateDiagram(ORDERS)
    expect(result.problems).toEqual([])
    expect(result.diagram?.kind).toBe('class')
  })

  it('reports where a diagram departs from the schema', () => {
    const result = validateDiagram({ kind: 'class', classes: [{ label: 'No id' }], relations: [] })
    expect(result.diagram).toBeNull()
    expect(result.problems[0]).toMatchObject({ severity: 'error', code: 'schema' })
    expect(result.problems[0]?.text).toContain('classes.0.id')
  })

  it('refuses an unknown kind', () => {
    expect(validateDiagram({ kind: 'mindmap' }).diagram).toBeNull()
  })
})

describe('text formats', () => {
  it.each([
    'json',
    'mermaid',
    'plantuml',
  ] as const)('round-trips a class diagram as %s', (format) => {
    const text = formatDiagramText(ORDERS, format)
    expect(detectDiagramTextFormat(text)).toBe(format)
    const result = parseDiagramText(text, format)
    expect(result.problems.filter((p) => p.severity === 'error')).toEqual([])
    expect(result.diagram).toMatchObject({
      kind: 'class',
      classes: expect.arrayContaining([
        expect.objectContaining({
          id: 'Order',
          attributes: [{ text: 'String id', visibility: 'private' }],
        }),
      ]),
      layout: { Order: { x: 120, y: 40 } },
    })
  })

  it('writes PlantUML without the layout line when asked', () => {
    const text = toPlantUml(ORDERS, { layout: false })
    expect(text).not.toContain('120')
    expect(text).toBe(toPlantUml({ ...ORDERS, layout: undefined }))
    expect(parseDiagramText(text, 'plantuml').diagram).toMatchObject({ kind: 'class' })
  })

  it('reads Mermaid written by hand', () => {
    const result = parseDiagramText('sequenceDiagram\n  Alice->>Bob: Hello\n', 'mermaid')
    expect(result.diagram?.kind).toBe('sequence')
  })

  it('says when it cannot tell the format', () => {
    expect(detectDiagramTextFormat('just some words')).toBeNull()
  })
})
