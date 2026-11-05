import {
  BookOpenIcon,
  BotIcon,
  CheckIcon,
  CircleAlertIcon,
  ClockIcon,
  ListIcon,
  Loader2Icon,
  MaximizeIcon,
  NetworkIcon,
  UserIcon,
  WrenchIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react'
import * as React from 'react'

import {
  AgentAvatar,
  type AgentAvatarState,
  type AgentAvatarVariant,
} from '@/components/ui/agent-avatar'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** `tool` and `knowledge` sit in a shared row at the bottom; `human` is laid out like an agent. */
type AgentNodeKind = 'agent' | 'human' | 'tool' | 'knowledge'

interface AgentGraphNode {
  id: string
  name: string
  kind?: AgentNodeKind
  /** What it does in the system: "Supervisor", "Researcher". */
  role?: string
  /** The id of its team in `teams`. */
  team?: string
  /** The model's display name. */
  model?: string
  status?: 'active' | 'paused' | 'draft'
}

interface AgentGraphTeam {
  id: string
  name: string
}

/**
 * `delegates`: a supervisor gives a sub-task and gets the result back. `handoff`: the conversation
 * moves to another agent. `uses`: an agent calls a tool or searches a knowledge base.
 */
type AgentEdgeKind = 'delegates' | 'handoff' | 'uses'

interface AgentGraphEdge {
  from: string
  to: string
  kind: AgentEdgeKind
  /** A short word on the link ("billing questions"). */
  label?: string
}

/** What an agent is doing in the run being shown. */
type AgentActivity = 'working' | 'waiting' | 'done' | 'failed'

const NODE_W = 184
const NODE_H = 64
const RES_W = 148
const RES_H = 36
const COL_GAP = 48
const ROW_GAP = 84
const FRAME_PAD = 14
const FRAME_TOP = 34
const MARGIN = 20

interface PlacedNode {
  node: AgentGraphNode
  x: number
  y: number
  w: number
  h: number
  row: number
}

interface PlacedEdge {
  edge: AgentGraphEdge
  path: string
  arrow: string
  mid: { x: number; y: number }
  /** True for a link between neighbours on one row: its label goes above the line. */
  flat?: boolean
}

interface PlacedFrame {
  team: AgentGraphTeam
  x: number
  y: number
  w: number
  h: number
}

interface AgentGraphLayout {
  nodes: PlacedNode[]
  edges: PlacedEdge[]
  frames: PlacedFrame[]
  width: number
  height: number
}

const isResource = (n: AgentGraphNode) => n.kind === 'tool' || n.kind === 'knowledge'

/** The edges that point at known nodes, without self-links or exact duplicates. */
function cleanEdges(nodes: AgentGraphNode[], edges: AgentGraphEdge[]) {
  const ids = new Set(nodes.map((n) => n.id))
  const seen = new Set<string>()
  return edges.filter((e) => {
    const key = `${e.kind}\u0000${e.from}\u0000${e.to}`
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** One entry per id (the first wins), so a repeated id can't break the layout. */
function uniqueNodes(nodes: AgentGraphNode[]) {
  const seen = new Set<string>()
  return nodes.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)))
}

/**
 * Row of each agent: one below the lowest agent that delegates to it. Delegation cycles are broken
 * where they close. An agent outside the hierarchy (no delegation either way) sits on the row of the
 * agent that hands off to it.
 */
function layers(agents: AgentGraphNode[], edges: AgentGraphEdge[]) {
  const ids = new Set(agents.map((a) => a.id))
  const delegates = edges.filter((e) => e.kind === 'delegates' && ids.has(e.from) && ids.has(e.to))
  const children = new Map<string, string[]>()
  for (const e of delegates) children.set(e.from, [...(children.get(e.from) ?? []), e.to])

  // Depth-first topological order; an edge back to a node still on the stack closes a cycle and is
  // ignored.
  const state = new Map<string, 'open' | 'done'>()
  const order: string[] = []
  const ignored = new Set<string>()
  const visit = (id: string) => {
    state.set(id, 'open')
    for (const c of children.get(id) ?? []) {
      const s = state.get(c)
      if (s === 'open') ignored.add(`${id}\u0000${c}`)
      else if (!s) visit(c)
    }
    state.set(id, 'done')
    order.push(id)
  }
  for (const a of agents) if (!state.has(a.id)) visit(a.id)
  order.reverse()

  const layer = new Map(agents.map((a) => [a.id, 0]))
  for (const id of order)
    for (const c of children.get(id) ?? [])
      if (!ignored.has(`${id}\u0000${c}`))
        layer.set(c, Math.max(layer.get(c) ?? 0, (layer.get(id) ?? 0) + 1))

  const inHierarchy = new Set(delegates.flatMap((e) => [e.from, e.to]))
  const handoffs = edges.filter(
    (e) => e.kind === 'handoff' && ids.has(e.from) && ids.has(e.to) && !inHierarchy.has(e.to),
  )
  // Values only grow up to the deepest row, so this settles; the bound guards long handoff chains.
  for (const _ of agents) {
    let changed = false
    for (const e of handoffs) {
      const next = layer.get(e.from) ?? 0
      if (next > (layer.get(e.to) ?? 0)) {
        layer.set(e.to, next)
        changed = true
      }
    }
    if (!changed) break
  }
  return layer
}

function curve(
  x1: number,
  y1: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x2: number,
  y2: number,
) {
  const angle = Math.atan2(y2 - c2y, x2 - c2x)
  const size = 7
  const a = (d: number) => `${x2 - size * Math.cos(angle + d)},${y2 - size * Math.sin(angle + d)}`
  // The point halfway along the cubic, for the label.
  const mid = {
    x: (x1 + 3 * c1x + 3 * c2x + x2) / 8,
    y: (y1 + 3 * c1y + 3 * c2y + y2) / 8,
  }
  return {
    path: `M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`,
    arrow: `M${a(0.45)} L${x2},${y2} L${a(-0.45)}`,
    mid,
  }
}

/** Positions for every node, frame and edge. Pure, so it can be tested and memoised. */
function layoutAgentGraph(
  inputNodes: AgentGraphNode[],
  inputEdges: AgentGraphEdge[],
  inputTeams: AgentGraphTeam[] = [],
): AgentGraphLayout {
  const nodes = uniqueNodes(inputNodes)
  const edges = cleanEdges(nodes, inputEdges)
  const agents = nodes.filter((n) => !isResource(n))
  const resources = nodes.filter(isResource)
  const layer = layers(agents, edges)
  const agentRows = agents.length ? Math.max(...agents.map((a) => layer.get(a.id) ?? 0)) + 1 : 0

  const teams = inputTeams.filter((t) => agents.some((a) => a.team === t.id))
  const teamOf = (n: AgentGraphNode) =>
    n.team !== undefined && teams.some((t) => t.id === n.team) ? n.team : undefined

  // Rows holding at least one agent in a team are split into team columns; rows without any (a
  // supervisor above the teams) are centred across the whole width.
  const rows = Array.from({ length: agentRows }, (_, r) =>
    agents.filter((a) => (layer.get(a.id) ?? 0) === r),
  )
  const mixed = rows.map((row) => row.some((a) => teamOf(a) !== undefined))
  const blockKeys = [...teams.map((t) => t.id), '']
  const cols = new Map(
    blockKeys.map((k) => [
      k,
      Math.max(
        0,
        ...rows.map((row, r) => (mixed[r] ? row.filter((a) => (teamOf(a) ?? '') === k).length : 0)),
      ),
    ]),
  )
  const blockWidth = (k: string) => {
    const n = cols.get(k) ?? 0
    return n ? n * NODE_W + (n - 1) * COL_GAP + (k ? FRAME_PAD * 2 : 0) : 0
  }
  const widths = blockKeys.map(blockWidth).filter((w) => w > 0)
  const blocksWidth = widths.reduce((a, b) => a + b, 0) + Math.max(0, widths.length - 1) * COL_GAP
  const rowWidth = (n: number, w: number) => (n ? n * w + (n - 1) * COL_GAP : 0)
  const width =
    MARGIN * 2 +
    Math.max(
      blocksWidth,
      ...rows.map((row, r) => (mixed[r] ? 0 : rowWidth(row.length, NODE_W))),
      rowWidth(resources.length, RES_W),
      NODE_W,
    )
  const blockX = new Map<string, number>()
  let cursor = MARGIN + (width - MARGIN * 2 - blocksWidth) / 2
  for (const k of blockKeys) {
    if (!blockWidth(k)) continue
    blockX.set(k, cursor)
    cursor += blockWidth(k) + COL_GAP
  }

  const top = MARGIN + (teams.length ? FRAME_TOP : 0)
  const rowY = (r: number) => top + r * (NODE_H + ROW_GAP)
  const placed = new Map<string, PlacedNode>()
  const neighbours = (id: string) =>
    edges
      .filter((e) => e.kind !== 'uses' && (e.from === id || e.to === id))
      .map((e) => (e.from === id ? e.to : e.from))
  // Order each row by the average position of the agents already placed above it, so links cross
  // less; agents without a link above keep their input order.
  const byBarycentre = (row: AgentGraphNode[], linked: (id: string) => string[]) => {
    const score = row.map((n, i) => {
      const xs = linked(n.id)
        .map((id) => placed.get(id))
        .filter((p): p is PlacedNode => p !== undefined)
        .map((p) => p.x + p.w / 2)
      return { n, key: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null, i }
    })
    const anchored = score.filter((s) => s.key !== null).sort((a, b) => (a.key ?? 0) - (b.key ?? 0))
    const free = score.filter((s) => s.key === null)
    return [...anchored, ...free].map((s) => s.n)
  }
  const placeRow = (
    row: AgentGraphNode[],
    x0: number,
    span: number,
    y: number,
    r: number,
    w: number,
    h: number,
  ) => {
    const start = x0 + (span - rowWidth(row.length, w)) / 2
    row.forEach((n, i) => {
      placed.set(n.id, { node: n, x: start + i * (w + COL_GAP), y, w, h, row: r })
    })
  }

  rows.forEach((row, r) => {
    const ordered = byBarycentre(row, neighbours)
    if (!mixed[r]) {
      placeRow(ordered, MARGIN, width - MARGIN * 2, rowY(r), r, NODE_W, NODE_H)
      return
    }
    for (const k of blockKeys) {
      const x = blockX.get(k)
      if (x === undefined) continue
      const inBlock = ordered.filter((a) => (teamOf(a) ?? '') === k)
      placeRow(inBlock, x, blockWidth(k), rowY(r), r, NODE_W, NODE_H)
    }
  })
  if (resources.length) {
    const users = (id: string) => edges.filter((e) => e.to === id).map((e) => e.from)
    placeRow(
      byBarycentre(resources, users),
      MARGIN,
      width - MARGIN * 2,
      rowY(agentRows),
      agentRows,
      RES_W,
      RES_H,
    )
  }

  const frames: PlacedFrame[] = []
  for (const team of teams) {
    const members = [...placed.values()].filter((p) => teamOf(p.node) === team.id)
    const x = blockX.get(team.id)
    if (!members.length || x === undefined) continue
    const minRow = Math.min(...members.map((m) => m.row))
    const maxRow = Math.max(...members.map((m) => m.row))
    const y = rowY(minRow) - FRAME_TOP
    frames.push({ team, x, y, w: blockWidth(team.id), h: rowY(maxRow) + NODE_H + FRAME_PAD - y })
  }

  // Edges between the same two nodes are spread apart so neither hides the other.
  const pairCount = new Map<string, number>()
  const pairKey = (e: AgentGraphEdge) => [e.from, e.to].sort().join('\u0000')
  for (const e of edges) pairCount.set(pairKey(e), (pairCount.get(pairKey(e)) ?? 0) + 1)
  const pairSeen = new Map<string, number>()
  const rowOrder = (p: PlacedNode) =>
    [...placed.values()]
      .filter((q) => q.row === p.row)
      .sort((a, b) => a.x - b.x)
      .indexOf(p)

  const placedEdges = edges.flatMap((edge): PlacedEdge[] => {
    const a = placed.get(edge.from)
    const b = placed.get(edge.to)
    if (!a || !b) return []
    const key = pairKey(edge)
    const n = pairCount.get(key) ?? 1
    const i = pairSeen.get(key) ?? 0
    pairSeen.set(key, i + 1)
    const off = (i - (n - 1) / 2) * 14
    const ax = a.x + a.w / 2
    const bx = b.x + b.w / 2
    if (a.row !== b.row) {
      const down = b.row > a.row
      const y1 = down ? a.y + a.h : a.y
      const y2 = down ? b.y : b.y + b.h
      const dy = (y2 - y1) / 2
      return [{ edge, ...curve(ax + off, y1, ax + off, y1 + dy, bx + off, y2 - dy, bx + off, y2) }]
    }
    // Same row: neighbours are joined side to side; others by an arc through the gap below.
    const right = b.x > a.x
    if (Math.abs(rowOrder(a) - rowOrder(b)) === 1) {
      const x1 = right ? a.x + a.w : a.x
      const x2 = right ? b.x : b.x + b.w
      const y = a.y + a.h / 2 + off
      const dx = (x2 - x1) / 2
      return [{ edge, flat: true, ...curve(x1, y, x1 + dx, y, x2 - dx, y, x2, y) }]
    }
    const y = a.y + a.h
    const dip = Math.min(ROW_GAP - 18, 30 + Math.abs(bx - ax) / 8) + off
    const x1 = ax + (right ? 24 : -24)
    const x2 = bx + (right ? -24 : 24)
    return [{ edge, ...curve(x1, y, x1, y + dip, x2, y + dip, x2, y) }]
  })

  const all = [...placed.values()]
  const height = all.length ? Math.max(...all.map((p) => p.y + p.h)) + MARGIN + 28 : MARGIN * 2
  return { nodes: all, edges: placedEdges, frames, width, height }
}

/** Who an agent works with, by kind of link and direction. */
function agentRelations(id: string, edges: AgentGraphEdge[]) {
  const out = (kind: AgentEdgeKind) =>
    edges.filter((e) => e.kind === kind && e.from === id).map((e) => e.to)
  const into = (kind: AgentEdgeKind) =>
    edges.filter((e) => e.kind === kind && e.to === id).map((e) => e.from)
  return {
    reportsTo: into('delegates'),
    delegatesTo: out('delegates'),
    handsOffTo: out('handoff'),
    takesOverFrom: into('handoff'),
    uses: out('uses'),
    usedBy: into('uses'),
  }
}

type AgentRelations = ReturnType<typeof agentRelations>

/** The face an agent's avatar makes for its activity in the run, or its status outside one. */
function agentAvatarState(node: AgentGraphNode, activity?: AgentActivity): AgentAvatarState {
  if (activity === 'working') return 'thinking'
  if (activity === 'done') return 'done'
  if (activity === 'failed') return 'error'
  if (activity === 'waiting') return 'idle'
  return node.status === 'paused' ? 'offline' : 'idle'
}

const KIND_ICON = { agent: BotIcon, human: UserIcon, tool: WrenchIcon, knowledge: BookOpenIcon }

const ACTIVITY = {
  working: { icon: Loader2Icon, className: 'text-primary-text', iconClass: 'animate-spin' },
  waiting: { icon: ClockIcon, className: 'text-muted-foreground', iconClass: '' },
  done: { icon: CheckIcon, className: 'text-success', iconClass: '' },
  failed: { icon: CircleAlertIcon, className: 'text-destructive', iconClass: '' },
} as const

const EDGE_STROKE = {
  delegates: '',
  handoff: '6 5',
  uses: '1.5 4',
} as const

const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5]
/** Below this fit-to-width scale the cards' text is too small to read. */
const MIN_READABLE = 0.6
// Stable defaults, so the memoised layout isn't recomputed on every render.
const NO_TEAMS: AgentGraphTeam[] = []
const NO_ACTIVITY: Partial<Record<string, AgentActivity>> = {}
const NO_PATH: string[] = []

