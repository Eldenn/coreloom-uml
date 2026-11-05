import type { EdgeChange, NodeChange } from '@xyflow/react'

import {
  type DiagramFlowEdge,
  type DiagramFlowNode,
  nodeLabel,
} from '@/components/ui/uml-diagram-parts'
import type { Messages } from '@/lib/i18n'
import type { UmlLayout } from '@/lib/uml'
import type { UmlSelection } from '@/lib/uml-edit'
import {
  type DiagramEdge,
  type DiagramGraph,
  type DiagramNode,
  relationIndexOf,
} from '@/lib/uml-graph'
import type { LayoutBox } from '@/lib/uml-layout'

type DiagramText = Messages['diagram']

/** Frames before what they hold: React Flow needs a parent before its children. */
function byDepth(nodes: readonly DiagramNode[]): DiagramNode[] {
  const parent = new Map(nodes.map((n) => [n.id, n.parent]))
  const depth = (id: string) => {
    let d = 0
    let p = parent.get(id)
    while (p && d < 50) {
      d++
      p = parent.get(p)
    }
    return d
  }
  return [...nodes].sort((a, b) => depth(a.id) - depth(b.id))
}

const NODE_TYPE = {
  box: 'box',
  rounded: 'box',
  person: 'box',
  note: 'box',
  start: 'pseudo',
  end: 'pseudo',
  choice: 'pseudo',
  bar: 'pseudo',
  frame: 'frame',
  actor: 'actor',
  ellipse: 'ellipse',
  decision: 'decision',
  flowEnd: 'pseudo',
  node3d: 'box',
  lollipop: 'lollipop',
  port: 'port',
  folder: 'folder',
} as const

function flowNodes(input: {
  graph: DiagramGraph
  boxes: Map<string, LayoutBox>
  editable: boolean
  connectable: boolean
  selected: ReadonlySet<string>
  t: DiagramText
}): DiagramFlowNode[] {
  const { graph, boxes, editable, connectable, selected, t } = input
  return byDepth(graph.nodes).map((node) => {
    const box = boxes.get(node.id) ?? { x: 0, y: 0, width: node.width, height: node.height }
    return {
      id: node.id,
      type: NODE_TYPE[node.shape],
      position: { x: box.x, y: box.y },
      width: box.width,
      height: box.height,
      // The size is known: without it React Flow forgets where each box's handles are on every
      // render and drops its lines until it measures the box again, so they blink while dragging.
      measured: { width: box.width, height: box.height },
      style: { width: box.width, height: box.height },
      ...(node.parent && boxes.has(node.parent) ? { parentId: node.parent } : {}),
      data: { node, connectable },
      ariaLabel: nodeLabel(node, t),
      draggable: editable,
      selected: selected.has(node.id),
      className:
        'rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring [&.selected]:ring-2 [&.selected]:ring-primary',
    }
  })
}

/** "Duck inherits from Animal: label, one to many" — what a line says, in words. */
function edgeLabel(edge: DiagramEdge, names: Map<string, string>, t: DiagramText): string {
  const name = (id: string) => names.get(id) ?? id
  let text = t.relations[edge.relation](name(edge.from), name(edge.to))
  if (edge.label) text = t.labelled(text, edge.label.replace(/\n/g, ' '))
  if (edge.cardinality) {
    text += `, ${t.cardinalities(t.cardinality[edge.cardinality[0]], t.cardinality[edge.cardinality[1]])}`
  }
  const ends = [edge.sourceLabel, edge.targetLabel].filter(Boolean)
  if (ends.length) text += ` (${ends.join(' – ')})`
  if (edge.technology) text += `, ${edge.technology}`
  return text
}

function flowEdges(input: {
  graph: DiagramGraph
  markers: string
  selected: ReadonlySet<number>
  t: DiagramText
}): DiagramFlowEdge[] {
  const { graph, markers, selected, t } = input
  const names = new Map(graph.nodes.map((n) => [n.id, n.title || t.roles[n.role]]))
  const valid = graph.edges.filter((e) => names.has(e.source) && names.has(e.target))
  // Lines between the same two boxes fan out instead of lying on top of each other.
  const pair = (e: DiagramEdge) => [e.source, e.target].sort().join('\u0000')
  const counts = new Map<string, number>()
  for (const e of valid) counts.set(pair(e), (counts.get(pair(e)) ?? 0) + 1)
  const seen = new Map<string, number>()
  return valid.map((edge) => {
    const key = pair(edge)
    const i = seen.get(key) ?? 0
    seen.set(key, i + 1)
    const offset = (i - ((counts.get(key) ?? 1) - 1) / 2) * 16
    const index = relationIndexOf(edge.id)
    return {
      id: edge.id,
      selected: index !== null && selected.has(index),
      source: edge.source,
      target: edge.target,
      type: 'uml',
      data: { edge, markers, offset, flow: graph.direction },
      ariaLabel: edgeLabel(edge, names, t),
    }
  })
}

/** Positions after React Flow's moves; null when nothing moved. */
function movedLayout(changes: NodeChange<DiagramFlowNode>[], current: UmlLayout): UmlLayout | null {
  let next: UmlLayout | null = null
  for (const c of changes) {
    if (c.type === 'position' && c.position) {
      next = {
        ...(next ?? current),
        [c.id]: { x: Math.round(c.position.x), y: Math.round(c.position.y) },
      }
    }
  }
  return next
}

/** The selection after React Flow's select changes to nodes or edges; null when none changed. */
function nextSelection(
  current: UmlSelection,
  changes: (NodeChange<DiagramFlowNode> | EdgeChange<DiagramFlowEdge>)[],
  kind: 'elements' | 'relations',
): UmlSelection | null {
  const picks = changes.filter((c) => c.type === 'select')
  if (!picks.length) return null
  if (kind === 'elements') {
    const out = new Set(current.elements)
    for (const c of picks) {
      if (c.selected) out.add(c.id)
      else out.delete(c.id)
    }
    return { ...current, elements: [...out] }
  }
  const out = new Set(current.relations)
  for (const c of picks) {
    const index = relationIndexOf(c.id)
    if (index === null) continue
    if (c.selected) out.add(index)
    else out.delete(index)
  }
  return { ...current, relations: [...out].sort((a, b) => a - b) }
}

export { flowEdges, flowNodes, movedLayout, nextSelection }
