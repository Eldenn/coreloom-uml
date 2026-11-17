import { buildCodeGraph, type CodeGraph, edgesOf } from './code-graph.ts'
import {
  type CodeMap,
  type CodeNode,
  compare,
  dirname,
  type EntryKind,
  isFolderKey,
} from './code-map.ts'
import { type CodeSliceNode, sliceNode } from './slice.ts'

/**
 * Processes that no diagram documents: from each entry point, the calls followed a few levels
 * deep. A flow is covered when one of its nodes is linked to a diagram element (a class link
 * covers its methods, a file link the symbols in it). Folder links do not count: a package or
 * component diagram shows structure, not a process.
 */

export type CodeFlow = {
  entry: string
  entryKind: EntryKind
  /** Node keys, the entry first, then in the order the calls reach them. */
  nodes: string[]
  /** The calls followed, as node keys. */
  calls: { from: string; to: string }[]
  /** The folders the flow goes through. */
  folders: string[]
  /** How many levels of calls the flow reaches. */
  depth: number
}

export type FlowOptions = {
  /** Levels of calls followed from the entry point. Default 4. */
  depth?: number
  /** Flows with fewer nodes are left out. Default 2: an entry that calls nothing known. */
  minSize?: number
}

export const DEFAULT_FLOW_DEPTH = 4

function coveredNodes(graph: CodeGraph, linked: Iterable<string>): Set<string> {
  const covered = new Set<string>()
  for (const key of linked) {
    if (isFolderKey(key)) continue
    const node = graph.byKey.get(key)
    if (!node) continue
    covered.add(key)
    if (node.kind === 'file' && node.path !== undefined) {
      for (const member of graph.byPath.get(node.path) ?? []) covered.add(member.key)
    }
    for (const child of graph.children.get(key) ?? []) covered.add(child.key)
  }
  return covered
}

/** The calls reachable from one entry point, breadth first. */
export function traceFlow(map: CodeMap, entryKey: string, options: FlowOptions = {}) {
  return trace(buildCodeGraph(map), entryKey, options.depth ?? DEFAULT_FLOW_DEPTH)
}

/** `traceFlow` over a graph already built. */
export function trace(graph: CodeGraph, entryKey: string, maxDepth: number) {
  const nodes = [entryKey]
  const depthOf = new Map([[entryKey, 0]])
  const calls: { from: string; to: string }[] = []
  for (let index = 0; index < nodes.length; index += 1) {
    const key = nodes[index] as string
    const depth = depthOf.get(key) as number
    if (depth >= maxDepth) continue
    const next = edgesOf(graph, key, 'calls').sort((a, b) => compare(a.to, b.to))
    for (const edge of next) {
      calls.push({ from: edge.from, to: edge.to })
      if (!depthOf.has(edge.to)) {
        depthOf.set(edge.to, depth + 1)
        nodes.push(edge.to)
      }
    }
  }
  return { nodes, calls, depth: Math.max(...depthOf.values()) }
}

/**
 * The flows from every entry point that touch no linked node, largest first. `linked` is the set
 * of code keys linked to diagram elements (see `linkedCodeKeys`).
 */
export function findUncoveredFlows(
  map: CodeMap,
  linked: Iterable<string>,
  options: FlowOptions = {},
): CodeFlow[] {
  const graph = buildCodeGraph(map)
  const covered = coveredNodes(graph, linked)
  const maxDepth = options.depth ?? DEFAULT_FLOW_DEPTH
  const minSize = options.minSize ?? 2
  const flows: CodeFlow[] = []
  const entries = map.nodes.filter(
    (node): node is CodeNode & { entry: EntryKind } => node.entry !== undefined,
  )
  for (const entry of entries) {
    const flow = trace(graph, entry.key, maxDepth)
    if (flow.nodes.length < minSize || flow.nodes.some((key) => covered.has(key))) continue
    const folders = new Set<string>()
    for (const key of flow.nodes) {
      const path = graph.byKey.get(key)?.path
      if (path !== undefined) folders.add(dirname(path))
    }
    flows.push({
      entry: entry.key,
      entryKind: entry.entry,
      nodes: flow.nodes,
      calls: flow.calls,
      folders: [...folders].sort(compare),
      depth: flow.depth,
    })
  }
  return flows.sort((a, b) => b.nodes.length - a.nodes.length || compare(a.entry, b.entry))
}

