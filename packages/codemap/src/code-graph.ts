import type { CodeEdge, CodeEdgeKind, CodeMap, CodeNode } from './code-map.ts'

/** Lookups over a code map, built once and shared by the functions that read it. */
export type CodeGraph = {
  map: CodeMap
  byKey: ReadonlyMap<string, CodeNode>
  /** Everything a file or a class holds directly (`contains` edges). */
  children: ReadonlyMap<string, readonly CodeNode[]>
  outgoing: ReadonlyMap<string, readonly CodeEdge[]>
  /** Every node with a path, by path: a file and its symbols. */
  byPath: ReadonlyMap<string, readonly CodeNode[]>
  /** Normalized names of the outside modules each file imports (see `normalizeModule`). */
  modulesByPath: ReadonlyMap<string, ReadonlySet<string>>
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/**
 * A module name in one comparable form, whatever the extractor kept of it: `@nestjs/common`,
 * `ref_nestjs_common` and `nestjs_common` all read `nestjs_common`.
 */
export function normalizeModule(name: string): string {
  return name
    .toLowerCase()
    .replace(/^ref_/, '')
    .replace(/^@/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function buildCodeGraph(map: CodeMap): CodeGraph {
  const byKey = new Map(map.nodes.map((node) => [node.key, node]))
  const children = new Map<string, CodeNode[]>()
  const outgoing = new Map<string, CodeEdge[]>()
  const byPath = new Map<string, CodeNode[]>()
  const modulesByPath = new Map<string, Set<string>>()

  for (const node of map.nodes) if (node.path !== undefined) push(byPath, node.path, node)
  for (const edge of map.edges) {
    push(outgoing, edge.from, edge)
    const from = byKey.get(edge.from)
    const to = byKey.get(edge.to)
    if (!from || !to) continue
    if (edge.kind === 'contains') push(children, edge.from, to)
    if (edge.kind === 'imports' && to.kind === 'module' && from.path !== undefined) {
      const set = modulesByPath.get(from.path) ?? new Set<string>()
      set.add(normalizeModule(to.name))
      modulesByPath.set(from.path, set)
    }
  }
  return { map, byKey, children, outgoing, byPath, modulesByPath }
}

export function edgesOf(graph: CodeGraph, key: string, kind: CodeEdgeKind): CodeEdge[] {
  return (graph.outgoing.get(key) ?? []).filter((edge) => edge.kind === kind)
}

/** A class with everything it holds, or a file with every symbol in it, or the node alone. */
export function membersOf(graph: CodeGraph, node: CodeNode): CodeNode[] {
  if (node.kind === 'file' && node.path !== undefined)
    return [...(graph.byPath.get(node.path) ?? [])]
  const members: CodeNode[] = [node]
  const seen = new Set([node.key])
  for (let index = 0; index < members.length; index += 1) {
    for (const child of graph.children.get((members[index] as CodeNode).key) ?? []) {
      if (!seen.has(child.key)) {
        seen.add(child.key)
        members.push(child)
      }
    }
  }
  return members
}

/** Whether a file is a test, which never counts as an entry point. */
export function isTestPath(path: string): boolean {
  return (
    /(?:^|\/)(?:tests?|__tests__|specs?|e2e|fixtures?)\//i.test(path) ||
    /\.(?:spec|test)\.[^/]+$/i.test(path) ||
    /(?:^|\/)test_[^/]+\.py$/.test(path)
  )
}
