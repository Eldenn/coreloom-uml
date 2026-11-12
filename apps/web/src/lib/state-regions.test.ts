import { parseDiagramText, type StateDiagram, validateDiagram } from '@coreloom-uml/uml'
import { describe, expect, it } from 'vitest'

import { STATE_REGIONS_MAX } from '@/lib/uml'

import { addElement, deleteItems } from './uml-edit'
import { elementFields, setElementFields, stateRegionChoices } from './uml-edit-fields'
import { toDiagramGraph } from './uml-graph'
import { layoutDiagram, regionLines } from './uml-layout'

function read(text: string): StateDiagram {
  const { diagram } = parseDiagramText(`stateDiagram-v2\n${text}`, 'mermaid')
  if (diagram?.kind !== 'state') throw new Error('not a state diagram')
  return diagram
}

/** A composite with two regions (Play/Pause, then Loud/Muted) inside an outer composite. */
const PLAYER = `
  [*] --> Outer
  state Outer {
    state Active {
      [*] --> Play
      Play --> Pause : pause
      --
      [*] --> Loud
      Loud --> Muted : mute
    }
    Active --> Off
  }`

function stateOf(d: StateDiagram, id: string) {
  const s = d.states.find((x) => x.id === id)
  if (!s) throw new Error(`no state ${id}`)
  return s
}

function asState(d: unknown): StateDiagram {
  const diagram = d as StateDiagram
  expect(validateDiagram(diagram).problems).toEqual([])
  return diagram
}

describe('adding a state', () => {
  it('joins the region of the selected sibling', () => {
    const { diagram, id } = addElement(read(PLAYER), {
      type: 'state',
      name: 'Quiet',
      near: 'Muted',
    })
    expect(stateOf(asState(diagram), id)).toEqual({ id: 'Quiet', parent: 'Active', region: 1 })
  })

  it('writes no region next to a state of the first region, or inside a composite', () => {
    const d = read(PLAYER)
    const sibling = addElement(d, { type: 'state', name: 'Stop', near: 'Play' })
    expect(stateOf(asState(sibling.diagram), sibling.id)).toEqual({ id: 'Stop', parent: 'Active' })
    const inside = addElement(d, { type: 'state', name: 'Stop', near: 'Active' })
    expect(stateOf(asState(inside.diagram), inside.id)).toEqual({ id: 'Stop', parent: 'Active' })
  })
})

describe('deleting a composite state', () => {
  it('moves its states up without their region', () => {
    const d = asState(deleteItems(read(PLAYER), { elements: ['Active'], relations: [] }))
    for (const id of ['Play', 'Pause', 'Loud', 'Muted'])
      expect(stateOf(d, id)).toEqual({ id, parent: 'Outer' })
  })

  it('keeps the region of states whose parent stays', () => {
    const d = asState(deleteItems(read(PLAYER), { elements: ['Outer'], relations: [] }))
    expect(stateOf(d, 'Active')).toEqual({ id: 'Active' })
    expect(stateOf(d, 'Loud')).toEqual({ id: 'Loud', parent: 'Active', region: 1 })
  })
})

describe('the region field', () => {
  it('is offered to states inside a composite only', () => {
    const d = read(PLAYER)
    expect(elementFields(d, 'Loud')?.region).toBe(1)
    expect(elementFields(d, 'Play')?.region).toBe(0)
    expect(elementFields(d, 'Outer')?.region).toBeUndefined()
    expect(stateRegionChoices(d, 'Outer')).toBeNull()
    expect(stateRegionChoices(d, 'Loud')).toEqual({ regions: [0, 1], next: 2 })
  })

  it('offers no new region to a state alone in its own', () => {
    const alone = setElementFields(read(PLAYER), 'Muted', { name: 'Muted', region: 2 }).diagram
    expect(stateRegionChoices(alone, 'Muted')).toEqual({ regions: [0, 1, 2], next: null })
    expect(stateRegionChoices(alone, 'Loud')).toEqual({ regions: [0, 1, 2], next: null })
    expect(stateRegionChoices(alone, 'Play')).toEqual({ regions: [0, 1, 2], next: 3 })
  })

  it('moves a state to another region, and writes nothing for the first', () => {
    const d = read(PLAYER)
    const moved = asState(setElementFields(d, 'Pause', { name: 'Pause', region: 1 }).diagram)
    expect(stateOf(moved, 'Pause')).toEqual({ id: 'Pause', parent: 'Active', region: 1 })
    const back = asState(setElementFields(d, 'Loud', { name: 'Loud', region: 0 }).diagram)
    expect(stateOf(back, 'Loud')).toEqual({ id: 'Loud', parent: 'Active' })
  })

  it('keeps the region when another field changes, and refuses numbers the schema would', () => {
    const d = read(PLAYER)
    const described = setElementFields(d, 'Loud', { name: 'Loud', description: 'On' }).diagram
    expect(stateOf(asState(described), 'Loud').region).toBe(1)
    for (const region of [STATE_REGIONS_MAX + 1, -1, 1.5]) {
      const out = asState(setElementFields(d, 'Loud', { name: 'Loud', region }).diagram)
      expect(stateOf(out, 'Loud').region).toBeUndefined()
    }
    const top = asState(setElementFields(d, 'Outer', { name: 'Outer', region: 1 }).diagram)
    expect(stateOf(top, 'Outer').region).toBeUndefined()
  })
})

