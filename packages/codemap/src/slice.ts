import { buildCodeGraph, type CodeGraph, membersOf } from './code-graph.ts'
import {
  type CodeEdge,
  type CodeEdgeKind,
  type CodeMap,
  type CodeNode,
  type CodeNodeKind,
  compare,
  type EntryKind,
  isFolderKey,
  within,
} from './code-map.ts'
import type { DiagramMatch } from './match.ts'

/**
 * The part of a code map around one diagram, small enough to hand a model: the code each element
 * stands for, the code edges the matcher cited, what those places hold, and their direct
 * neighbours. Names, paths and links only, never source code.
 */

/** A node of the slice; a linked folder is a node of its own (`kind: 'folder'`, key `path/`). */
export type CodeSliceNode = {
  key: string
  name: string
  kind: CodeNodeKind | 'folder'
  path?: string
  line?: number
  entry?: EntryKind
}

export type CodeSliceEdge = { from: string; to: string; kind: CodeEdgeKind }

export type CodeSlice = {
  /** Most relevant first: a caller short of room drops from the end. */
  nodes: CodeSliceNode[]
  /** Between nodes of the slice only, dependencies before `contains`. */
  edges: CodeSliceEdge[]
  /** Some nodes or edges were left out to stay under the limits. */
  truncated: boolean
}

export type CodeSliceOptions = {
  maxNodes?: number
  maxEdges?: number
  /** What a class or a file holds, listed per linked node. */
  maxMembers?: number
  /** Files listed per linked folder. */
  maxFolderFiles?: number
  /** Neighbours listed per linked node. */
  maxNeighbours?: number
}

export const CODE_SLICE_DEFAULTS = {
  maxNodes: 400,
  maxEdges: 1200,
  maxMembers: 15,
  maxFolderFiles: 20,
  maxNeighbours: 20,
} as const

const DEPENDENCY_KINDS: ReadonlySet<CodeEdgeKind> = new Set([
  'imports',
  'calls',
  'extends',
  'implements',
  'references',
])

function sliceNode(node: CodeNode): CodeSliceNode {
  return {
    key: node.key,
    name: node.name,
    kind: node.kind,
    ...(node.path !== undefined ? { path: node.path } : {}),
    ...(node.line !== undefined ? { line: node.line } : {}),
    ...(node.entry !== undefined ? { entry: node.entry } : {}),
  }
}

function folderNode(key: string): CodeSliceNode {
  const path = key.slice(0, -1)
  return { key, name: path.slice(path.lastIndexOf('/') + 1), kind: 'folder', path }
}

/** Files under a folder, the shallowest first, then in path order. */
function folderFiles(graph: CodeGraph, folder: string, limit: number): CodeNode[] {
  const files: CodeNode[] = []
  for (const nodes of graph.byPath.values()) {
    for (const node of nodes) {
      if (node.kind === 'file' && node.path !== undefined && within(node.path, folder)) {
        files.push(node)
      }
    }
  }
  const depth = (node: CodeNode) => (node.path ?? '').split('/').length
  return files.sort((a, b) => depth(a) - depth(b) || compare(a.key, b.key)).slice(0, limit)
}

/** Nodes one dependency edge away, either way, in key order. */
function neighbours(
  graph: CodeGraph,
  incoming: ReadonlyMap<string, readonly CodeEdge[]>,
  key: string,
  limit: number,
): CodeNode[] {
  const keys = new Set<string>()
  for (const edge of graph.outgoing.get(key) ?? []) {
    if (DEPENDENCY_KINDS.has(edge.kind)) keys.add(edge.to)
  }
  for (const edge of incoming.get(key) ?? []) {
    if (DEPENDENCY_KINDS.has(edge.kind)) keys.add(edge.from)
  }
  keys.delete(key)
  return [...keys]
    .sort(compare)
    .slice(0, limit)
    .flatMap((other) => {
      const node = graph.byKey.get(other)
      return node ? [node] : []
    })
}

/**
 * The slice of `map` a diagram's match points at. Elements resolved to one place (confirmed, or a
 * single proposal) are expanded with what they hold and their neighbours; other proposals are
 * listed alone, so a reviewer may still cite them.
 */
export function codeSlice(
  map: CodeMap,
  match: DiagramMatch,
  options: CodeSliceOptions = {},
): CodeSlice {
  const limits = { ...CODE_SLICE_DEFAULTS, ...options }
  const graph = buildCodeGraph(map)
  const incoming = new Map<string, CodeEdge[]>()
  for (const edge of map.edges) {
    const list = incoming.get(edge.to)
    if (list) list.push(edge)
    else incoming.set(edge.to, [edge])
  }

  const tiers: CodeSliceNode[][] = [[], [], [], []]
  const seen = new Set<string>()
  const add = (tier: number, node: CodeSliceNode | undefined) => {
    if (!node || seen.has(node.key)) return
    seen.add(node.key)
    tiers[tier]?.push(node)
  }
  const byKey = (key: string): CodeSliceNode | undefined => {
    if (isFolderKey(key)) return folderNode(key)
    const node = graph.byKey.get(key)
    return node ? sliceNode(node) : undefined
  }

  const resolved: string[] = []
  for (const element of match.elements) {
    for (const candidate of element.candidates) add(0, byKey(candidate.codeKey))
    if (element.status === 'confirmed' || element.candidates.length === 1) {
      resolved.push(...element.candidates.map((candidate) => candidate.codeKey))
    }
  }

  for (const relation of match.relations) {
    for (const edge of relation.evidence) {
      add(1, byKey(edge.from))
      add(1, byKey(edge.to))
    }
  }
  for (const finding of match.findings) {
    if (finding.kind !== 'dependency-not-drawn') continue
    for (const edge of finding.evidence) {
      add(1, byKey(edge.from))
      add(1, byKey(edge.to))
    }
  }

  const expanded: string[] = []
  for (const key of resolved) {
    if (isFolderKey(key)) {
      const folder = key.slice(0, -1)
      for (const file of folderFiles(graph, folder, limits.maxFolderFiles)) {
        add(2, sliceNode(file))
        expanded.push(file.key)
      }
      continue
    }
    const node = graph.byKey.get(key)
    if (!node) continue
    expanded.push(node.key)
    const members = membersOf(graph, node).filter((member) => member.key !== node.key)
    for (const member of members.slice(0, limits.maxMembers)) add(2, sliceNode(member))
  }

  for (const key of expanded) {
    for (const node of neighbours(graph, incoming, key, limits.maxNeighbours)) {
      add(3, sliceNode(node))
    }
  }

  const all = tiers.flat()
  const nodes = all.slice(0, limits.maxNodes)
  const kept = new Set(nodes.map((node) => node.key))
  const between = map.edges.filter((edge) => kept.has(edge.from) && kept.has(edge.to))
  const ordered = [
    ...between.filter((edge) => DEPENDENCY_KINDS.has(edge.kind)),
    ...between.filter((edge) => !DEPENDENCY_KINDS.has(edge.kind)),
  ]
  const edges = ordered.slice(0, limits.maxEdges).map(({ from, to, kind }) => ({ from, to, kind }))

  return {
    nodes,
    edges,
    truncated: all.length > nodes.length || ordered.length > edges.length,
  }
}
