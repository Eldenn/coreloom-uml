import type { UmlPoint } from '@/lib/uml'

interface Rect extends UmlPoint {
  width: number
  height: number
}

interface Size {
  width: number
  height: number
}

/** A box where it is drawn on the canvas (not relative to its frame). */
interface RouteBox extends Rect {
  id: string
  /** The frame it sits in: a line to or from the box may cross that frame. */
  parent?: string
}

interface RouteEdge {
  id: string
  source: string
  target: string
  /** The room its label takes (see `labelSize`). */
  label?: Size
}

type RouteSide = 'left' | 'right' | 'top' | 'bottom'

interface Route {
  /** The corners of the line, from the source's side to the target's. */
  points: UmlPoint[]
  /** The middle of its label. */
  label: UmlPoint
  /** The side of the source it leaves by, and the side of the target it enters by. */
  sides: [RouteSide, RouteSide]
}

/** Room kept between a line and a box it goes round. */
const MARGIN = 16
/** What a corner costs, in pixels of detour: a line takes one only to save more than that. */
const BEND = 48
/** How much longer a stretch counts for each line already on it: the next one looks elsewhere. */
const CROWD = 0.3
/** What leaving or entering a box costs for each line already on that side of it. */
const SHARED_SIDE = 24
/** The corner of a frame its name is written in, which labels keep off. */
const FRAME_NAME: Size = { width: 260, height: 36 }
/** Room between two lines in the same corridor. */
const LANE = 14
const SIDES: readonly RouteSide[] = ['top', 'right', 'bottom', 'left']
// One step in each direction, in the order of SIDES: up, right, down, left.
const DX = [0, 1, 0, -1]
const DY = [-1, 0, 1, 0]

/** A box grown by MARGIN, on whole pixels: lines run along its edges, never inside. */
interface Bounds {
  x0: number
  y0: number
  x1: number
  y1: number
  cx: number
  cy: number
}

function boundsOf(r: Rect): Bounds {
  return {
    x0: Math.round(r.x) - MARGIN,
    y0: Math.round(r.y) - MARGIN,
    x1: Math.round(r.x + r.width) + MARGIN,
    y1: Math.round(r.y + r.height) + MARGIN,
    cx: Math.round(r.x + r.width / 2),
    cy: Math.round(r.y + r.height / 2),
  }
}

/** Where a line leaves the grown box on each side (in the order of SIDES). */
function exits(b: Bounds): UmlPoint[] {
  return [
    { x: b.cx, y: b.y0 },
    { x: b.x1, y: b.cy },
    { x: b.cx, y: b.y1 },
    { x: b.x0, y: b.cy },
  ]
}

/** Where it touches the box itself. */
function anchor(b: Bounds, side: number): UmlPoint {
  const p = exits(b)[side] ?? { x: b.cx, y: b.cy }
  return { x: p.x - (DX[side] ?? 0) * MARGIN, y: p.y - (DY[side] ?? 0) * MARGIN }
}

/**
 * The lines a route may follow: the edges of every grown box and the middle of every box. `right`
 * and `down` list, for each crossing, the boxes the step to the next crossing would go through.
 */
interface Grid {
  xs: number[]
  ys: number[]
  right: number[][]
  down: number[][]
  /** How many routes already take each step, and each side of each box (4 a box). */
  taken: { right: Uint16Array; down: Uint16Array; sides: Uint16Array }
}

const sorted = (values: number[]) => [...new Set(values)].sort((a, b) => a - b)

function makeGrid(all: readonly Bounds[]): Grid {
  const xs = sorted(all.flatMap((b) => [b.x0, b.cx, b.x1]))
  const ys = sorted(all.flatMap((b) => [b.y0, b.cy, b.y1]))
  const right = xs.flatMap(() => ys.map((): number[] => []))
  const down = xs.flatMap(() => ys.map((): number[] => []))
  all.forEach((b, k) => {
    ys.forEach((y, j) => {
      if (y < b.y0 || y >= b.y1) return
      xs.forEach((x, i) => {
        if (x < b.x0 || x >= b.x1) return
        // Box edges are grid lines, so a step that starts inside stays inside.
        if (y > b.y0) right[j * xs.length + i]?.push(k)
        if (x > b.x0) down[j * xs.length + i]?.push(k)
      })
    })
  })
  const taken = {
    right: new Uint16Array(right.length),
    down: new Uint16Array(down.length),
    sides: new Uint16Array(all.length * 4),
  }
  return { xs, ys, right, down, taken }
}

