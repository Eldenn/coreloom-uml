'use client'

// Coreloom UI — UmlDiagram parts. The boxes (classes, entities, states, C4 elements, notes), the
// pseudo-states (start, end, choice, fork/join), the frames (namespaces, composite states, C4
// boundaries), and the line between two boxes with its labels (its UML markers are in
// uml-diagram-markers.tsx). UmlDiagram draws
// them on React Flow; they read the neutral graph from uml-graph.ts.
import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  type InternalNode,
  type Node,
  type NodeProps,
  useInternalNode,
} from '@xyflow/react'
import {
  CloudIcon,
  DatabaseIcon,
  FileTextIcon,
  ListOrderedIcon,
  type LucideIcon,
  PuzzleIcon,
  UserRoundIcon,
} from 'lucide-react'

import { type UmlAnnotation, withAnnotation } from '@/components/ui/uml-diagram-annotations'
import { DiagramMarkers } from '@/components/ui/uml-diagram-markers'
import {
  ActorNode,
  DecisionNode,
  EllipseNode,
  Ends,
  FolderNode,
  LollipopNode,
  PortNode,
} from '@/components/ui/uml-diagram-nodes'
import { type Messages, useCoreloomI18n } from '@/lib/i18n'
import type { DiagramEdge, DiagramNode, DiagramRow } from '@/lib/uml-graph'
import type { RegionLines } from '@/lib/uml-layout'
import { roundedPath, type Route, type RouteSide } from '@/lib/uml-route'
import { cn } from '@/lib/utils'

/** `connectable`: the node shows a dot to drag a new line from; `annotation`: its badge. */
interface NodeData extends Record<string, unknown> {
  node: DiagramNode
  connectable?: boolean
  annotation?: UmlAnnotation | undefined
  /** A frame with concurrent regions: the dashed lines between them. */
  regions?: RegionLines
}
type BoxNodeType = Node<NodeData, 'box'>
type PseudoNodeType = Node<NodeData, 'pseudo'>
type FrameNodeType = Node<NodeData, 'frame'>
type DiagramFlowNode =
  | BoxNodeType
  | PseudoNodeType
  | FrameNodeType
  | Node<NodeData, 'actor'>
  | Node<NodeData, 'ellipse'>
  | Node<NodeData, 'decision'>
  | Node<NodeData, 'lollipop'>
  | Node<NodeData, 'port'>
  | Node<NodeData, 'folder'>
/** `route`: the path the line takes round the boxes (none for a line from a box to itself). */
type DiagramFlowEdge = Edge<{ edge: DiagramEdge; markers: string; route?: Route }, 'uml'>

type DiagramText = Messages['diagram']

/** «interface», [Container: React], [Software System · External]: the line above a title. */
function eyebrow(node: DiagramNode, t: DiagramText): string | null {
  if (node.stereotype && node.role === 'boundary') {
    const kind = node.stereotype as keyof DiagramText['boundaries']
    return `[${t.boundaries[kind]}]`
  }
  if (node.stereotype) return `«${node.stereotype}»`
  switch (node.role) {
    case 'person':
    case 'system':
    case 'container':
    case 'component': {
      const kind = node.technology
        ? `${t.roles[node.role]}: ${node.technology}`
        : t.roles[node.role]
      return `[${node.tone === 'external' ? `${kind} · ${t.external}` : kind}]`
    }
    default:
      return null
  }
}

/** What a screen reader hears for a box: its kind, its name, and what's in it. */
/** How many members a class or entity box lists, in words. */
function contents(node: DiagramNode, t: DiagramText): string | null {
  const [first = [], second = []] = node.compartments ?? []
  if (!node.compartments) return null
  if (node.role === 'class') return t.members(first.length, second.length)
  if (node.role === 'entity') return t.attributes(first.length)
  return null
}

/** The UML keyword deployment elements show by default, which their role already names. */
const ROLE_KEYWORDS: Partial<Record<DiagramNode['role'], string>> = {
  device: 'device',
  environment: 'executionEnvironment',
  artifact: 'artifact',
  component: 'component',
  database: 'database',
  cloud: 'cloud',
  interface: 'interface',
}

