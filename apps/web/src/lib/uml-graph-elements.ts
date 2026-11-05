import type {
  ActivityDiagram,
  ActivityNode,
  ComponentDiagram,
  ComponentElement,
  ComponentRelationKind,
  DeploymentDiagram,
  DeploymentNode,
  DeploymentRelationKind,
  ElementDiagram,
  PackageDiagram,
  PackageElement,
  PackageRelationKind,
  UseCaseDiagram,
  UseCaseElement,
  UseCaseRelationKind,
} from '@/lib/uml-elements'
import {
  type DiagramEdge,
  type DiagramGraph,
  type DiagramMarker,
  type DiagramNode,
  type DiagramRelation,
  noteNodes,
  sizeBox,
  textWidth,
  wrappedLines,
} from '@/lib/uml-graph-base'

/** Whatever holds others is drawn as a frame; children sit inside it. */
function withParent(element: { parent?: string }, ids: ReadonlySet<string>) {
  return element.parent && ids.has(element.parent) ? { parent: element.parent } : {}
}

function graphOf(
  d: ElementDiagram,
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  flow: DiagramGraph['direction'],
): DiagramGraph {
  const notes = noteNodes(d.notes, (id) => nodes.find((n) => n.id === id)?.parent)
  return {
    direction: d.direction ?? flow,
    nodes: [...nodes, ...notes.nodes],
    edges: [...edges, ...notes.edges],
  }
}

// ── Use case ────────────────────────────────────────────────────────────────────────────────────

/** A use case's ellipse: room for its name on two lines at most, wider than tall. */
function ellipseSize(title: string) {
  const width = Math.min(260, Math.max(140, textWidth(title) * 0.8 + 64))
  const lines = wrappedLines(title, width - 36)
  return { width: Math.ceil(width), height: Math.max(56, lines * 18 + 30) }
}

function usecaseNode(e: UseCaseElement, ids: ReadonlySet<string>): DiagramNode {
  const title = e.label ?? e.id
  const parent = withParent(e, ids)
  switch (e.kind) {
    case 'actor':
      return {
        id: e.id,
        shape: 'actor',
        role: 'actor',
        title,
        width: Math.max(80, Math.ceil(textWidth(title)) + 16),
        height: 84,
        ...parent,
      }
    case 'usecase':
      return {
        id: e.id,
        shape: 'ellipse',
        role: 'usecase',
        title,
        ...ellipseSize(title),
        ...parent,
      }
    case 'system':
      return sizeBox({ id: e.id, shape: 'frame', role: 'subject', title, ...parent })
  }
}

const USE_CASE_EDGES: Record<
  UseCaseRelationKind,
  { fromTo: boolean; marker?: DiagramMarker; dashed?: boolean; keyword?: string }
> = {
  association: { fromTo: true },
  include: { fromTo: true, marker: 'arrow', dashed: true, keyword: '«include»' },
  extend: { fromTo: true, marker: 'arrow', dashed: true, keyword: '«extend»' },
  generalization: { fromTo: false, marker: 'triangle' },
}

/** The keyword and the label, one per line: «include» then what was written. */
function joinLabel(keyword: string | undefined, label: string | undefined) {
  const text = [keyword, label].filter(Boolean).join('\n')
  return text ? { label: text } : {}
}

function usecaseGraph(d: UseCaseDiagram): DiagramGraph {
  const ids = new Set(d.elements.filter((e) => e.kind === 'system').map((e) => e.id))
  const nodes = d.elements.map((e) => usecaseNode(e, ids))
  const edges = d.relations.map((r, i): DiagramEdge => {
    const kind = r.kind ?? 'association'
    const look = USE_CASE_EDGES[kind]
    const [source, target] = look.fromTo ? [r.from, r.to] : [r.to, r.from]
    return {
      id: `r${String(i)}`,
      source,
      target,
      from: r.from,
      to: r.to,
      relation: kind,
      ...(look.dashed ? { dashed: true } : {}),
      ...(look.marker ? { [look.fromTo ? 'targetMarker' : 'sourceMarker']: look.marker } : {}),
      ...joinLabel(look.keyword, r.label),
    }
  })
  return graphOf(d, nodes, edges, 'LR')
}

// ── Activity ────────────────────────────────────────────────────────────────────────────────────

function decisionSize(title: string) {
  if (!title) return { width: 30, height: 30 }
  const width = Math.min(240, Math.max(96, textWidth(title) * 0.9 + 64))
  return {
    width: Math.ceil(width),
    height: Math.max(56, wrappedLines(title, width - 40) * 17 + 30),
  }
}

