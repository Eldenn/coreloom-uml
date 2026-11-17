import { buildCodeGraph, type CodeGraph, isTestPath } from './code-graph.ts'
import {
  type CodeEdgeKind,
  type CodeMap,
  type CodeNode,
  compare,
  dirname,
  folderKey,
  isFolderKey,
  within,
} from './code-map.ts'

/**
 * The part of a code map a structural diagram is drawn from, for a model to read: folders and
 * how they import each other for a package or component diagram; classes, their methods and the
 * links between them for a class diagram. Names, paths and links only, never source code.
 */

export const STRUCTURE_KINDS = ['package', 'component', 'class'] as const
export type StructureKind = (typeof STRUCTURE_KINDS)[number]

export type StructureNode = {
  /** A code map key; a folder reads `path/`. */
  key: string
  name: string
  kind: CodeNode['kind'] | 'folder'
  path?: string
  line?: number
  /** The folder or class that holds it, when it is one of the nodes. */
  owner?: string
  /** Files in a folder, nested ones included. */
  files?: number
  /** Outside the scope asked for, listed because nodes of the scope depend on it. */
  context?: boolean
}

export type StructureEdge = {
  from: string
  to: string
  kind: Exclude<CodeEdgeKind, 'contains'>
  /** How many code edges this one stands for. */
  count: number
}

export type StructureSlice = {
  kind: StructureKind
  /** Most relevant first: a caller short of room drops from the end. */
  nodes: StructureNode[]
  edges: StructureEdge[]
  /** Some nodes were left out to stay under the limits. */
  truncated: boolean
}

export const STRUCTURE_LIMITS = {
  units: 30,
  filesPerUnit: 6,
  modulesPerUnit: 5,
  classes: 30,
  methodsPerClass: 12,
  contextClasses: 10,
} as const

const LINK_KINDS = new Set<CodeEdgeKind>([
  'imports',
  'calls',
  'extends',
  'implements',
  'references',
])

type Counts = Map<string, StructureEdge>

function count(edges: Counts, from: string, to: string, kind: StructureEdge['kind']) {
  if (from === to) return
  const key = `${from}\n${to}\n${kind}`
  const edge = edges.get(key)
  if (edge) edge.count += 1
  else edges.set(key, { from, to, kind, count: 1 })
}

function sortedEdges(edges: Counts): StructureEdge[] {
  return [...edges.values()].sort(
    (a, b) => b.count - a.count || compare(a.from, b.from) || compare(a.to, b.to),
  )
}

/** Every folder that holds a non-test file, with how many files it holds (nested included). */
function folderFiles(graph: CodeGraph): Map<string, number> {
  const counts = new Map<string, number>()
  for (const node of graph.map.nodes) {
    if (node.kind !== 'file' || node.path === undefined || isTestPath(node.path)) continue
    let folder = dirname(node.path)
    while (folder !== '') {
      counts.set(folder, (counts.get(folder) ?? 0) + 1)
      folder = dirname(folder)
    }
  }
  return counts
}

/** The folders a scope stands for: folder keys as given, a file or symbol by its folder. */
function scopeFolders(graph: CodeGraph, keys: readonly string[]): string[] {
  const folders = new Set<string>()
  for (const key of keys) {
    if (isFolderKey(key)) folders.add(key.slice(0, -1))
    else {
      const path = graph.byKey.get(key)?.path
      if (path !== undefined) folders.add(dirname(path))
    }
  }
  return [...folders].filter((folder) => folder !== '').sort(compare)
}

/** One folder asked for reads as its direct subfolders; several are drawn as they are. */
function units(folders: readonly string[], files: ReadonlyMap<string, number>): string[] {
  if (folders.length !== 1) return [...folders]
  const [only] = folders as [string]
  const children = [...files.keys()].filter((path) => dirname(path) === only)
  return children.length >= 2 ? children.sort(compare) : [only]
}