function useListFormat() {
  const { locale } = useCoreloomI18n()
  return React.useCallback(
    (items: string[]) => new Intl.ListFormat(locale, { type: 'conjunction' }).format(items),
    [locale],
  )
}

/** The relations of one agent as sentences, for screen readers and the list view. */
function useRelationText() {
  const t = useCoreloomI18n().messages.ai.agentGraph.relations
  const list = useListFormat()
  return React.useCallback(
    (rel: AgentRelations, nameOf: (id: string) => string) => {
      const parts: string[] = []
      const add = (ids: string[], say: (names: string) => string) => {
        if (ids.length) parts.push(say(list(ids.map(nameOf))))
      }
      add(rel.reportsTo, t.reportsTo)
      add(rel.delegatesTo, t.delegatesTo)
      add(rel.takesOverFrom, t.takesOverFrom)
      add(rel.handsOffTo, t.handsOffTo)
      add(rel.uses, t.uses)
      add(rel.usedBy, t.usedBy)
      return parts.join(' ')
    },
    [t, list],
  )
}

function AgentGraphLegend({ className }: { className?: string }) {
  const t = useCoreloomI18n().messages.ai.agentGraph
  return (
    <ul
      aria-label={t.legend}
      className={cn('m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1 p-0', className)}
    >
      {(['delegates', 'handoff', 'uses'] as const).map((kind) => (
        <li key={kind} className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <svg aria-hidden width="28" height="8" className="overflow-visible">
            <path
              d="M1,4 L27,4"
              className={kind === 'uses' ? 'stroke-border-strong' : 'stroke-fg-secondary'}
              strokeWidth={kind === 'uses' ? 1.5 : 1.75}
              strokeDasharray={EDGE_STROKE[kind]}
              strokeLinecap="round"
              fill="none"
            />
          </svg>
          {t.edges[kind]}
        </li>
      ))}
    </ul>
  )
}