/** Starts, ends, forks and joins: fixed sizes, no text in the drawing. */
function pseudoNode(
  kind: 'start' | 'end' | 'flowEnd' | 'fork' | 'join',
  horizontal: boolean,
): Pick<DiagramNode, 'shape' | 'role' | 'width' | 'height'> {
  switch (kind) {
    case 'start':
      return { shape: 'start', role: 'start', width: 22, height: 22 }
    case 'end':
      return { shape: 'end', role: 'end', width: 24, height: 24 }
    case 'flowEnd':
      return { shape: 'flowEnd', role: 'flowEnd', width: 22, height: 22 }
    case 'fork':
    case 'join':
      return { shape: 'bar', role: kind, width: horizontal ? 8 : 110, height: horizontal ? 110 : 8 }
  }
}

function activityNode(d: ActivityDiagram, n: ActivityNode, ids: ReadonlySet<string>): DiagramNode {
  const title = n.label ?? ''
  const base = { id: n.id, title, ...withParent(n, ids) }
  switch (n.kind) {
    case 'action':
      return sizeBox({ ...base, title: n.label ?? n.id, shape: 'rounded', role: 'action' })
    case 'decision':
    case 'merge':
      return { ...base, shape: title ? 'decision' : 'choice', role: n.kind, ...decisionSize(title) }
    case 'partition':
      return sizeBox({ ...base, title: n.label ?? n.id, shape: 'frame', role: 'partition' })
    default:
      return { ...base, ...pseudoNode(n.kind, d.direction === 'LR' || d.direction === 'RL') }
  }
}

/** A guard reads in brackets, `[paid]`, however it was written. */
function guard(label: string | undefined) {
  const text = label?.trim()
  if (!text) return {}
  return { label: text.startsWith('[') ? text : `[${text}]` }
}

function activityGraph(d: ActivityDiagram): DiagramGraph {
  const ids = new Set(d.elements.filter((e) => e.kind === 'partition').map((e) => e.id))
  const nodes = d.elements.map((n) => activityNode(d, n, ids))
  const edges = d.relations.map((r, i): DiagramEdge => ({
    id: `r${String(i)}`,
    source: r.from,
    target: r.to,
    from: r.from,
    to: r.to,
    relation: 'flow',
    targetMarker: 'arrow',
    ...guard(r.label),
  }))
  return graphOf(d, nodes, edges, 'TB')
}

// ── Deployment ──────────────────────────────────────────────────────────────────────────────────

/** The keyword above a node's name when no stereotype was given (UML's own words, untranslated). */
const KEYWORD: Record<DeploymentNode['kind'], string | undefined> = {
  node: undefined,
  device: 'device',
  environment: 'executionEnvironment',
  artifact: 'artifact',
  component: 'component',
  database: 'database',
  cloud: 'cloud',
}

const VARIANT: Partial<Record<DeploymentNode['kind'], DiagramNode['variant']>> = {
  artifact: 'artifact',
  component: 'component',
  database: 'database',
  cloud: 'cloud',
}

function deploymentNode(
  n: DeploymentNode,
  holders: ReadonlySet<string>,
  ids: ReadonlySet<string>,
): DiagramNode {
  const stereotype = n.stereotype ?? KEYWORD[n.kind]
  const variant = VARIANT[n.kind]
  const hardware = n.kind === 'node' || n.kind === 'device' || n.kind === 'environment'
  let shape: DiagramNode['shape'] = hardware ? 'node3d' : 'box'
  if (holders.has(n.id)) shape = 'frame'
  return sizeBox(
    {
      id: n.id,
      shape,
      role: n.kind === 'component' ? 'component' : n.kind,
      title: n.label ?? n.id,
      ...(stereotype ? { stereotype } : {}),
      ...(variant ? { variant } : {}),
      ...withParent(n, ids),
    },
    hardware ? 150 : 130,
  )
}

const DEPLOYMENT_EDGES: Record<
  DeploymentRelationKind,
  { relation: DiagramRelation; marker?: DiagramMarker; dashed?: boolean; keyword?: string }
> = {
  link: { relation: 'link' },
  dependency: { relation: 'dependency', marker: 'arrow', dashed: true },
  deploy: { relation: 'deploy', marker: 'arrow', dashed: true, keyword: '«deploy»' },
}

function deploymentGraph(d: DeploymentDiagram): DiagramGraph {
  const ids = new Set(d.elements.map((e) => e.id))
  const holders = new Set(d.elements.flatMap((e) => (e.parent ? [e.parent] : [])))
  const nodes = d.elements.map((n) => deploymentNode(n, holders, ids))
  const edges = d.relations.map((r, i): DiagramEdge => {
    const look = DEPLOYMENT_EDGES[r.kind ?? 'link']
    return {
      id: `r${String(i)}`,
      source: r.from,
      target: r.to,
      from: r.from,
      to: r.to,
      relation: look.relation,
      ...(look.dashed ? { dashed: true } : {}),
      ...(look.marker ? { targetMarker: look.marker } : {}),
      ...joinLabel(look.keyword, r.label),
    }
  })
  return graphOf(d, nodes, edges, 'TB')
}

// ── Component ───────────────────────────────────────────────────────────────────────────────────