function folderSlice(
  graph: CodeGraph,
  keys: readonly string[],
  kind: StructureKind,
): StructureSlice {
  const files = folderFiles(graph)
  const all = units(scopeFolders(graph, keys), files).filter((path) => files.has(path))
  const kept = all
    .sort((a, b) => (files.get(b) ?? 0) - (files.get(a) ?? 0) || compare(a, b))
    .slice(0, STRUCTURE_LIMITS.units)
    .sort(compare)
  const unitOf = (path: string) => kept.find((unit) => within(path, unit))

  const degree = new Map<string, number>()
  const edges: Counts = new Map()
  const modules = new Map<string, Map<string, number>>()
  for (const edge of graph.map.edges) {
    if (edge.kind !== 'imports') continue
    const from = graph.byKey.get(edge.from)
    const to = graph.byKey.get(edge.to)
    if (from?.path === undefined || !to || isTestPath(from.path)) continue
    const a = unitOf(from.path)
    if (a === undefined) continue
    if (to.kind === 'module') {
      const byModule = modules.get(a) ?? new Map<string, number>()
      byModule.set(to.key, (byModule.get(to.key) ?? 0) + 1)
      modules.set(a, byModule)
      continue
    }
    if (to.path === undefined || isTestPath(to.path)) continue
    const b = unitOf(to.path)
    if (b === undefined || a === b) continue
    count(edges, folderKey(a), folderKey(b), 'imports')
    degree.set(to.key, (degree.get(to.key) ?? 0) + 1)
  }

  const nodes: StructureNode[] = kept.map((path) => ({
    key: folderKey(path),
    name: path.slice(path.lastIndexOf('/') + 1),
    kind: 'folder',
    path,
    files: files.get(path) ?? 0,
  }))
  // The files other units import the most: what a component offers to the rest.
  for (const unit of kept) {
    const inUnit = graph.map.nodes.filter(
      (node) =>
        node.kind === 'file' &&
        node.path !== undefined &&
        within(node.path, unit) &&
        !isTestPath(node.path),
    )
    const top = inUnit
      .sort((a, b) => (degree.get(b.key) ?? 0) - (degree.get(a.key) ?? 0) || compare(a.key, b.key))
      .slice(0, STRUCTURE_LIMITS.filesPerUnit)
    for (const file of top) {
      nodes.push({
        key: file.key,
        name: file.name,
        kind: 'file',
        ...(file.path !== undefined ? { path: file.path } : {}),
        owner: folderKey(unit),
      })
    }
  }
  for (const unit of kept) {
    const byModule = [...(modules.get(unit) ?? [])]
      .sort((a, b) => b[1] - a[1] || compare(a[0], b[0]))
      .slice(0, STRUCTURE_LIMITS.modulesPerUnit)
    for (const [key, imports] of byModule) {
      const module = graph.byKey.get(key)
      if (!module) continue
      if (!nodes.some((node) => node.key === key)) {
        nodes.push({ key, name: module.name, kind: 'module', context: true })
      }
      for (let index = 0; index < imports; index += 1) count(edges, folderKey(unit), key, 'imports')
    }
  }
  return { kind, nodes, edges: sortedEdges(edges), truncated: all.length > kept.length }
}

/** Classes a key stands for: a class itself, the classes of a file, or of a folder. */
function scopeClasses(graph: CodeGraph, keys: readonly string[]): CodeNode[] {
  const found = new Map<string, CodeNode>()
  const add = (node: CodeNode) => {
    if (node.kind === 'class' && node.path !== undefined && !isTestPath(node.path)) {
      found.set(node.key, node)
    }
  }
  for (const key of keys) {
    if (isFolderKey(key)) {
      const folder = key.slice(0, -1)
      for (const node of graph.map.nodes) if (node.path && within(node.path, folder)) add(node)
      continue
    }
    const node = graph.byKey.get(key)
    if (!node) continue
    if (node.kind === 'file' && node.path !== undefined) {
      for (const member of graph.byPath.get(node.path) ?? []) add(member)
    } else if (node.kind === 'method') {
      const owner = graph.map.edges.find((edge) => edge.kind === 'contains' && edge.to === key)
      const parent = owner ? graph.byKey.get(owner.from) : undefined
      if (parent) add(parent)
    } else add(node)
  }
  return [...found.values()]
}