function nodeLabel(node: DiagramNode, t: DiagramText): string {
  // Other kinds say what they are in their role (an artifact, a database node).
  const variant: Partial<Record<NonNullable<DiagramNode['variant']>, string>> = {
    database: t.database,
    queue: t.queue,
  }
  const name = node.title || node.body
  // A keyword that only repeats the role («device» on a device) isn't said twice.
  const said = node.stereotype && node.stereotype !== ROLE_KEYWORDS[node.role]
  const parts = [
    name ? t.named(t.roles[node.role], name) : t.roles[node.role],
    said ? eyebrow(node, t) : null,
    node.tone === 'external' ? t.external : null,
    node.technology,
    node.role === 'container' && node.variant ? variant[node.variant] : null,
    contents(node, t),
    node.title ? node.body : null,
  ]
  return parts.filter(Boolean).join(', ')
}

/** How many rows come before each compartment of a box. */
function rowsBefore(node: DiagramNode): number[] {
  return (node.compartments ?? []).map((_, i, all) =>
    all.slice(0, i).reduce((n, rows) => n + rows.length, 0),
  )
}

/** `member`: the row's place across the box's compartments, which a context menu reads back. */
function Row({ row, keyed, member }: { row: DiagramRow; keyed: boolean; member: number }) {
  return (
    <div
      data-member={member}
      className="flex h-5 items-center gap-2 font-mono text-[12px] leading-5"
    >
      {(row.prefix ?? keyed) && (
        <span className={cn('shrink-0 text-fg-secondary', keyed ? 'w-[3.2em]' : 'w-[1ch]')}>
          {row.prefix}
        </span>
      )}
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          row.underline && 'underline',
          row.italic && 'italic',
        )}
      >
        {row.text}
      </span>
      {row.suffix && <span className="shrink-0 text-fg-secondary">{row.suffix}</span>}
    </div>
  )
}

const VARIANT_ICONS: Record<NonNullable<DiagramNode['variant']>, LucideIcon> = {
  database: DatabaseIcon,
  queue: ListOrderedIcon,
  artifact: FileTextIcon,
  component: PuzzleIcon,
  cloud: CloudIcon,
}

// A deployment node's depth: a second outline up and to the right, behind the box.
const DEPTH = 'shadow-[6px_-6px_0_-1px_var(--color-inset),6px_-6px_0_0_var(--color-border-strong)]'

const TONES = {
  default: 'border-border-strong bg-card text-card-foreground',
  primary: 'border-primary/50 bg-primary-subtle text-foreground',
  external: 'border-border-strong bg-secondary text-secondary-foreground',
} as const

function BoxShape({ node }: { node: DiagramNode }) {
  const t = useCoreloomI18n().messages.diagram
  const top = eyebrow(node, t)
  const keyed = node.role === 'entity' && Boolean(node.compartments?.[0]?.some((r) => r.prefix))
  const Icon = node.variant ? VARIANT_ICONS[node.variant] : ListOrderedIcon
  const before = rowsBefore(node)
  if (node.shape === 'note') {
    return (
      <div className="size-full overflow-hidden rounded-sm border border-border-strong bg-warning-subtle px-3 py-3 text-[12px] leading-[17px] whitespace-pre-line text-foreground">
        {node.body}
      </div>
    )
  }
  return (
    <div
      className={cn(
        'flex size-full flex-col overflow-hidden border',
        node.shape === 'rounded' ? 'rounded-xl' : 'rounded-md',
        node.shape === 'node3d' && ['rounded-none', DEPTH],
        TONES[node.tone ?? 'default'],
      )}
    >
      {node.shape === 'person' && (
        <UserRoundIcon
          aria-hidden
          className="mx-auto mt-2 -mb-1 size-5 shrink-0 text-fg-secondary"
        />
      )}
      <div className="flex min-h-10 shrink-0 flex-col justify-center px-3.5 py-2 text-center">
        {top && (
          <p className="flex h-4 items-center justify-center gap-1 truncate font-mono text-[10.5px] leading-4 text-fg-secondary">
            {node.variant && <Icon aria-hidden className="size-3 shrink-0" />}
            <span className="truncate">{top}</span>
          </p>
        )}
        <p
          className={cn(
            'truncate text-[13px] leading-5 font-semibold',
            node.italicTitle && 'italic',
          )}
        >
          {node.title}
        </p>
      </div>
      {node.compartments?.map((rows, i) => (
        <div
          // Compartments have no id of their own; their place is what they are.
          // eslint-disable-next-line @eslint-react/no-array-index-key -- the order is the identity
          key={i}
          className="shrink-0 border-t border-inherit px-3.5 py-[5px]"
        >
          {rows.map((row, j) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- rows may repeat
            <Row key={j} row={row} keyed={keyed} member={(before[i] ?? 0) + j} />
          ))}
          {!rows.length && <div className="h-5" />}
        </div>
      ))}
      {node.body && (
        <p className="px-3.5 pb-2 text-center text-[12px] leading-[17px] whitespace-pre-line text-fg-secondary">
          {node.body}
        </p>
      )}
    </div>
  )
}

