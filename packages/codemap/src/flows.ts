import { buildCodeGraph, type CodeGraph, edgesOf } from './code-graph.ts'
import {
  type CodeMap,
  type CodeNode,
  compare,
  dirname,
  type EntryKind,
  isFolderKey,
} from './code-map.ts'

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

function trace(graph: CodeGraph, entryKey: string, maxDepth: number) {
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