function classSlice(graph: CodeGraph, keys: readonly string[]): StructureSlice {
  // Each node held by a class, mapped to that class.
  const classOf = new Map<string, string>()
  for (const node of graph.map.nodes) {
    if (node.kind !== 'class') continue
    classOf.set(node.key, node.key)
    for (const child of graph.children.get(node.key) ?? []) classOf.set(child.key, node.key)
  }
  const linksOf = (classKey: string) => {
    const links: { to: string; kind: StructureEdge['kind'] }[] = []
    const members = [classKey, ...(graph.children.get(classKey) ?? []).map((child) => child.key)]
    for (const key of members) {
      for (const edge of graph.outgoing.get(key) ?? []) {
        if (!LINK_KINDS.has(edge.kind) || edge.kind === 'imports') continue
        const to = classOf.get(edge.to)
        if (to && to !== classKey) links.push({ to, kind: edge.kind as StructureEdge['kind'] })
      }
    }
    return links
  }

  const scope = scopeClasses(graph, keys)
  const weight = (node: CodeNode) => linksOf(node.key).length
  const kept = scope
    .sort((a, b) => weight(b) - weight(a) || compare(a.key, b.key))
    .slice(0, STRUCTURE_LIMITS.classes)
  const inScope = new Set(kept.map((node) => node.key))

  const edges: Counts = new Map()
  const context = new Map<string, number>()
  for (const node of kept) {
    for (const link of linksOf(node.key)) {
      if (inScope.has(link.to)) count(edges, node.key, link.to, link.kind)
      else context.set(link.to, (context.get(link.to) ?? 0) + 1)
    }
  }
  const contextKeys = [...context]
    .sort((a, b) => b[1] - a[1] || compare(a[0], b[0]))
    .slice(0, STRUCTURE_LIMITS.contextClasses)
    .map(([key]) => key)
  const shown = new Set([...inScope, ...contextKeys])
  for (const node of kept) {
    for (const link of linksOf(node.key)) {
      if (!inScope.has(link.to) && shown.has(link.to)) count(edges, node.key, link.to, link.kind)
    }
  }

  const nodes: StructureNode[] = []
  const describe = (node: CodeNode, extra: Partial<StructureNode> = {}): StructureNode => ({
    key: node.key,
    name: node.name,
    kind: node.kind,
    ...(node.path !== undefined ? { path: node.path } : {}),
    ...(node.line !== undefined ? { line: node.line } : {}),
    ...extra,
  })
  for (const node of kept) nodes.push(describe(node))
  for (const key of contextKeys) {
    const node = graph.byKey.get(key)
    if (node) nodes.push(describe(node, { context: true }))
  }
  for (const node of kept) {
    const methods = (graph.children.get(node.key) ?? [])
      .filter((child) => child.kind === 'method' || child.kind === 'variable')
      .slice(0, STRUCTURE_LIMITS.methodsPerClass)
    for (const method of methods) nodes.push(describe(method, { owner: node.key }))
  }
  return { kind: 'class', nodes, edges: sortedEdges(edges), truncated: scope.length > kept.length }
}

/**
 * The slice of `map` a structural diagram of `kind` is drawn from. `keys` are what the diagram
 * should cover: folders (`path/`), files, classes. Tests are left out.
 */
export function structureSlice(
  map: CodeMap,
  keys: readonly string[],
  kind: StructureKind,
): StructureSlice {
  const graph = buildCodeGraph(map)
  return kind === 'class' ? classSlice(graph, keys) : folderSlice(graph, keys, kind)
}