/** A small binary heap of [priority, value], lowest priority first. */
function makeHeap() {
  const items: [number, number][] = []
  const less = (a: number, b: number) => (items[a]?.[0] ?? 0) < (items[b]?.[0] ?? 0)
  const swap = (a: number, b: number) => {
    ;[items[a], items[b]] = [items[b], items[a]]
  }
  return {
    push(priority: number, value: number) {
      let i = items.push([priority, value]) - 1
      while (i > 0 && less(i, (i - 1) >> 1)) {
        swap(i, (i - 1) >> 1)
        i = (i - 1) >> 1
      }
    },
    pop(): [number, number] | undefined {
      const top = items[0]
      const last = items.pop()
      if (!items.length || !last) return top
      items[0] = last
      for (let i = 0; ;) {
        let low = i
        for (const child of [2 * i + 1, 2 * i + 2]) {
          if (child < items.length && less(child, low)) low = child
        }
        if (low === i) break
        swap(i, low)
        i = low
      }
      return top
    },
  }
}

interface Found {
  points: UmlPoint[]
  /** Indexes in SIDES. */
  sides: [number, number]
}

/** The crossing one step from `node` in direction `d`, or -1 when a box that isn't `free` is in the way. */
function step(grid: Grid, node: number, d: number, free: ReadonlySet<number>): number {
  const nx = grid.xs.length
  const i = (node % nx) + (DX[d] ?? 0)
  const j = Math.floor(node / nx) + (DY[d] ?? 0)
  if (i < 0 || j < 0 || i >= nx || j >= grid.ys.length) return -1
  const next = j * nx + i
  const through = (d === 1 || d === 3 ? grid.right : grid.down)[Math.min(node, next)] ?? []
  return through.every((k) => free.has(k)) ? next : -1
}

/** How many routes already take the step between two crossings next to each other. */
function crowd(grid: Grid, a: number, b: number): number {
  const first = Math.min(a, b)
  return Math.abs(a - b) === 1 ? grid.taken.right[first] : grid.taken.down[first]
}

interface Trip {
  /** The two boxes, as indexes in the list the grid was made from. */
  from: number
  to: number
  /** The boxes it may cross: the frames its ends sit in. */
  free: ReadonlySet<number>
}

/**
 * The cheapest way from a side of one box to a side of the other along the grid (A*, a state being
 * a crossing and the direction it was reached in): the shortest, a corner counting as BEND more
 * and a stretch other lines already take counting as longer. The way found is then counted as
 * taken.
 */
