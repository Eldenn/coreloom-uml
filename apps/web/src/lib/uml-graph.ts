import type {
  C4Diagram,
  ClassDiagram,
  ClassMember,
  ClassRelationKind,
  ErCardinality,
  ErDiagram,
  StateDiagram,
  UmlSpec,
} from '@/lib/uml'
import {
  type DiagramEdge,
  type DiagramGraph,
  type DiagramMarker,
  type DiagramNode,
  type DiagramRelation,
  type DiagramRole,
  type DiagramRow,
  type DiagramShape,
  type DiagramTone,
  noteNodes,
  sizeBox,
} from '@/lib/uml-graph-base'
import { elementGraph } from '@/lib/uml-graph-elements'

// ── Class ───────────────────────────────────────────────────────────────────────────────────────

const SIGN = { public: '+', private: '-', protected: '#', package: '~' } as const

const memberRow = (m: ClassMember): DiagramRow => ({
  text: m.text,
  ...(m.visibility ? { prefix: SIGN[m.visibility] } : {}),
  ...(m.static ? { underline: true } : {}),
  ...(m.abstract ? { italic: true } : {}),
})

/** Markers and orientation per relation: hierarchy kinds start from `to` (parent, whole). */
const CLASS_EDGES: Record<
  ClassRelationKind,
  { fromTo: boolean; marker?: DiagramMarker; dashed?: boolean }
> = {
  inheritance: { fromTo: false, marker: 'triangle' },
  realization: { fromTo: false, marker: 'triangle', dashed: true },
  composition: { fromTo: false, marker: 'diamondFilled' },
  aggregation: { fromTo: false, marker: 'diamond' },
  association: { fromTo: true, marker: 'arrow' },
  dependency: { fromTo: true, marker: 'arrow', dashed: true },
  link: { fromTo: true },
  dashedLink: { fromTo: true, dashed: true },
}

function classGraph(d: ClassDiagram): DiagramGraph {
  const namespaces = [...new Set(d.classes.flatMap((c) => (c.namespace ? [c.namespace] : [])))]
  const nodes: DiagramNode[] = namespaces.map((ns) =>
    sizeBox({ id: `namespace:${ns}`, shape: 'frame', role: 'namespace', title: ns }),
  )
  for (const c of d.classes) {
    const attributes = (c.attributes ?? []).map(memberRow)
    const methods = (c.methods ?? []).map(memberRow)
    const abstract = c.stereotype?.toLowerCase() === 'abstract'
    nodes.push(
      sizeBox(
        {
          id: c.id,
          shape: 'box',
          role: 'class',
          title: `${c.label ?? c.id}${c.generic ? `<${c.generic}>` : ''}`,
          ...(c.stereotype ? { stereotype: c.stereotype } : {}),
          ...(abstract ? { italicTitle: true } : {}),
          ...(attributes.length || methods.length ? { compartments: [attributes, methods] } : {}),
          ...(c.namespace ? { parent: `namespace:${c.namespace}` } : {}),
        },
        140,
      ),
    )
  }
  const edges = d.relations.map((r, i): DiagramEdge => {
    const look = CLASS_EDGES[r.kind]
    const [source, target] = look.fromTo ? [r.from, r.to] : [r.to, r.from]
    const [sourceLabel, targetLabel] = look.fromTo
      ? [r.fromCardinality, r.toCardinality]
      : [r.toCardinality, r.fromCardinality]
    return {
      id: `r${String(i)}`,
      source,
      target,
      from: r.from,
      to: r.to,
      relation: r.kind,
      ...(look.dashed ? { dashed: true } : {}),
      ...(look.marker ? { [look.fromTo ? 'targetMarker' : 'sourceMarker']: look.marker } : {}),
      ...(r.label ? { label: r.label } : {}),
      ...(sourceLabel ? { sourceLabel } : {}),
      ...(targetLabel ? { targetLabel } : {}),
    }
  })
  const parentOf = (id: string) => nodes.find((n) => n.id === id)?.parent
  const notes = noteNodes(d.notes, parentOf)
  return {
    direction: d.direction ?? 'TB',
    nodes: [...nodes, ...notes.nodes],
    edges: [...edges, ...notes.edges],
  }
}

// ── State ───────────────────────────────────────────────────────────────────────────────────────

const pseudo = (kind: 'start' | 'end', scope: string | undefined) => `[*]${kind}:${scope ?? ''}`

function stateNode(d: StateDiagram, s: StateDiagram['states'][number]): DiagramNode {
  const parent = s.parent ? { parent: s.parent } : {}
  const title = s.label ?? s.id
  const horizontal = d.direction === 'LR' || d.direction === 'RL'
  switch (s.kind) {
    case 'choice':
      return { id: s.id, shape: 'choice', role: 'choice', title, width: 30, height: 30, ...parent }
    case 'fork':
    case 'join':
      return {
        id: s.id,
        shape: 'bar',
        role: s.kind,
        title,
        width: horizontal ? 8 : 90,
        height: horizontal ? 90 : 8,
        ...parent,
      }
    default: {
      const composite = d.states.some((c) => c.parent === s.id)
      return sizeBox({
        id: s.id,
        shape: composite ? 'frame' : 'rounded',
        role: composite ? 'composite' : 'state',
        title,
        ...(s.description && !composite ? { body: s.description } : {}),
        ...parent,
      })
    }
  }
}