function drawn(d: StateDiagram) {
  const graph = toDiagramGraph(d)
  if (!graph) throw new Error('no graph')
  const boxes = layoutDiagram({
    nodes: graph.nodes,
    edges: graph.edges,
    direction: graph.direction,
    ...(d.layout ? { fixed: d.layout } : {}),
  })
  const box = (id: string) => {
    const b = boxes.get(id)
    if (!b) throw new Error(`no box ${id}`)
    return b
  }
  return { graph, box, lines: regionLines(graph.nodes, boxes, graph.direction) }
}

const FIRST = ['[*]start:Active', 'Play', 'Pause']
const SECOND = ['[*]start:Active:1', 'Loud', 'Muted']

describe('drawing regions', () => {
  it('gives each region its own start, in that region', () => {
    const { graph } = drawn(read(PLAYER))
    const region = (id: string) => graph.nodes.find((n) => n.id === id)?.region
    expect(FIRST.map(region)).toEqual([undefined, undefined, undefined])
    expect(SECOND.map(region)).toEqual([1, 1, 1])
    expect(graph.edges.find((e) => e.target === 'Loud')?.source).toBe('[*]start:Active:1')
    expect(region('Active')).toBeUndefined()
  })

  it('sets the regions side by side, with a line between them', () => {
    const { box, lines } = drawn(read(PLAYER))
    const right = Math.max(...FIRST.map((id) => box(id).x + box(id).width))
    const left = Math.min(...SECOND.map((id) => box(id).x))
    expect(left).toBeGreaterThan(right)
    expect([...lines]).toEqual([['Active', { axis: 'x', at: [(left + right) / 2] }]])
    expect(box('Active').width).toBeGreaterThan(Math.max(...SECOND.map((id) => box(id).x)))
  })

  it('stacks them when the diagram flows left to right', () => {
    const { box, lines } = drawn({ ...read(PLAYER), direction: 'LR' })
    const bottom = Math.max(...FIRST.map((id) => box(id).y + box(id).height))
    const top = Math.min(...SECOND.map((id) => box(id).y))
    expect(top).toBeGreaterThan(bottom)
    expect(lines.get('Active')).toEqual({ axis: 'y', at: [(top + bottom) / 2] })
  })

  it('draws no line in a composite with one region', () => {
    const d = read(PLAYER)
    const one = { ...d, states: d.states.map(({ region: _r, ...s }) => s) }
    expect(drawn(one).lines.size).toBe(0)
  })

  it('follows dragged positions, and draws no line once regions overlap', () => {
    const d = read(PLAYER)
    const auto = drawn(d)
    // Loud dragged under the first region, the rest of its region left where it was: overlap.
    const mixed = { ...d, layout: { Loud: { x: auto.box('Play').x, y: 600 } } }
    expect(drawn(mixed).lines.size).toBe(0)
    // The whole second region dragged below the first: the line turns.
    const below = Object.fromEntries(
      SECOND.map((id, i) => [id, { x: auto.box('Play').x, y: 600 + i * 100 }]),
    )
    const stacked = drawn({ ...d, layout: below })
    expect(stacked.lines.get('Active')?.axis).toBe('y')
    const at = stacked.lines.get('Active')?.at[0] ?? 0
    expect(at).toBeGreaterThan(auto.box('Pause').y + auto.box('Pause').height)
    expect(at).toBeLessThan(600)
  })

  it('still parts the regions that are clear of the others', () => {
    const box = (x: number) => ({ x, y: 40, width: 100, height: 40 })
    const node = (id: string, region: number) => ({
      id,
      parent: 'P',
      region,
      width: 100,
      height: 40,
    })
    const lines = regionLines(
      [{ id: 'P', width: 500, height: 200 }, node('A', 0), node('B', 1), node('C', 2)],
      new Map([
        ['A', box(0)],
        ['B', box(50)],
        ['C', box(300)],
      ]),
    )
    expect([...lines]).toEqual([['P', { axis: 'x', at: [225] }]])
  })
})