function BoxNode({ data }: NodeProps<BoxNodeType>) {
  return (
    <>
      <Ends connectable={data.connectable} />
      <BoxShape node={data.node} />
    </>
  )
}

function PseudoNode({ data }: NodeProps<PseudoNodeType>) {
  const { node } = data
  return (
    <>
      <Ends connectable={data.connectable} />
      {node.shape === 'start' && <div className="size-full rounded-full bg-foreground" />}
      {node.shape === 'end' && (
        <div className="size-full rounded-full border-2 border-foreground p-[3px]">
          <div className="size-full rounded-full bg-foreground" />
        </div>
      )}
      {node.shape === 'choice' && (
        <div className="grid size-full place-items-center">
          <div className="size-[21px] rotate-45 rounded-[2px] border border-border-strong bg-card" />
        </div>
      )}
      {node.shape === 'bar' && <div className="size-full rounded-sm bg-foreground" />}
      {node.shape === 'flowEnd' && (
        <svg aria-hidden viewBox="0 0 22 22" className="size-full fill-card stroke-foreground">
          <circle cx="11" cy="11" r="10" strokeWidth={1.5} />
          <path d="M4 4 L18 18 M18 4 L4 18" strokeWidth={1.5} />
        </svg>
      )}
    </>
  )
}

/** Composite states, deployment nodes and components are solid, a system plain; the rest dashed. */
const FRAMES: Partial<Record<DiagramNode['role'], string>> = {
  composite: 'rounded-xl bg-card/60',
  boundary: 'rounded-lg border-dashed bg-inset/50',
  namespace: 'rounded-lg border-dashed bg-inset/50',
  subject: 'rounded-md bg-inset/40',
  partition: 'rounded-md bg-inset/40',
  node: cn('bg-inset/40', DEPTH),
  device: cn('bg-inset/40', DEPTH),
  environment: cn('bg-inset/40', DEPTH),
  cloud: 'rounded-[28px] bg-inset/40',
  component: 'rounded-md bg-inset/40',
}

function FrameNode(props: NodeProps<FrameNodeType>) {
  const { data } = props
  const { node } = data
  const t = useCoreloomI18n().messages.diagram
  if (node.role === 'package') return <FolderNode {...props} type="folder" />
  const top = eyebrow(node, t)
  return (
    <>
      <Ends connectable={data.connectable} />
      <div
        className={cn(
          'size-full border border-border-strong',
          FRAMES[node.role] ?? FRAMES.boundary,
        )}
      >
        <div className="flex h-10 items-center gap-2 px-3">
          <p className="truncate text-[12.5px] font-semibold text-foreground">{node.title}</p>
          {top && <p className="truncate font-mono text-[10.5px] text-fg-secondary">{top}</p>}
        </div>
      </div>
      {/* Concurrent regions: a dashed line between each two, under the name. */}
      {data.regions?.at.map((at) => (
        <div
          key={at}
          aria-hidden
          className={cn(
            'pointer-events-none absolute border-dashed border-border-strong',
            data.regions?.axis === 'x' ? 'top-10 bottom-0 border-l' : 'inset-x-0 border-t',
          )}
          style={data.regions?.axis === 'x' ? { left: at } : { top: at }}
        />
      ))}
    </>
  )
}

// ── Lines ───────────────────────────────────────────────────────────────────────────────────────

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** A folder's tab, which lines stop at the body below rather than float over. */
const FOLDER_TAB = 23

function rectOf(node: InternalNode<DiagramFlowNode> | undefined): Rect | null {
  if (!node) return null
  const { x, y } = node.internals.positionAbsolute
  const tab = node.data.node.role === 'package' ? FOLDER_TAB : 0
  return {
    x,
    y: y + tab,
    width: node.measured.width ?? node.width ?? 0,
    height: (node.measured.height ?? node.height ?? 0) - tab,
  }
}