function search(grid: Grid, all: readonly Bounds[], trip: Trip): Found | null {
  const { xs, ys, taken } = grid
  const [from, to] = [all[trip.from], all[trip.to]]
  const nx = xs.length
  const at = (node: number): UmlPoint => ({ x: xs[node % nx], y: ys[Math.floor(node / nx)] })
  const nodeOf = (p: UmlPoint) => ys.indexOf(p.y) * nx + xs.indexOf(p.x)
  const end = nx * ys.length * 4
  const cost = new Float64Array(end + 1).fill(Infinity)
  const before = new Int32Array(end + 1).fill(-1)
  const goals = new Map(exits(to).map((p, side) => [nodeOf(p), side]))
  const left = (node: number) => {
    const p = at(node)
    return Math.max(to.x0 - p.x, 0, p.x - to.x1) + Math.max(to.y0 - p.y, 0, p.y - to.y1)
  }
  const heap = makeHeap()
  const reach = (state: number, total: number, via: number) => {
    if (total >= cost[state]) return
    cost[state] = total
    before[state] = via
    heap.push(total + (state === end ? 0 : left(state >> 2)), state)
  }
  exits(from).forEach((p, side) => {
    reach(nodeOf(p) * 4 + side, taken.sides[trip.from * 4 + side] * SHARED_SIDE, -1)
  })
  for (let top = heap.pop(); top; top = heap.pop()) {
    const state = top[1]
    if (state === end) break
    const node = state >> 2
    const d = state & 3
    const here = cost[state]
    // Reached more cheaply since it was queued.
    if (top[0] > here + left(node)) continue
    const goal = goals.get(node)
    // Entering the box is one more step straight on: any other direction is a corner.
    if (goal !== undefined) {
      const shared = taken.sides[trip.to * 4 + goal] * SHARED_SIDE
      reach(end, here + shared + (d === (goal + 2) % 4 ? 0 : BEND), state)
    }
    for (let nd = 0; nd < 4; nd++) {
      const next = nd === (d + 2) % 4 ? -1 : step(grid, node, nd, trip.free)
      if (next < 0) continue
      const [p, q] = [at(node), at(next)]
      const length =
        (Math.abs(q.x - p.x) + Math.abs(q.y - p.y)) * (1 + CROWD * crowd(grid, node, next))
      reach(next * 4 + nd, here + length + (nd === d ? 0 : BEND), state)
    }
  }
  if (before[end] < 0) return null
  const nodes: number[] = []
  let first = 0
  for (let s = before[end]; s >= 0; s = before[s]) {
    nodes.unshift(s >> 2)
    first = s & 3
  }
  const last = goals.get(nodes[nodes.length - 1]) ?? 0
  nodes.slice(1).forEach((node, i) => {
    const start = Math.min(node, nodes[i])
    if (Math.abs(node - nodes[i]) === 1) taken.right[start]++
    else taken.down[start]++
  })
  taken.sides[trip.from * 4 + first]++
  taken.sides[trip.to * 4 + last]++
  return { points: [anchor(from, first), ...nodes.map(at), anchor(to, last)], sides: [first, last] }
}

const inside = (a: Bounds, b: Bounds) =>
  a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1

/**
 * Two boxes too close for a line to go round anything, one on the other, or with no free way
 * between them: straight across the gap, with one step when they aren't in line.
 */
function direct(a: Bounds, b: Bounds): Found {
  // One holds the other (a state and its own composite): straight down to the frame's edge.
  if (inside(a, b) || inside(b, a)) {
    const inner = inside(a, b) ? a : b
    const outer = inner === a ? b : a
    const ends = [anchor(inner, 2), { x: inner.cx, y: outer.y1 - MARGIN }]
    return { points: inner === a ? ends : ends.reverse(), sides: [2, 2] }
  }
  const gapX = Math.max(b.x0 - a.x1, a.x0 - b.x1)
  const gapY = Math.max(b.y0 - a.y1, a.y0 - b.y1)
  const vertical = gapY >= gapX
  const forward = vertical ? b.cy >= a.cy : b.cx >= a.cx
  const out = vertical ? 2 : 1
  const sides: [number, number] = forward ? [out, (out + 2) % 4] : [(out + 2) % 4, out]
  const p = anchor(a, sides[0])
  const q = anchor(b, sides[1])
  const middle = vertical
    ? [
        { x: p.x, y: (p.y + q.y) / 2 },
        { x: q.x, y: (p.y + q.y) / 2 },
      ]
    : [
        { x: (p.x + q.x) / 2, y: p.y },
        { x: (p.x + q.x) / 2, y: q.y },
      ]
  return { points: [p, ...middle, q], sides }
}

/** The corners only: no point twice, none in the middle of a straight run. */
function corners(points: readonly UmlPoint[]): UmlPoint[] {
  const out: UmlPoint[] = []
  for (const p of points) {
    const a = out.at(-2)
    const b = out.at(-1)
    if (b?.x === p.x && b.y === p.y) continue
    if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) out.pop()
    out.push(p)
  }
  return out
}

interface Run {
  route: number
  /** The run goes from `points[i]` to `points[i + 1]`. */
  i: number
  vertical: boolean
  /** Its x when vertical, its y otherwise. */
  at: number
  from: number
  to: number
}

