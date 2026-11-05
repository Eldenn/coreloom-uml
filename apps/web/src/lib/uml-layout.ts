import type { UmlDirection, UmlLayout, UmlPoint } from '@/lib/uml'

interface LayoutNode {
  id: string
  /** The frame it sits in. */
  parent?: string
  width: number
  height: number
}

interface LayoutEdge {
  source: string
  target: string
}

/** A node's place, relative to its frame (or the canvas), and its size (frames grow to fit). */
interface LayoutBox extends UmlPoint {
  width: number
  height: number
}

interface Size {
  width: number
  height: number
}

/** Room between neighbours in a layer, and between layers. */
const GAP_CROSS = 48
const GAP_MAIN = 72
/** Room between unconnected groups, and how wide a row of them gets before it wraps. */
const GAP_GROUP = 64
const WRAP = 1100
/** A frame's padding, and its header (where its name goes). */
const FRAME_PAD = 24
const FRAME_HEAD = 40

/** Ids grouped into connected components, in order of first appearance. */
function components(ids: readonly string[], edges: readonly LayoutEdge[]): string[][] {
  const links = new Map(ids.map((id) => [id, new Set<string>()]))
  for (const e of edges) {
    links.get(e.source)?.add(e.target)
    links.get(e.target)?.add(e.source)
  }
  const seen = new Set<string>()
  const out: string[][] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    const group: string[] = []
    const queue = [id]
    seen.add(id)
    while (queue.length) {
      const next = queue.shift() ?? ''
      group.push(next)
      for (const n of links.get(next) ?? []) {
        if (!seen.has(n)) {
          seen.add(n)
          queue.push(n)
        }
      }
    }
    out.push(group.sort((a, b) => ids.indexOf(a) - ids.indexOf(b)))
  }
  return out
}

/** Each node's layer: one past the deepest node pointing at it, with cycles broken where met. */
function ranks(ids: readonly string[], edges: readonly LayoutEdge[]): Map<string, number> {
  const out = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const e of edges) out.get(e.source)?.push(e.target)
  // Depth-first: an edge back to a node still on the path closes a cycle, and is left out.
  const state = new Map<string, 'open' | 'done'>()
  const order: string[] = []
  const kept: LayoutEdge[] = []
  const visit = (id: string) => {
    state.set(id, 'open')
    for (const t of out.get(id) ?? []) {
      if (state.get(t) === 'open') continue
      kept.push({ source: id, target: t })
      if (!state.has(t)) visit(t)
    }
    state.set(id, 'done')
    order.unshift(id)
  }
  for (const id of ids) if (!state.has(id)) visit(id)
  const rank = new Map(ids.map((id) => [id, 0]))
  for (const id of order) {
    for (const e of kept) {
      if (e.source === id)
        rank.set(e.target, Math.max(rank.get(e.target) ?? 0, (rank.get(id) ?? 0) + 1))
    }
  }
  // A node nothing points to sits just above the nearest thing it points to, not on the top row:
  // its lines stay short instead of crossing the layers in between.
  for (const id of ids) {
    if (kept.some((e) => e.target === id)) continue
    const below = kept.filter((e) => e.source === id).map((e) => rank.get(e.target) ?? 0)
    if (below.length) rank.set(id, Math.max(rank.get(id) ?? 0, Math.min(...below) - 1))
  }
  return rank
}

/** Layers ordered so edges cross less: a few sweeps placing each node at its neighbours' mean. */
function orderLayers(layers: string[][], edges: readonly LayoutEdge[]): string[][] {
  const neighbours = new Map<string, string[]>()
  for (const e of edges) {
    neighbours.set(e.source, [...(neighbours.get(e.source) ?? []), e.target])
    neighbours.set(e.target, [...(neighbours.get(e.target) ?? []), e.source])
  }
  let result = layers.map((l) => [...l])
  for (let sweep = 0; sweep < 4; sweep++) {
    const index = new Map<string, number>()
    result.forEach((layer) => {
      layer.forEach((id, i) => index.set(id, i))
    })
    result = result.map((layer) => {
      const score = (id: string, i: number) => {
        const at = (neighbours.get(id) ?? []).flatMap((n) =>
          index.has(n) ? [index.get(n) ?? 0] : [],
        )
        return at.length ? at.reduce((a, b) => a + b, 0) / at.length : i
      }
      return layer
        .map((id, i) => ({ id, s: score(id, i), i }))
        .sort((a, b) => a.s - b.s || a.i - b.i)
        .map((x) => x.id)
    })
  }
  return result
}