/** The agents, their teams and their links, as a graph or a list. */
function AgentGraph({
  agents,
  edges,
  teams = NO_TEAMS,
  selectedId: selectedProp,
  defaultSelectedId,
  onSelectedChange,
  activity = NO_ACTIVITY,
  activePath = NO_PATH,
  view: viewProp,
  defaultView,
  onViewChange,
  maxHeight = 560,
  legend = true,
  avatars,
  label,
  className,
}: {
  agents: AgentGraphNode[]
  edges: AgentGraphEdge[]
  teams?: AgentGraphTeam[]
  /** Controlled selection; `null` is nothing selected. */
  selectedId?: string | null
  defaultSelectedId?: string
  onSelectedChange?: (id: string | null) => void
  /** What each agent is doing in the run being shown, by id. */
  activity?: Partial<Record<string, AgentActivity>>
  /** The agents a run went through, in order; the links between them are highlighted. */
  activePath?: string[]
  view?: 'graph' | 'list'
  /**
   * Left out, the list view when the box is too narrow to read the graph (a phone), else the graph.
   */
  defaultView?: 'graph' | 'list'
  onViewChange?: (view: 'graph' | 'list') => void
  /** The graph scrolls beyond this height (px). */
  maxHeight?: number
  legend?: boolean
  /**
   * Draw agents as animated AgentAvatars (`face` or `dots`), seeded by id, that follow their
   * activity: working thinks, done smiles, failed frowns, paused sleeps. Off: a robot icon.
   */
  avatars?: AgentAvatarVariant
  /** Names the graph for screen readers (default: "Agents and how they work together"). */
  label?: string
  className?: string
}) {
  const { messages, locale } = useCoreloomI18n()
  const t = messages.ai.agentGraph
  const baseId = React.useId()
  const list = useListFormat()
  const relationText = useRelationText()

  const [selectedState, setSelectedState] = React.useState<string | null>(defaultSelectedId ?? null)
  const selected = selectedProp !== undefined ? selectedProp : selectedState
  const select = (id: string | null) => {
    setSelectedState(id)
    onSelectedChange?.(id)
  }
  const [viewState, setViewState] = React.useState(defaultView)
  const [boxWidth, setBoxWidth] = React.useState(0)
  const root = React.useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = React.useState<number | null>(null)
  const [containerWidth, setContainerWidth] = React.useState(0)
  const [focusId, setFocusId] = React.useState<string | null>(null)
  const scroller = React.useRef<HTMLDivElement>(null)
  const buttons = React.useRef(new Map<string, HTMLButtonElement>())

  const layout = React.useMemo(() => layoutAgentGraph(agents, edges, teams), [agents, edges, teams])
  // Until a view is picked, a graph that would have to shrink below MIN_READABLE starts as a list.
  const view =
    viewProp ??
    viewState ??
    (boxWidth > 0 && layout.width * MIN_READABLE > boxWidth ? 'list' : 'graph')
  const clean = React.useMemo(() => layout.edges.map((e) => e.edge), [layout])
  const byId = React.useMemo(() => new Map(layout.nodes.map((p) => [p.node.id, p])), [layout])
  const nameOf = (id: string) => byId.get(id)?.node.name ?? id
  const teamName = (id?: string) => teams.find((tm) => tm.id === id)?.name

  const fit = containerWidth
    ? Math.min(1, Math.max(ZOOMS[0] ?? 0.5, (containerWidth - 2) / layout.width))
    : 1
  const scale = zoom ?? fit
  // The wheel handler is attached once; it reads the current scale from here.
  const scaleRef = React.useRef(scale)
  React.useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  React.useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setContainerWidth(el.clientWidth)
    })
    ro.observe(el)
    // Ctrl/⌘ + wheel zooms (and pinch on a trackpad); a plain wheel keeps scrolling the page.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const factor = Math.exp(-e.deltaY / 300)
      setZoom(Math.min(1.5, Math.max(0.5, Math.round(scaleRef.current * factor * 100) / 100)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      ro.disconnect()
      el.removeEventListener('wheel', onWheel)
    }
  }, [view])

  // The box's width, to pick the first view (the box shows once there are agents).
  const hasNodes = layout.nodes.length > 0
  React.useEffect(() => {
    const el = root.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setBoxWidth(el.clientWidth)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
    }
  }, [hasNodes])

  // Once the width is known, bring the selected agent (else the top row) into view when the graph
  // is wider than its box — on a phone. Only the box scrolls, never the page.
  const measured = containerWidth > 0
  React.useEffect(() => {
    const el = scroller.current
    if (!measured || !el || el.scrollWidth <= el.clientWidth) return
    const target =
      (selected ? layout.nodes.find((p) => p.node.id === selected) : undefined) ??
      [...layout.nodes].sort((a, b) => a.row - b.row || a.x - b.x).at(0)
    if (!target) return
    el.scrollLeft = (target.x + target.w / 2) * scaleRef.current - el.clientWidth / 2
    // Only on first measure: later selections come from the user, who is already looking there.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once the width is known
  }, [measured, view])

  // An agent selected out of sight (from a link in a side panel, say) scrolls into the box.
  React.useEffect(() => {
    const el = scroller.current
    const button = selected ? buttons.current.get(selected) : undefined
    if (!measured || !el || !button) return
    const box = el.getBoundingClientRect()
    const r = button.getBoundingClientRect()
    if (r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom)
      return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({
      left: el.scrollLeft + (r.left + r.width / 2) - (box.left + box.width / 2),
      top: el.scrollTop + (r.top + r.height / 2) - (box.top + box.height / 2),
      behavior: reduce ? 'auto' : 'smooth',
    })
  }, [selected, measured, view])

  // Drag the background to pan.
  const drag = React.useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scroller.current
    if (!el || e.button !== 0 || (e.target as Element).closest('button')) return
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
    el.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scroller.current
    const d = drag.current
    if (!el || !d) return
    el.scrollLeft = d.left - (e.clientX - d.x)
    el.scrollTop = d.top - (e.clientY - d.y)
  }
  const onPointerUp = () => {
    drag.current = null
  }

  // Reading order: rows top to bottom, left to right.
  const ordered = React.useMemo(
    () => [...layout.nodes].sort((a, b) => a.row - b.row || a.x - b.x),
    [layout],
  )
  const tabStop =
    (focusId && byId.has(focusId) ? focusId : null) ??
    (selected && byId.has(selected) ? selected : null) ??
    ordered[0]?.node.id

  const move = (from: PlacedNode, key: string) => {
    const row = ordered.filter((p) => p.row === from.row)
    const i = row.indexOf(from)
    const centre = (p: PlacedNode) => p.x + p.w / 2
    const nearest = (rowIndex: number) => {
      const candidates = ordered.filter((p) => p.row === rowIndex)
      return candidates.sort(
        (a, b) => Math.abs(centre(a) - centre(from)) - Math.abs(centre(b) - centre(from)),
      )[0]
    }
    const rowsAbove = [...new Set(ordered.map((p) => p.row))].filter((r) => r < from.row)
    const rowsBelow = [...new Set(ordered.map((p) => p.row))].filter((r) => r > from.row)
    switch (key) {
      case 'ArrowRight':
        return row[i + 1]
      case 'ArrowLeft':
        return row[i - 1]
      case 'ArrowDown':
        return rowsBelow.length ? nearest(Math.min(...rowsBelow)) : undefined
      case 'ArrowUp':
        return rowsAbove.length ? nearest(Math.max(...rowsAbove)) : undefined
      case 'Home':
        return ordered[0]
      case 'End':
        return ordered.at(-1)
      default:
        return undefined
    }
  }
  const onNodeKeyDown = (e: React.KeyboardEvent, p: PlacedNode) => {
    if (e.key === 'Escape' && selected !== null) {
      e.preventDefault()
      select(null)
      return
    }
    const next = move(p, e.key)
    if (!next) return
    e.preventDefault()
    setFocusId(next.node.id)
    buttons.current.get(next.node.id)?.focus()
  }

  // With an agent selected, links that don't touch it fade.
  const focusing = selected !== null && byId.has(selected)

  const pathEdges = React.useMemo(() => {
    const keys = new Set<string>()
    for (let i = 0; i + 1 < activePath.length; i++) {
      const a = activePath[i] ?? ''
      const b = activePath[i + 1] ?? ''
      keys.add(`${a}\u0000${b}`)
      keys.add(`${b}\u0000${a}`)
    }
    return keys
  }, [activePath])

  const working = layout.nodes
    .filter((p) => activity[p.node.id] === 'working')
    .map((p) => p.node.name)
  const percent = new Intl.NumberFormat(locale, { style: 'percent' }).format(scale)
  const zoomTo = (dir: 1 | -1) => {
    const next =
      dir > 0
        ? ZOOMS.find((z) => z > scale + 0.001)
        : [...ZOOMS].reverse().find((z) => z < scale - 0.001)
    if (next !== undefined) setZoom(next)
  }

  const nodeText = (n: AgentGraphNode) => {
    const kind = n.kind ?? 'agent'
    const act = activity[n.id]
    return [
      kind === 'agent' ? null : t.kinds[kind],
      n.role,
      n.model,
      teamName(n.team) ? t.inTeam(teamName(n.team) ?? '') : null,
      n.status && n.status !== 'active' ? messages.ai.agents.status[n.status] : null,
      act ? t.activity[act] : null,
    ]
      .filter(Boolean)
      .join(', ')
  }

  // The card's third line: a paused or draft status, else the model when the role took line two.
  const footer = (n: AgentGraphNode) =>
    n.status && n.status !== 'active'
      ? messages.ai.agents.status[n.status]
      : n.role
        ? n.model
        : undefined

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={view}
        aria-label={t.view}
        onValueChange={(v) => {
          if (v !== 'graph' && v !== 'list') return
          setViewState(v)
          onViewChange?.(v)
        }}
      >
        <ToggleGroupItem value="graph">
          <NetworkIcon aria-hidden />
          {t.graph}
        </ToggleGroupItem>
        <ToggleGroupItem value="list">
          <ListIcon aria-hidden />
          {t.list}
        </ToggleGroupItem>
      </ToggleGroup>
      {view === 'graph' && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.zoomOut}
            disabled={scale <= (ZOOMS[0] ?? 0.5) + 0.001}
            onClick={() => {
              zoomTo(-1)
            }}
          >
            <ZoomOutIcon aria-hidden />
          </Button>
          <span
            aria-hidden
            className="w-11 text-center font-mono text-[11.5px] text-muted-foreground tabular-nums"
          >
            {percent}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.zoomIn}
            disabled={scale >= (ZOOMS.at(-1) ?? 1.5) - 0.001}
            onClick={() => {
              zoomTo(1)
            }}
          >
            <ZoomInIcon aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.fit}
            aria-pressed={zoom === null}
            onClick={() => {
              setZoom(null)
            }}
          >
            <MaximizeIcon aria-hidden />
          </Button>
        </div>
      )}
    </div>
  )

  if (!layout.nodes.length)
    return (
      <div
        data-slot="agent-graph"
        className={cn('rounded-lg border border-border bg-card px-4 py-10 text-center', className)}
      >
        <p className="m-0 text-[13px] text-muted-foreground">{t.empty}</p>
      </div>
    )

  // Groups for the list view: each team, the agents without one, then tools and knowledge.
  const groups = [
    ...teams.map((tm) => ({
      key: tm.id,
      label: tm.name,
      items: ordered.filter((p) => !isResource(p.node) && p.node.team === tm.id),
    })),
    {
      key: '',
      label: teams.length ? t.unteamed : t.agents,
      items: ordered.filter(
        (p) => !isResource(p.node) && !teams.some((tm) => tm.id === p.node.team),
      ),
    },
    { key: 'resources', label: t.resources, items: ordered.filter((p) => isResource(p.node)) },
  ].filter((g) => g.items.length)

  return (
    <div
      ref={root}
      data-slot="agent-graph"
      className={cn('flex min-w-0 flex-col rounded-lg border border-border bg-card', className)}
    >
      {toolbar}
      <p aria-live="polite" className="sr-only">
        {working.length ? t.nowWorking(list(working), working.length) : ''}
      </p>
      {view === 'graph' ? (
        <div
          ref={scroller}
          role="group"
          aria-label={label ?? t.label}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative cursor-grab overflow-auto overscroll-contain bg-inset/40 active:cursor-grabbing"
          style={{ maxHeight, height: layout.height * scale + 2 }}
        >
          <div
            className="relative mx-auto"
            style={{ width: layout.width * scale, height: layout.height * scale }}
          >
            <div
              className="absolute top-0 left-0 origin-top-left"
              style={{
                width: layout.width,
                height: layout.height,
                transform: `scale(${scale})`,
              }}
            >
              <svg
                aria-hidden
                width={layout.width}
                height={layout.height}
                className="absolute inset-0 overflow-visible"
              >
                {layout.frames.map((f) => (
                  <rect
                    key={f.team.id}
                    x={f.x}
                    y={f.y}
                    width={f.w}
                    height={f.h}
                    rx={12}
                    className="fill-card stroke-border"
                    strokeWidth={1}
                  />
                ))}
                {layout.edges.map((pe, i) => {
                  const { edge } = pe
                  const onPath =
                    pathEdges.has(`${edge.from}\u0000${edge.to}`) && edge.kind !== 'uses'
                  const touches = focusing && (edge.from === selected || edge.to === selected)
                  const dim = focusing && !touches && !onPath
                  const tone = onPath
                    ? 'stroke-primary'
                    : touches
                      ? 'stroke-foreground'
                      : edge.kind === 'uses'
                        ? 'stroke-border-strong'
                        : 'stroke-fg-secondary'
                  return (
                    <g
                      key={`${edge.kind}-${edge.from}-${edge.to}-${String(i)}`}
                      data-edge={edge.kind}
                      data-active={onPath || undefined}
                      className={cn('transition-opacity duration-150', dim && 'opacity-30')}
                    >
                      <path
                        d={pe.path}
                        fill="none"
                        className={tone}
                        strokeWidth={onPath ? 2.5 : edge.kind === 'uses' ? 1.5 : 1.75}
                        strokeDasharray={EDGE_STROKE[edge.kind]}
                        strokeLinecap="round"
                      />
                      {edge.kind !== 'uses' && (
                        <path
                          d={pe.arrow}
                          fill="none"
                          className={tone}
                          strokeWidth={onPath ? 2.5 : 1.75}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                    </g>
                  )
                })}
              </svg>
              {layout.frames.map((f) => (
                <p
                  key={f.team.id}
                  aria-hidden
                  className="absolute m-0 truncate font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
                  style={{ left: f.x + FRAME_PAD, top: f.y + 10, maxWidth: f.w - FRAME_PAD * 2 }}
                >
                  {f.team.name}
                </p>
              ))}
              {layout.edges.map((pe, i) =>
                pe.edge.label ? (
                  <span
                    key={`label-${String(i)}`}
                    aria-hidden
                    className="absolute max-w-36 -translate-x-1/2 -translate-y-1/2 truncate rounded-sm bg-card px-1 text-[11px] text-muted-foreground"
                    style={{ left: pe.mid.x, top: pe.mid.y - (pe.flat ? 11 : 0) }}
                  >
                    {pe.edge.label}
                  </span>
                ) : null,
              )}
              {layout.nodes.map((p) => {
                const n = p.node
                const kind = n.kind ?? 'agent'
                const Icon = KIND_ICON[kind]
                const act = activity[n.id]
                const Act = act ? ACTIVITY[act] : null
                const isSelected = selected === n.id
                const rel = relationText(agentRelations(n.id, clean), nameOf)
                const resource = isResource(n)
                return (
                  <button
                    key={n.id}
                    ref={(el) => {
                      if (el) buttons.current.set(n.id, el)
                      else buttons.current.delete(n.id)
                    }}
                    type="button"
                    data-agent={n.id}
                    data-activity={act}
                    tabIndex={n.id === tabStop ? 0 : -1}
                    aria-pressed={isSelected}
                    // The card's lines are fragments; the name reads them as one phrase.
                    aria-label={nodeText(n) ? `${n.name}, ${nodeText(n)}` : n.name}
                    aria-describedby={rel ? `${baseId}-rel-${n.id}` : undefined}
                    onFocus={() => {
                      setFocusId(n.id)
                    }}
                    onClick={() => {
                      select(isSelected ? null : n.id)
                    }}
                    onKeyDown={(e) => {
                      onNodeKeyDown(e, p)
                    }}
                    className={cn(
                      'absolute flex cursor-pointer items-center gap-2.5 border bg-card text-left shadow-xs transition-[border-color,box-shadow,opacity] duration-150 outline-none hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring',
                      resource ? 'rounded-full px-3' : 'rounded-lg px-3',
                      isSelected
                        ? 'border-primary ring-2 ring-primary/40'
                        : act === 'working'
                          ? 'border-primary'
                          : act === 'failed'
                            ? 'border-destructive'
                            : 'border-border',
                      n.status === 'paused' || n.status === 'draft' ? 'border-dashed' : '',
                    )}
                    style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
                  >
                    {avatars && kind === 'agent' ? (
                      <AgentAvatar
                        variant={avatars}
                        seed={n.id}
                        state={agentAvatarState(n, act)}
                        decorative
                      />
                    ) : (
                      <span
                        aria-hidden
                        className={cn(
                          'flex shrink-0 items-center justify-center rounded-md',
                          resource
                            ? 'size-5 text-muted-foreground'
                            : 'size-8 bg-secondary text-fg-secondary',
                          act === 'working' && !resource && 'bg-primary-subtle text-primary-text',
                        )}
                      >
                        <Icon className={resource ? 'size-3.5' : 'size-4'} />
                      </span>
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] leading-5 font-semibold text-foreground">
                        {n.name}
                      </span>
                      {!resource && (n.role ?? n.model) && (
                        <span
                          aria-hidden
                          className="truncate text-[12px] leading-4 text-muted-foreground"
                        >
                          {n.role ?? n.model}
                        </span>
                      )}
                      {!resource && (Act ?? footer(n)) && (
                        <span
                          aria-hidden
                          className={cn(
                            'mt-0.5 flex items-center gap-1 truncate text-[11.5px] leading-4',
                            Act ? Act.className : 'text-muted-foreground',
                          )}
                        >
                          {Act && act ? (
                            <>
                              <Act.icon
                                className={cn(
                                  'size-3 shrink-0 motion-reduce:animate-[spin_1.5s_linear_infinite]',
                                  Act.iconClass,
                                )}
                              />
                              {t.activity[act]}
                            </>
                          ) : (
                            footer(n)
                          )}
                        </span>
                      )}
                    </span>
                    {rel && (
                      <span id={`${baseId}-rel-${n.id}`} hidden>
                        {rel}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-3" style={{ maxHeight, overflow: 'auto' }}>
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-1.5">
              <p
                id={`${baseId}-group-${g.key}`}
                className="m-0 px-1 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
              >
                {g.label}
              </p>
              <ul
                aria-labelledby={`${baseId}-group-${g.key}`}
                className="m-0 flex list-none flex-col gap-1 p-0"
              >
                {g.items.map((p) => {
                  const n = p.node
                  const Icon = KIND_ICON[n.kind ?? 'agent']
                  const act = activity[n.id]
                  const rel = relationText(agentRelations(n.id, clean), nameOf)
                  const isSelected = selected === n.id
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        data-agent={n.id}
                        aria-pressed={isSelected}
                        onClick={() => {
                          select(isSelected ? null : n.id)
                        }}
                        className={cn(
                          'flex w-full cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                          isSelected ? 'bg-primary-subtle' : 'hover:bg-accent/60',
                        )}
                      >
                        {avatars && (n.kind ?? 'agent') === 'agent' ? (
                          <AgentAvatar
                            variant={avatars}
                            seed={n.id}
                            state={agentAvatarState(n, act)}
                            size="xs"
                            decorative
                            className="mt-0.5"
                          />
                        ) : (
                          <Icon
                            aria-hidden
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          />
                        )}
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-[13px] font-semibold text-foreground">
                            {n.name}
                            {[n.role, n.model].filter(Boolean).length > 0 && (
                              <span className="font-normal text-fg-secondary">
                                {' · '}
                                {[n.role, n.model].filter(Boolean).join(' · ')}
                              </span>
                            )}
                            {n.status && n.status !== 'active' && (
                              <span className="font-normal text-fg-secondary">
                                {' · '}
                                {messages.ai.agents.status[n.status]}
                              </span>
                            )}
                            {act && (
                              <span className={cn('font-normal', ACTIVITY[act].className)}>
                                {' · '}
                                {t.activity[act]}
                              </span>
                            )}
                          </span>
                          {rel && <span className="text-[12.5px] text-fg-secondary">{rel}</span>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      {legend && view === 'graph' && (
        <AgentGraphLegend className="border-t border-border-subtle px-3 py-2" />
      )}
    </div>
  )
}

export {
  type AgentActivity,
  agentAvatarState,
  type AgentEdgeKind,
  AgentGraph,
  type AgentGraphEdge,
  type AgentGraphLayout,
  AgentGraphLegend,
  type AgentGraphNode,
  type AgentGraphTeam,
  type AgentNodeKind,
  type AgentRelations,
  agentRelations,
  layoutAgentGraph,
}