function runsOf(routes: readonly UmlPoint[][]): Run[] {
  return routes.flatMap((points, route) =>
    points.slice(1).map((q, i): Run => {
      const p = points[i] ?? q
      const vertical = p.x === q.x
      const [from, to] = vertical ? [p.y, q.y] : [p.x, q.x]
      return {
        route,
        i,
        vertical,
        at: vertical ? p.x : p.y,
        from: Math.min(from, to),
        to: Math.max(from, to),
      }
    }),
  )
}

/** Runs lying on top of each other, each group from one side of the corridor to the other. */
function corridors(runs: Run[], routes: readonly UmlPoint[][]): Run[][] {
  // Which side its line comes from and goes to: one that turns left at both ends goes on the left.
  const lean = (run: Run) => {
    const side = (p: UmlPoint | undefined) =>
      p ? Math.sign((run.vertical ? p.x : p.y) - run.at) : 0
    const points = routes[run.route] ?? []
    return side(points[run.i - 1]) + side(points[run.i + 2])
  }
  const groups: Run[][] = []
  let end = 0
  const ordered = runs.sort(
    (a, b) => Number(a.vertical) - Number(b.vertical) || a.at - b.at || a.from - b.from,
  )
  for (const run of ordered) {
    const group = groups.at(-1)
    const first = group?.[0]
    if (group && first?.vertical === run.vertical && first.at === run.at && run.from < end) {
      group.push(run)
      end = Math.max(end, run.to)
    } else {
      groups.push([run])
      end = run.to
    }
  }
  // ponytail: the order comes from each line's own turns only, so two lines in a corridor may
  // still cross once; order them by where they end if that shows.
  return groups
    .filter((g) => g.length > 1)
    .map((g) => g.sort((a, b) => lean(a) - lean(b) || a.route - b.route))
}

interface Routed extends Found {
  edge: RouteEdge
  /** How far its first and its last run may slide along the side of the box they touch. */
  slide: [number, number]
}

/** Sets side by side the lines that share a corridor, moving each run across it. */
function spread(routed: readonly Routed[]) {
  const routes = routed.map((r) => r.points)
  for (const group of corridors(runsOf(routes), routes)) {
    const gap = Math.min(LANE, (2 * (MARGIN - 4)) / (group.length - 1))
    group.forEach((run, k) => {
      const r = routed[run.route]
      const last = r.points.length - 2
      // An end run moves its end along the box's side, and stays on it.
      const room = Math.min(
        run.i === 0 ? r.slide[0] : Infinity,
        run.i === last ? r.slide[1] : Infinity,
      )
      const wanted = (k - (group.length - 1) / 2) * gap
      const by = Math.max(-room, Math.min(room, wanted))
      for (const p of [r.points[run.i], r.points[run.i + 1]]) {
        if (run.vertical) p.x += by
        else p.y += by
      }
    })
  }
}

const centred = (p: UmlPoint, size: Size): Rect => ({
  x: p.x - size.width / 2,
  y: p.y - size.height / 2,
  ...size,
})

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

/**
 * Where a label goes on its line: the middle of the longest run, or the first place along the line
 * where it covers nothing in `taken` (the one that covers the least when there is none).
 */
function labelAt(points: readonly UmlPoint[], size: Size | undefined, taken: readonly Rect[]) {
  const runs = points
    .slice(1)
    .map((q, i) => ({ p: points[i] ?? q, q }))
    .sort(
      (a, b) =>
        Math.abs(b.q.x - b.p.x) +
        Math.abs(b.q.y - b.p.y) -
        Math.abs(a.q.x - a.p.x) -
        Math.abs(a.q.y - a.p.y),
    )
  const places = runs.flatMap(({ p, q }) =>
    [0.5, 0.3, 0.7, 0.15, 0.85].map((t) => ({
      x: p.x + (q.x - p.x) * t,
      y: p.y + (q.y - p.y) * t,
    })),
  )
  let best = places.at(0) ?? points.at(0) ?? { x: 0, y: 0 }
  if (!size) return best
  let least = Infinity
  for (const place of places) {
    const box = centred(place, size)
    const covered = taken.reduce((sum, r) => sum + overlap(box, r), 0)
    if (covered < least) {
      least = covered
      best = place
    }
    if (covered === 0) break
  }
  return best
}