function stateGraph(d: StateDiagram): DiagramGraph {
  const nodes = d.states.map((s) => stateNode(d, s))
  const used = new Map<string, DiagramNode>()
  const end = (id: string, kind: 'start' | 'end', scope: string | undefined) => {
    if (id !== '[*]') return id
    const key = pseudo(kind, scope)
    if (!used.has(key)) {
      used.set(key, {
        id: key,
        shape: kind,
        role: kind,
        title: '',
        width: 22,
        height: 22,
        ...(scope ? { parent: scope } : {}),
      })
    }
    return key
  }
  const edges = d.transitions.map((t, i): DiagramEdge => {
    const source = end(t.from, 'start', t.parent)
    const target = end(t.to, 'end', t.parent)
    return {
      id: `t${String(i)}`,
      source,
      target,
      from: source,
      to: target,
      relation: 'transition',
      targetMarker: 'arrow',
      ...(t.label ? { label: t.label } : {}),
    }
  })
  const all = [...used.values(), ...nodes]
  const notes = noteNodes(d.notes, (id) => all.find((n) => n.id === id)?.parent)
  return {
    direction: d.direction ?? 'TB',
    nodes: [...all, ...notes.nodes],
    edges: [...edges, ...notes.edges],
  }
}

// ── ER ──────────────────────────────────────────────────────────────────────────────────────────

const CROW: Record<ErCardinality, DiagramMarker> = {
  zeroOrOne: 'zeroOrOne',
  exactlyOne: 'one',
  zeroOrMore: 'zeroOrMore',
  oneOrMore: 'oneOrMore',
}

function erGraph(d: ErDiagram): DiagramGraph {
  const nodes = d.entities.map((e) =>
    sizeBox(
      {
        id: e.id,
        shape: 'box',
        role: 'entity',
        title: e.label ?? e.id,
        ...(e.attributes?.length
          ? {
              compartments: [
                e.attributes.map((a) => ({
                  text: a.name,
                  suffix: a.type,
                  ...(a.keys?.length ? { prefix: a.keys.join(',') } : {}),
                })),
              ],
            }
          : {}),
      },
      150,
    ),
  )
  const edges = d.relations.map((r, i): DiagramEdge => ({
    id: `e${String(i)}`,
    source: r.from,
    target: r.to,
    from: r.from,
    to: r.to,
    relation: 'er',
    sourceMarker: CROW[r.fromCardinality],
    targetMarker: CROW[r.toCardinality],
    cardinality: [r.fromCardinality, r.toCardinality],
    ...(r.identifying === false ? { dashed: true } : {}),
    ...(r.label ? { label: r.label } : {}),
  }))
  return { direction: d.direction ?? 'TB', nodes, edges }
}

// ── C4 ──────────────────────────────────────────────────────────────────────────────────────────

function c4Graph(d: C4Diagram): DiagramGraph {
  const frames = (d.boundaries ?? []).map((b) =>
    sizeBox({
      id: b.id,
      shape: 'frame',
      role: 'boundary',
      title: b.label,
      // The boundary's kind reads like a technology line: [System].
      ...(b.kind && b.kind !== 'boundary' ? { stereotype: b.kind } : {}),
      ...(b.parent ? { parent: b.parent } : {}),
    }),
  )
  const elements = d.elements.map((e) =>
    sizeBox(
      {
        id: e.id,
        shape: e.kind === 'person' ? 'person' : 'box',
        role: e.kind,
        title: e.label,
        tone: e.external ? 'external' : 'primary',
        ...(e.technology ? { technology: e.technology } : {}),
        ...(e.shape && e.shape !== 'box' ? { variant: e.shape } : {}),
        ...(e.description ? { body: e.description } : {}),
        ...(e.boundary ? { parent: e.boundary } : {}),
      },
      180,
    ),
  )
  const edges = d.relations.map((r, i): DiagramEdge => ({
    id: `c${String(i)}`,
    source: r.from,
    target: r.to,
    from: r.from,
    to: r.to,
    relation: 'c4',
    dashed: true,
    targetMarker: 'arrowFilled',
    ...(r.bidirectional ? { sourceMarker: 'arrowFilled' as const } : {}),
    ...(r.label ? { label: r.label } : {}),
    ...(r.technology ? { technology: r.technology } : {}),
  }))
  return { direction: d.direction ?? 'TB', nodes: [...frames, ...elements], edges }
}

/** The graph a canvas draws for a diagram. Sequence diagrams aren't graphs: null. */
function toDiagramGraph(diagram: UmlSpec): DiagramGraph | null {
  switch (diagram.kind) {
    case 'class':
      return classGraph(diagram)
    case 'state':
      return stateGraph(diagram)
    case 'er':
      return erGraph(diagram)
    case 'c4':
      return c4Graph(diagram)
    case 'usecase':
    case 'activity':
    case 'deployment':
    case 'component':
    case 'package':
      return elementGraph(diagram)
    case 'sequence':
      return null
  }
}

/**
 * Which relation an edge draws: its index in the diagram's relations (or transitions), or null for
 * a note's line. Edge ids are made here, so this is the one place that reads them back.
 */
function relationIndexOf(edgeId: string): number | null {
  const m = /^[rtec](\d+)$/.exec(edgeId)
  return m?.[1] === undefined ? null : Number(m[1])
}

export {
  type DiagramEdge,
  type DiagramGraph,
  type DiagramMarker,
  type DiagramNode,
  type DiagramRelation,
  type DiagramRole,
  type DiagramRow,
  type DiagramShape,
  type DiagramTone,
  relationIndexOf,
  toDiagramGraph,
}
