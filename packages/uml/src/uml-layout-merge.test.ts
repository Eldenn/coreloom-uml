import { describe, expect, it } from 'vitest'
import { keepLayout, type UmlSpec, umlElementIds, withoutLayout } from './index.ts'

const before: UmlSpec = {
  kind: 'class',
  classes: [{ id: 'A' }, { id: 'B' }],
  relations: [],
  layout: { A: { x: 1, y: 2 }, B: { x: 3, y: 4 } },
}
const after: UmlSpec = {
  kind: 'class',
  classes: [{ id: 'A' }, { id: 'C' }],
  relations: [],
  layout: { C: { x: 9, y: 9 } },
}

describe('keepLayout', () => {
  it('keeps positions of ids still present', () => {
    const result = keepLayout(before, after, false)
    expect(result.diagram).toEqual({ ...after, layout: { A: { x: 1, y: 2 } } })
    expect(result.placed).toBe(1)
  })

  it('drops the layout when relayout is true', () => {
    const result = keepLayout(before, after, true)
    expect('layout' in result.diagram).toBe(false)
    expect(result.placed).toBe(umlElementIds(after).length)
  })

  it('leaves sequence diagrams unchanged', () => {
    const seq: UmlSpec = { kind: 'sequence', participants: [{ id: 'A' }], steps: [] }
    expect(keepLayout(before, seq, false)).toEqual({ diagram: seq, placed: 0 })
  })

  it('places everything when there is no previous diagram', () => {
    const result = keepLayout(null, after, false)
    expect('layout' in result.diagram).toBe(false)
    expect(result.placed).toBe(2)
  })

  it('places an id named like an Object.prototype property', () => {
    const diagram: UmlSpec = { kind: 'class', classes: [{ id: 'toString' }], relations: [] }
    const result = keepLayout({ ...diagram, layout: {} }, diagram, false)
    expect('layout' in result.diagram).toBe(false)
    expect(result.placed).toBe(1)
  })

  it('keeps the position of an id named __proto__', () => {
    const layout = JSON.parse('{"__proto__": {"x": 5, "y": 6}}')
    const diagram: UmlSpec = { kind: 'class', classes: [{ id: '__proto__' }], relations: [] }
    const result = keepLayout({ ...diagram, layout }, diagram, false)
    expect(JSON.stringify(result.diagram)).toBe(
      JSON.stringify({ ...diagram, layout: JSON.parse('{"__proto__": {"x": 5, "y": 6}}') }),
    )
    expect(result.placed).toBe(0)
  })
})

describe('withoutLayout', () => {
  it('removes the layout and keeps the rest', () => {
    const { layout: _layout, ...rest } = before
    expect(withoutLayout(before)).toEqual(rest)
  })
})