/** Places a layer's nodes at the wanted centres, in order, without overlapping. */
function pack(
  layer: readonly string[],
  cross: (id: string) => number,
  want: Map<string, number>,
): Map<string, number> {
  const placed = new Map<string, number>()
  let edge = -Infinity
  let drift = 0
  for (const id of layer) {
    const size = cross(id)
    const wanted = (want.get(id) ?? 0) - size / 2
    const at = Math.max(wanted, edge)
    placed.set(id, at)
    drift += at - wanted
    edge = at + size + GAP_CROSS
  }
  // Pushing right only would pull the whole layer off centre: shift it back by the mean drift.
  const shift = layer.length ? drift / layer.length : 0
  for (const id of layer) placed.set(id, (placed.get(id) ?? 0) - shift)
  return placed
}

interface Flow {
  /** Size across the flow, and along it. */
  cross: (id: string) => number
  main: (id: string) => number
}

/** One connected group, laid out top-down in "flow space": cross is x, main is y. */
function layoutComponent(ids: readonly string[], edges: readonly LayoutEdge[], flow: Flow) {
  const local = edges.filter((e) => ids.includes(e.source) && ids.includes(e.target))
  const rank = ranks(ids, local)
  const depth = Math.max(0, ...rank.values())
  const layers = orderLayers(
    Array.from({ length: depth + 1 }, (_, r) => ids.filter((id) => rank.get(id) === r)),
    local,
  )
  const centre = new Map<string, number>()
  // First pass: each layer side by side, centred on 0.
  for (const layer of layers) {
    const total = layer.reduce((s, id) => s + flow.cross(id), 0) + GAP_CROSS * (layer.length - 1)
    let x = -total / 2
    for (const id of layer) {
      centre.set(id, x + flow.cross(id) / 2)
      x += flow.cross(id) + GAP_CROSS
    }
  }
  // Then pull each node over what it's connected to in the layers before it, and back up.
  const linked = (id: string, before: boolean) =>
    local.flatMap((e) => {
      if (before && e.target === id) return [e.source]
      if (!before && e.source === id) return [e.target]
      return []
    })
  const settle = (layer: string[], before: boolean) => {
    const want = new Map(
      layer.map((id) => {
        const near = linked(id, before)
        const mean = near.length
          ? near.reduce((s, n) => s + (centre.get(n) ?? 0), 0) / near.length
          : (centre.get(id) ?? 0)
        return [id, mean]
      }),
    )
    for (const [id, left] of pack(layer, flow.cross, want))
      centre.set(id, left + flow.cross(id) / 2)
  }
  for (const layer of layers.slice(1)) settle(layer, true)
  for (const layer of layers.slice(0, -1).reverse()) settle(layer, false)

  const pos = new Map<string, UmlPoint>()
  let main = 0
  for (const layer of layers) {
    const thick = Math.max(...layer.map(flow.main))
    for (const id of layer) {
      pos.set(id, {
        x: (centre.get(id) ?? 0) - flow.cross(id) / 2,
        y: main + (thick - flow.main(id)) / 2,
      })
    }
    main += thick + GAP_MAIN
  }
  return normalise(pos, flow)
}

/** Moves positions so the top-left is 0,0, and gives the size they cover. */
function normalise(pos: Map<string, UmlPoint>, flow: Flow) {
  const xs = [...pos].map(([, p]) => p.x)
  const minX = Math.min(...xs)
  const minY = Math.min(...[...pos].map(([, p]) => p.y))
  let width = 0
  let height = 0
  for (const [id, p] of pos) {
    const moved = { x: p.x - minX, y: p.y - minY }
    pos.set(id, moved)
    width = Math.max(width, moved.x + flow.cross(id))
    height = Math.max(height, moved.y + flow.main(id))
  }
  return { pos, width, height }
}

/** Groups side by side, wrapping into rows, in flow space. */
function packGroups(groups: ReturnType<typeof layoutComponent>[]) {
  const pos = new Map<string, UmlPoint>()
  const widest = Math.max(0, ...groups.map((g) => g.width))
  const wrap = Math.max(WRAP, widest)
  let x = 0
  let y = 0
  let row = 0
  for (const g of groups) {
    if (x > 0 && x + g.width > wrap) {
      x = 0
      y += row + GAP_GROUP
      row = 0
    }
    for (const [id, p] of g.pos) pos.set(id, { x: p.x + x, y: p.y + y })
    x += g.width + GAP_GROUP
    row = Math.max(row, g.height)
  }
  return pos
}