/** A lollipop's ball and a port's square: fixed sizes, their names drawn beside them. */
const BALL = 20
const PORT = 14

function componentNode(
  e: ComponentElement,
  holders: ReadonlySet<string>,
  ids: ReadonlySet<string>,
): DiagramNode {
  const base = { id: e.id, title: e.label ?? e.id, ...withParent(e, ids) }
  switch (e.kind) {
    case 'interface':
      return { ...base, shape: 'lollipop', role: 'interface', width: BALL, height: BALL }
    case 'port':
      return {
        ...base,
        shape: 'port',
        role: 'port',
        width: PORT,
        height: PORT,
        ...(base.parent ? { border: true } : {}),
      }
    case 'component':
      return sizeBox(
        {
          ...base,
          shape: holders.has(e.id) ? 'frame' : 'box',
          role: 'component',
          stereotype: e.stereotype ?? 'component',
          variant: 'component',
        },
        140,
      )
  }
}

const COMPONENT_EDGES: Record<
  ComponentRelationKind,
  { marker?: DiagramMarker; dashed?: boolean; keyword?: string }
> = {
  dependency: { marker: 'arrow', dashed: true },
  provide: {},
  require: { marker: 'socket' },
  assembly: { marker: 'assembly' },
  delegate: { marker: 'arrow', keyword: '«delegate»' },
}

function componentGraph(d: ComponentDiagram): DiagramGraph {
  const ids = new Set(d.elements.filter((e) => e.kind === 'component').map((e) => e.id))
  // Ports sit on the edge; a component is drawn as a frame only when it holds something else.
  const holders = new Set(
    d.elements.flatMap((e) => (e.parent && e.kind !== 'port' ? [e.parent] : [])),
  )
  const nodes = d.elements.map((e) => componentNode(e, holders, ids))
  const edges = d.relations.map((r, i): DiagramEdge => {
    const kind = r.kind ?? 'dependency'
    const look = COMPONENT_EDGES[kind]
    return {
      id: `r${String(i)}`,
      source: r.from,
      target: r.to,
      from: r.from,
      to: r.to,
      relation: kind,
      ...(look.dashed ? { dashed: true } : {}),
      ...(look.marker ? { targetMarker: look.marker } : {}),
      ...joinLabel(look.keyword, r.label),
    }
  })
  return graphOf(d, nodes, edges, 'LR')
}

// ── Package ─────────────────────────────────────────────────────────────────────────────────────

/** A folder's tab, above the box. */
const TAB = 18

function packageNode(
  e: PackageElement,
  holders: ReadonlySet<string>,
  ids: ReadonlySet<string>,
): DiagramNode {
  const base = { id: e.id, title: e.label ?? e.id, ...withParent(e, ids) }
  const stereotype = e.stereotype ?? (e.kind === 'interface' ? 'interface' : undefined)
  const said = stereotype ? { stereotype } : {}
  if (e.kind === 'package') {
    if (holders.has(e.id)) return sizeBox({ ...base, ...said, shape: 'frame', role: 'package' })
    const box = sizeBox({ ...base, ...said, shape: 'folder', role: 'package' }, 130)
    return { ...box, height: box.height + TAB }
  }
  return sizeBox({
    ...base,
    ...said,
    shape: 'box',
    role: e.kind,
    ...(e.kind === 'component'
      ? { variant: 'component' as const, stereotype: e.stereotype ?? 'component' }
      : {}),
  })
}

const PACKAGE_KEYWORDS: Record<PackageRelationKind, string | undefined> = {
  dependency: undefined,
  import: '«import»',
  merge: '«merge»',
}

function packageGraph(d: PackageDiagram): DiagramGraph {
  const ids = new Set(d.elements.filter((e) => e.kind === 'package').map((e) => e.id))
  const holders = new Set(
    d.elements.flatMap((e) => (e.parent && ids.has(e.parent) ? [e.parent] : [])),
  )
  const nodes = d.elements.map((e) => packageNode(e, holders, ids))
  const edges = d.relations.map((r, i): DiagramEdge => {
    const kind = r.kind ?? 'dependency'
    return {
      id: `r${String(i)}`,
      source: r.from,
      target: r.to,
      from: r.from,
      to: r.to,
      relation: kind,
      dashed: true,
      targetMarker: 'arrow',
      ...joinLabel(PACKAGE_KEYWORDS[kind], r.label),
    }
  })
  return graphOf(d, nodes, edges, 'TB')
}

/** The graph for a use case, activity, deployment, component or package diagram. */
function elementGraph(diagram: ElementDiagram): DiagramGraph {
  switch (diagram.kind) {
    case 'usecase':
      return usecaseGraph(diagram)
    case 'activity':
      return activityGraph(diagram)
    case 'deployment':
      return deploymentGraph(diagram)
    case 'component':
      return componentGraph(diagram)
    case 'package':
      return packageGraph(diagram)
  }
}

export { elementGraph }