/** Where an end label goes: beside the line, just off the box. */
function endLabelAt(p: { x: number; y: number }, side: RouteSide) {
  switch (side) {
    case 'top':
      return { x: p.x + 12, y: p.y - 12 }
    case 'bottom':
      return { x: p.x + 12, y: p.y + 12 }
    case 'left':
      return { x: p.x - 14, y: p.y - 11 }
    case 'right':
      return { x: p.x + 14, y: p.y - 11 }
  }
}

interface Geometry {
  path: string
  label: { x: number; y: number }
  source: { x: number; y: number }
  target: { x: number; y: number }
  sides: readonly [RouteSide, RouteSide]
}

/** A line from a box back to itself: a loop on its right side. */
function loop(a: Rect): Geometry {
  const x = a.x + a.width
  const y = a.y + a.height / 2
  return {
    path: `M ${String(x)} ${String(y - 12)} C ${String(x + 46)} ${String(y - 34)}, ${String(x + 46)} ${String(y + 34)}, ${String(x)} ${String(y + 12)}`,
    label: { x: x + 40, y },
    source: { x, y: y - 12 },
    target: { x, y: y + 12 },
    sides: ['right', 'right'],
  }
}

function routed(route: Route): Geometry | null {
  const source = route.points.at(0)
  const target = route.points.at(-1)
  if (!source || !target) return null
  return { path: roundedPath(route.points), label: route.label, source, target, sides: route.sides }
}

/** What a line's label says: its text, and its technology on a line of its own. */
function edgeText(edge: DiagramEdge): string {
  return [edge.label, edge.technology ? `[${edge.technology}]` : ''].filter(Boolean).join('\n')
}

const labelClass =
  'nodrag nopan pointer-events-none absolute z-10 rounded-sm bg-background/90 px-1 text-[11.5px] leading-4 text-fg-secondary'

function UmlEdge({ source, target, data, selected }: EdgeProps<DiagramFlowEdge>) {
  const a = rectOf(useInternalNode<DiagramFlowNode>(source))
  if (!data) return null
  const { edge, markers, route } = data
  const self = source === target && a ? loop(a) : null
  const g = self ?? (route ? routed(route) : null)
  if (!g) return null
  const at = (p: { x: number; y: number }) => ({
    transform: `translate(-50%, -50%) translate(${String(p.x)}px, ${String(p.y)}px)`,
  })
  const label = edgeText(edge)
  return (
    <>
      <BaseEdge
        path={g.path}
        style={{
          stroke: selected ? 'var(--color-primary)' : 'var(--diagram-edge)',
          strokeWidth: selected ? 1.75 : 1.25,
          ...(edge.dashed ? { strokeDasharray: '5 4' } : {}),
        }}
        {...(edge.sourceMarker ? { markerStart: `url(#${markers}-${edge.sourceMarker})` } : {})}
        {...(edge.targetMarker ? { markerEnd: `url(#${markers}-${edge.targetMarker})` } : {})}
      />
      <EdgeLabelRenderer>
        {label && (
          <div
            className={cn(labelClass, 'text-center whitespace-pre-line text-foreground')}
            style={at(g.label)}
          >
            {label}
          </div>
        )}
        {edge.sourceLabel && (
          <div className={labelClass} style={at(endLabelAt(g.source, g.sides[0]))}>
            {edge.sourceLabel}
          </div>
        )}
        {edge.targetLabel && (
          <div className={labelClass} style={at(endLabelAt(g.target, g.sides[1]))}>
            {edge.targetLabel}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

// Every shape carries its annotation's badge, when it has one.
const NODE_TYPES = {
  box: withAnnotation(BoxNode),
  pseudo: withAnnotation(PseudoNode),
  frame: withAnnotation(FrameNode),
  actor: withAnnotation(ActorNode),
  ellipse: withAnnotation(EllipseNode),
  decision: withAnnotation(DecisionNode),
  lollipop: withAnnotation(LollipopNode),
  port: withAnnotation(PortNode),
  folder: withAnnotation(FolderNode),
}
const EDGE_TYPES = { uml: UmlEdge }

export {
  BoxShape,
  type DiagramFlowEdge,
  type DiagramFlowNode,
  DiagramMarkers,
  EDGE_TYPES,
  edgeText,
  eyebrow,
  FOLDER_TAB,
  NODE_TYPES,
  nodeLabel,
}
