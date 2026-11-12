import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
  type InternalNode,
  type Node,
  type NodeProps,
  Position,
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
import type { UmlDirection } from '@/lib/uml'
import type { DiagramEdge, DiagramNode, DiagramRow } from '@/lib/uml-graph'
import type { RegionLines } from '@/lib/uml-layout'
import { cn } from '@/lib/utils'

/** `connectable`: the node shows a dot to drag a new line from. */
interface NodeData extends Record<string, unknown> {
  node: DiagramNode
  connectable?: boolean
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
type DiagramFlowEdge = Edge<
  { edge: DiagramEdge; markers: string; offset: number; flow: UmlDirection },
  'uml'
>

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

function Row({ row, keyed }: { row: DiagramRow; keyed: boolean }) {
  return (
    <div className="flex h-5 items-center gap-2 font-mono text-[12px] leading-5">
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
            <Row key={j} row={row} keyed={keyed} />
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

/** The sides a line leaves and enters by: facing each other across the gap between the boxes. */
/** Farther than one layer apart: a line straight across would pass behind the boxes between. */
const FAR = 110

/**
 * A line going back against the flow, over more than one layer, goes round the outside: out of
 * the side facing away from the middle and back in on the same side.
 */
function backSides(a: Rect, b: Rect, flow: UmlDirection): [Position, Position] | null {
  const horizontal = flow === 'LR' || flow === 'RL'
  const back = {
    TB: a.y - (b.y + b.height),
    BT: b.y - (a.y + a.height),
    LR: a.x - (b.x + b.width),
    RL: b.x - (a.x + a.width),
  }[flow]
  if (back < FAR) return null
  if (horizontal) {
    const side = a.y + a.height / 2 <= b.y + b.height / 2 ? Position.Top : Position.Bottom
    return [side, side]
  }
  const side = a.x + a.width / 2 <= b.x + b.width / 2 ? Position.Left : Position.Right
  return [side, side]
}

/** The sides a line leaves and enters by: facing each other across the gap between the boxes. */
function sides(a: Rect, b: Rect, flow: UmlDirection): [Position, Position] {
  const gap = 8
  const around = backSides(a, b, flow)
  if (around) return around
  if (b.y >= a.y + a.height + gap) return [Position.Bottom, Position.Top]
  if (a.y >= b.y + b.height + gap) return [Position.Top, Position.Bottom]
  if (b.x >= a.x + a.width) return [Position.Right, Position.Left]
  if (a.x >= b.x + b.width) return [Position.Left, Position.Right]
  // One inside the other (a state and its own composite): leave by the bottom.
  return [Position.Bottom, Position.Top]
}

/**
 * Where a line meets a box: on the side facing the other box, slid toward it (up to 30 % of the
 * side) so lines to different neighbours leave from different points.
 */
function anchor(r: Rect, side: Position, offset: number, other: Rect) {
  const lean = (own: number, theirs: number, size: number) =>
    Math.max(-size * 0.3, Math.min(size * 0.3, (theirs - own) * 0.5)) + offset
  const cx = r.x + r.width / 2
  const cy = r.y + r.height / 2
  const dx = lean(cx, other.x + other.width / 2, r.width)
  const dy = lean(cy, other.y + other.height / 2, r.height)
  switch (side) {
    case Position.Top:
      return { x: cx + dx, y: r.y }
    case Position.Bottom:
      return { x: cx + dx, y: r.y + r.height }
    case Position.Left:
      return { x: r.x, y: cy + dy }
    case Position.Right:
      return { x: r.x + r.width, y: cy + dy }
  }
}

/** Where an end label goes: beside the line, just off the box. */
function endLabelAt(p: { x: number; y: number }, side: Position) {
  switch (side) {
    case Position.Top:
      return { x: p.x + 12, y: p.y - 12 }
    case Position.Bottom:
      return { x: p.x + 12, y: p.y + 12 }
    case Position.Left:
      return { x: p.x - 14, y: p.y - 11 }
    case Position.Right:
      return { x: p.x + 14, y: p.y - 11 }
  }
}

function geometry({
  a,
  b,
  offset,
  self,
  flow,
}: {
  a: Rect
  b: Rect
  offset: number
  self: boolean
  flow: UmlDirection
}) {
  if (self) {
    const x = a.x + a.width
    const y = a.y + a.height / 2
    const path = `M ${String(x)} ${String(y - 12)} C ${String(x + 46)} ${String(y - 34)}, ${String(x + 46)} ${String(y + 34)}, ${String(x)} ${String(y + 12)}`
    return {
      path,
      label: { x: x + 40, y },
      source: { x, y: y - 12 },
      target: { x, y: y + 12 },
      sides: [Position.Right, Position.Right] as const,
    }
  }
  const [sourceSide, targetSide] = sides(a, b, flow)
  const source = anchor(a, sourceSide, offset, b)
  const target = anchor(b, targetSide, offset, a)
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: source.x,
    sourceY: source.y,
    sourcePosition: sourceSide,
    targetX: target.x,
    targetY: target.y,
    targetPosition: targetSide,
    borderRadius: 6,
    offset: 18,
  })
  return {
    path,
    label: { x: labelX, y: labelY },
    source,
    target,
    sides: [sourceSide, targetSide] as const,
  }
}

const labelClass =
  'nodrag nopan pointer-events-none absolute rounded-sm bg-background/90 px-1 text-[11.5px] leading-4 text-fg-secondary'

function UmlEdge({ source, target, data, selected }: EdgeProps<DiagramFlowEdge>) {
  const a = rectOf(useInternalNode<DiagramFlowNode>(source))
  const b = rectOf(useInternalNode<DiagramFlowNode>(target))
  if (!a || !b || !data) return null
  const { edge, markers, offset, flow } = data
  const g = geometry({ a, b, offset, self: source === target, flow })
  const at = (p: { x: number; y: number }) => ({
    transform: `translate(-50%, -50%) translate(${String(p.x)}px, ${String(p.y)}px)`,
  })
  const label = [edge.label, edge.technology ? `[${edge.technology}]` : '']
    .filter(Boolean)
    .join('\n')
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

const NODE_TYPES = {
  box: BoxNode,
  pseudo: PseudoNode,
  frame: FrameNode,
  actor: ActorNode,
  ellipse: EllipseNode,
  decision: DecisionNode,
  lollipop: LollipopNode,
  port: PortNode,
  folder: FolderNode,
}
const EDGE_TYPES = { uml: UmlEdge }

export {
  BoxShape,
  type DiagramFlowEdge,
  type DiagramFlowNode,
  DiagramMarkers,
  EDGE_TYPES,
  eyebrow,
  NODE_TYPES,
  nodeLabel,
}
