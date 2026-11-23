// Coreloom UI — UmlDiagram labels. What a right-click hit in a drawing is (an element, one of its
// members, a relation or a sequence step) and the one line that names it: `Payment`,
// `Payment.total: number`, `Order → Payment: pays`, `Client -> API: login()`. The line is made
// from the model alone, so it reads the same for everyone and an app can show it or hand it on.
import type { SequenceArrow, SequenceDiagram, SequenceStep } from '@/lib/uml'
import type { UmlSelection } from '@/lib/uml-edit'
import { stepOf, stepPath } from '@/lib/uml-edit-sequence'
import type { DiagramEdge, DiagramGraph, DiagramNode, DiagramRow } from '@/lib/uml-graph'
import { relationIndexOf } from '@/lib/uml-graph'

/** One thing of a drawing a context menu acts on, with the line that names it. */
type UmlContextPart =
  | { type: 'element'; id: string; label: string }
  /** `index`: the relation's place in the diagram's list (its transitions, for a state diagram). */
  | { type: 'relation'; index: number; label: string }
  /** `index`: the member's place in its element's list (attributes, then methods). */
  | { type: 'member'; element: string; index: number; label: string }
  /** `id`: the step's id (`step:2`, see uml-edit-sequence.ts). */
  | { type: 'step'; id: string; label: string }

/**
 * What a context menu acts on in a drawing: one part, or everything selected when the menu opens
 * on one of several selected parts (`targets`, elements then relations; `label` counts them).
 */
type UmlContextTarget =
  | UmlContextPart
  | {
      type: 'selection'
      selection: UmlSelection
      targets: readonly UmlContextPart[]
      label: string
    }

/** Newlines and runs of spaces become one space. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

/** An element's name; `role` (its kind, in words) when it has none (a start state). */
function elementLabel(node: DiagramNode, role: string): string {
  // An empty title falls back to the body (a note), then to the role.
  return oneLine(node.title || (node.body ?? '')) || role
}

/** `Payment.total: number`, `Payment.pay(amount)`, `Order.id: string` (an ER attribute). */
function memberLabel(node: DiagramNode, row: DiagramRow, role: string): string {
  const member = row.suffix ? `${row.text}: ${row.suffix}` : row.text
  return `${elementLabel(node, role)}.${oneLine(member)}`
}

/** `Order → Payment: pays`, the ends the way the model has them. */
function relationLabel(edge: DiagramEdge, name: (id: string) => string): string {
  const ends = `${name(edge.from)} → ${name(edge.to)}`
  return edge.label ? `${ends}: ${oneLine(edge.label)}` : ends
}

/** Where a right-click landed on a canvas: an edge, or a node and maybe one of its rows. */
interface GraphHit {
  edge?: string | undefined
  node?: string | undefined
  /** The row's place in the node's compartments, counted across them. */
  member?: number | undefined
}

/** The target of a hit on a canvas, or null when it isn't on one (a note's line, the pane). */
function graphTarget(
  graph: DiagramGraph,
  hit: GraphHit,
  role: (node: DiagramNode) => string,
): UmlContextPart | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  if (hit.edge !== undefined) {
    const edge = graph.edges.find((e) => e.id === hit.edge)
    const index = relationIndexOf(hit.edge)
    if (!edge || index === null) return null
    const name = (id: string) => {
      const node = byId.get(id)
      return node ? elementLabel(node, role(node)) : id
    }
    return { type: 'relation', index, label: relationLabel(edge, name) }
  }
  const node = hit.node === undefined ? undefined : byId.get(hit.node)
  if (!node) return null
  const row = hit.member === undefined ? undefined : node.compartments?.flat()[hit.member]
  if (row && hit.member !== undefined)
    return {
      type: 'member',
      element: node.id,
      index: hit.member,
      label: memberLabel(node, row, role(node)),
    }
  return { type: 'element', id: node.id, label: elementLabel(node, role(node)) }
}

const DASHED: ReadonlySet<SequenceArrow> = new Set([
  'reply',
  'dottedLine',
  'dottedLost',
  'dottedAsync',
])

/**
 * A step the way someone would write it down: `Client -> API: login()` (`-->` for a reply or a
 * dotted line), `Note over API, DB: cached`, `activate API`, `loop every minute`.
 */
function stepLabel(step: SequenceStep, name: (id: string) => string): string {
  switch (step.type) {
    case 'message': {
      const line = `${name(step.from)} ${DASHED.has(step.arrow) ? '-->' : '->'} ${name(step.to)}`
      return step.text ? `${line}: ${oneLine(step.text)}` : line
    }
    case 'note': {
      const where = step.position === 'over' ? 'over' : `${step.position} of`
      return `Note ${where} ${step.participants.map(name).join(', ')}: ${oneLine(step.text)}`
    }
    case 'activation':
      return `${step.active ? 'activate' : 'deactivate'} ${name(step.participant)}`
    case 'block':
      return oneLine(`${step.kind} ${step.sections[0]?.label ?? ''}`)
  }
}

/** The target of a participant's or a step's id in a sequence diagram, or null. */
function sequenceTarget(diagram: SequenceDiagram, id: string): UmlContextPart | null {
  const names = new Map(diagram.participants.map((p) => [p.id, oneLine(p.label ?? p.id)]))
  const name = (who: string) => names.get(who) ?? who
  if (stepPath(id)) {
    const step = stepOf(diagram, id)
    return step ? { type: 'step', id, label: stepLabel(step, name) } : null
  }
  return { type: 'element', id, label: name(id) }
}

export {
  elementLabel,
  type GraphHit,
  graphTarget,
  memberLabel,
  relationLabel,
  sequenceTarget,
  stepLabel,
  type UmlContextPart,
  type UmlContextTarget,
}