/** A node of a process: `owner` is the class or the file that holds it, when the map says. */
export type ProcessNode = CodeSliceNode & { owner?: string }

/** What a model reads to draw one process: the calls from an entry point and who holds them. */
export type ProcessSlice = {
  entry: string
  entryKind: EntryKind
  /** The flow's nodes in the order the calls reach them, then the owners not already listed. */
  nodes: ProcessNode[]
  /** The calls followed, between listed nodes, in the order they were found. */
  calls: { from: string; to: string }[]
  depth: number
  /** Nodes of the flow were left out past `maxNodes`. */
  truncated: boolean
}

export const PROCESS_SLICE_MAX_NODES = 60

/**
 * The flow from one entry point, ready for a model to draw: each node with the class or file
 * that holds it (a method's class, a function's file), so the drawing's participants are places
 * of the code. Null when `entryKey` is not an entry point of the map.
 */
export function processSlice(
  map: CodeMap,
  entryKey: string,
  options: FlowOptions & { maxNodes?: number } = {},
): ProcessSlice | null {
  const graph = buildCodeGraph(map)
  const entry = graph.byKey.get(entryKey)
  if (entry?.entry === undefined) return null
  return sliceFrom(map, graph, entry, entry.entry, options)
}

/**
 * Like `processSlice`, from any function or method: an entry point keeps its kind, any other
 * start reads `root` (a function nothing in the repository calls, for one). Null when `startKey`
 * is neither a function, a method nor an entry point.
 */
export function flowSlice(
  map: CodeMap,
  startKey: string,
  options: FlowOptions & { maxNodes?: number } = {},
): FlowSlice | null {
  const graph = buildCodeGraph(map)
  const start = graph.byKey.get(startKey)
  if (!start) return null
  if (start.entry !== undefined) return sliceFrom(map, graph, start, start.entry, options)
  if (start.kind !== 'function' && start.kind !== 'method') return null
  return sliceFrom(map, graph, start, 'root', options)
}

/** A flow from any start: `entryKind` is `root` when the start is not an entry point. */
export type FlowSlice = Omit<ProcessSlice, 'entryKind'> & { entryKind: EntryKind | 'root' }

function sliceFrom<K extends EntryKind | 'root'>(
  map: CodeMap,
  graph: CodeGraph,
  entry: CodeNode,
  entryKind: K,
  options: FlowOptions & { maxNodes?: number },
): Omit<ProcessSlice, 'entryKind'> & { entryKind: K } {
  const entryKey = entry.key
  const flow = trace(graph, entryKey, options.depth ?? DEFAULT_FLOW_DEPTH)
  const maxNodes = options.maxNodes ?? PROCESS_SLICE_MAX_NODES
  const keys = flow.nodes.slice(0, maxNodes)
  const kept = new Set(keys)

  const ownerOf = new Map<string, string>()
  for (const edge of map.edges) {
    if (edge.kind === 'contains' && kept.has(edge.to) && !ownerOf.has(edge.to)) {
      ownerOf.set(edge.to, edge.from)
    }
  }
  const nodes: ProcessNode[] = []
  for (const key of keys) {
    const node = graph.byKey.get(key)
    if (!node) continue
    const owner = ownerOf.get(key)
    nodes.push({ ...sliceNode(node), ...(owner !== undefined ? { owner } : {}) })
  }
  const listed = new Set(nodes.map((node) => node.key))
  for (const node of [...nodes]) {
    if (node.owner === undefined || listed.has(node.owner)) continue
    const owner = graph.byKey.get(node.owner)
    if (!owner) continue
    listed.add(owner.key)
    nodes.push(sliceNode(owner))
  }
  return {
    entry: entryKey,
    entryKind,
    nodes,
    calls: flow.calls.filter((call) => kept.has(call.from) && kept.has(call.to)),
    depth: flow.depth,
    truncated: flow.nodes.length > keys.length,
  }
}