/** Flow space to the canvas: turned for LR/RL, mirrored for BT/RL. */
function orient(pos: Map<string, UmlPoint>, sizes: Map<string, Size>, direction: UmlDirection) {
  const horizontal = direction === 'LR' || direction === 'RL'
  const out = new Map<string, UmlPoint>()
  for (const [id, p] of pos) out.set(id, horizontal ? { x: p.y, y: p.x } : p)
  if (direction === 'BT' || direction === 'RL') {
    const key = direction === 'BT' ? 'y' : 'x'
    const dim = direction === 'BT' ? 'height' : 'width'
    const end = Math.max(...[...out].map(([id, p]) => p[key] + (sizes.get(id)?.[dim] ?? 0)))
    for (const [id, p] of out)
      out.set(id, { ...p, [key]: end - p[key] - (sizes.get(id)?.[dim] ?? 0) })
  }
  return out
}

/** Lays out the nodes of one scope (the canvas, or one frame). */
function layoutScope(
  ids: readonly string[],
  sizes: Map<string, Size>,
  edges: readonly LayoutEdge[],
  direction: UmlDirection,
) {
  const horizontal = direction === 'LR' || direction === 'RL'
  const flow: Flow = {
    cross: (id) => (horizontal ? sizes.get(id)?.height : sizes.get(id)?.width) ?? 0,
    main: (id) => (horizontal ? sizes.get(id)?.width : sizes.get(id)?.height) ?? 0,
  }
  const groups = components(ids, edges).map((group) => layoutComponent(group, edges, flow))
  // Lone nodes after the connected groups, so the structure reads first.
  groups.sort((a, b) => Number(a.pos.size === 1) - Number(b.pos.size === 1))
  return orient(packGroups(groups), sizes, direction)
}

/**
 * Where every node goes. `fixed` holds positions someone dragged (relative to the node's frame);
 * those stay, and frames grow to hold them.
 */
function layoutDiagram(input: {
  nodes: readonly LayoutNode[]
  edges: readonly LayoutEdge[]
  direction?: UmlDirection
  fixed?: UmlLayout
}): Map<string, LayoutBox> {
  const { nodes, edges, direction = 'TB', fixed = {} } = input
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const kids = new Map<string | undefined, LayoutNode[]>()
  for (const n of nodes) {
    const parent = n.parent && byId.has(n.parent) ? n.parent : undefined
    kids.set(parent, [...(kids.get(parent) ?? []), n])
  }
  const result = new Map<string, LayoutBox>()
  /** The node that stands for `id` among the children of `scope`. */
  const at = (id: string, scope: string | undefined): string | null => {
    let node = byId.get(id)
    while (node) {
      const parent = node.parent && byId.has(node.parent) ? node.parent : undefined
      if (parent === scope) return node.id
      node = parent ? byId.get(parent) : undefined
    }
    return null
  }
  const place = (scope: string | undefined): Size => {
    const children = kids.get(scope) ?? []
    const sizes = new Map<string, Size>()
    for (const c of children) {
      if (kids.has(c.id)) {
        const inner = place(c.id)
        sizes.set(c.id, {
          width: Math.max(c.width, inner.width + FRAME_PAD),
          height: Math.max(c.height, inner.height + FRAME_PAD),
        })
      } else sizes.set(c.id, { width: c.width, height: c.height })
    }
    const local = edges.flatMap((e) => {
      const source = at(e.source, scope)
      const target = at(e.target, scope)
      return source && target && source !== target ? [{ source, target }] : []
    })
    const ids = children.map((c) => c.id)
    const auto = layoutScope(ids, sizes, local, direction)
    const offset = scope === undefined ? { x: 0, y: 0 } : { x: FRAME_PAD, y: FRAME_HEAD }
    let width = 0
    let height = 0
    for (const id of ids) {
      const size = sizes.get(id) ?? { width: 0, height: 0 }
      const p = auto.get(id) ?? { x: 0, y: 0 }
      const pos = fixed[id] ?? { x: p.x + offset.x, y: p.y + offset.y }
      result.set(id, { ...pos, ...size })
      width = Math.max(width, pos.x + size.width)
      height = Math.max(height, pos.y + size.height)
    }
    return { width, height }
  }
  place(undefined)
  return result
}

export { FRAME_HEAD, FRAME_PAD, type LayoutBox, layoutDiagram, type LayoutEdge, type LayoutNode }