/**
 * The room a label takes, from its text: the canvas isn't measured, so a route is known before
 * anything is drawn.
 */
function labelSize(text: string): Size {
  const lines = text.split('\n')
  // ponytail: 6.4 px a character fits the 11.5 px label font on average; measure the text if
  // labels in a wider script start to overlap.
  return { width: Math.max(...lines.map((l) => l.length)) * 6.4 + 10, height: lines.length * 16 }
}

/**
 * The path of every line. A line goes round every box but its two ends and the frames they sit
 * in; a line from a box to itself isn't routed.
 */
function routeEdges(boxes: readonly RouteBox[], edges: readonly RouteEdge[]): Map<string, Route> {
  const index = new Map(boxes.map((b, k) => [b.id, k]))
  const all = boxes.map(boundsOf)
  const grid = makeGrid(all)
  const frames = new Set(boxes.flatMap((b) => (b.parent ? [b.parent] : [])))
  const around = (k: number) => {
    const out = new Set<number>()
    for (let p = boxes[k]?.parent; p !== undefined && !out.has(index.get(p) ?? -1);) {
      const parent = index.get(p)
      if (parent === undefined) break
      out.add(parent)
      p = boxes[parent]?.parent
    }
    return out
  }
  const routed = edges.flatMap((edge): Routed[] => {
    const s = index.get(edge.source)
    const t = index.get(edge.target)
    const a = s === undefined ? undefined : all[s]
    const b = t === undefined ? undefined : all[t]
    if (s === undefined || t === undefined || !a || !b || s === t) return []
    const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0
    const free = new Set([...around(s), ...around(t)])
    const found = (apart ? search(grid, all, { from: s, to: t, free }) : null) ?? direct(a, b)
    const side = (box: RouteBox | undefined, at: number) =>
      Math.max(0, (at % 2 === 0 ? (box?.width ?? 0) : (box?.height ?? 0)) / 2 - 6)
    return [
      {
        edge,
        points: corners(found.points),
        sides: found.sides,
        slide: [side(boxes[s], found.sides[0]), side(boxes[t], found.sides[1])],
      },
    ]
  })
  spread(routed)
  // A label keeps off the boxes (of a frame, only its name) and off the labels placed before.
  const taken: Rect[] = boxes.map((b) =>
    frames.has(b.id)
      ? { ...b, width: Math.min(b.width, FRAME_NAME.width), height: FRAME_NAME.height }
      : b,
  )
  const out = new Map<string, Route>()
  for (const r of routed) {
    const label = labelAt(r.points, r.edge.label, taken)
    if (r.edge.label) taken.push(centred(label, r.edge.label))
    out.set(r.edge.id, {
      points: r.points,
      label,
      sides: [SIDES[r.sides[0]] ?? 'bottom', SIDES[r.sides[1]] ?? 'top'],
    })
  }
  return out
}

/** The SVG path through `points`, its corners rounded. */
function roundedPath(points: readonly UmlPoint[], radius = 6): string {
  const n = (v: number) => String(Math.round(v * 100) / 100)
  return points
    .map((p, i) => {
      if (i === 0) return `M ${n(p.x)} ${n(p.y)}`
      if (i === points.length - 1) return `L ${n(p.x)} ${n(p.y)}`
      const a = points[i - 1]
      const b = points[i + 1]
      // Each corner is cut back along both runs, by no more than half of either.
      const cut = (o: UmlPoint) => {
        const d = Math.abs(o.x - p.x) + Math.abs(o.y - p.y)
        const r = Math.min(radius, d / 2)
        return d ? { x: p.x + ((o.x - p.x) * r) / d, y: p.y + ((o.y - p.y) * r) / d } : p
      }
      const [c, e] = [cut(a), cut(b)]
      return `L ${n(c.x)} ${n(c.y)} Q ${n(p.x)} ${n(p.y)} ${n(e.x)} ${n(e.y)}`
    })
    .join(' ')
}

export {
  labelSize,
  roundedPath,
  type Route,
  type RouteBox,
  type RouteEdge,
  routeEdges,
  type RouteSide,
}
