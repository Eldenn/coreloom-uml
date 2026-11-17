import { buildCodeGraph, type CodeGraph, edgesOf, isTestPath } from './code-graph.ts'
import {
  type CodeMap,
  type CodeNode,
  compare,
  dirname,
  type EntryKind,
  folderKey,
} from './code-map.ts'
import { DEFAULT_FLOW_DEPTH, trace } from './flows.ts'

/**
 * A short picture of a whole code map, for a model to choose which diagrams would document the
 * code best: the folders and how they depend on each other, the classes most other code leans
 * on, and the places where processes start (the entry points found, or the functions nothing
 * calls that call the most). Names, paths and links only, never source code.
 */

export type OutlineFolder = {
  /** The folder key, `path/`. */
  key: string
  path: string
  files: number
  /** Classes, functions and methods in it, nested folders included. */
  symbols: number
}

export type OutlineDependency = {
  /** Folder keys. */
  from: string
  to: string
  /** File imports from one folder to the other. */
  imports: number
}

export type OutlineClass = {
  key: string
  name: string
  path: string
  methods: number
  /** Names of the classes or interfaces it extends or implements, as the map has them. */
  parents: string[]
  /** Dependency edges to and from it and its members. */
  degree: number
}

export type OutlineStart = {
  key: string
  name: string
  path: string
  /** An entry point the map found, or `root`: called by nothing in the repository. */
  kind: EntryKind | 'root'
  /** Nodes the calls from it reach, a few levels deep. */
  reach: number
}

export type CodeMapOutline = {
  folders: OutlineFolder[]
  dependencies: OutlineDependency[]
  classes: OutlineClass[]
  starts: OutlineStart[]
  /** Outside packages the code imports, the most imported first. */
  modules: { name: string; files: number }[]
  counts: { files: number; symbols: number; entries: number }
}

export type OutlineOptions = {
  /** Folders are listed down to this many levels. Default 5. */
  depth?: number
  maxFolders?: number
  maxDependencies?: number
  maxClasses?: number
  maxStarts?: number
  maxModules?: number
}

export const OUTLINE_DEFAULTS = {
  depth: 5,
  maxFolders: 60,
  maxDependencies: 120,
  maxClasses: 40,
  maxStarts: 30,
  maxModules: 25,
} as const

const SYMBOL_KINDS = new Set(['class', 'function', 'method'])
const DEPENDENCY_KINDS = new Set(['imports', 'calls', 'extends', 'implements', 'references'])
/** Roots that reach fewer nodes are too small to be worth a diagram. */
const MIN_ROOT_REACH = 3

/** Every folder holding a non-test file, with its files and symbols, nested ones included. */
function folders(graph: CodeGraph, maxDepth: number) {
  const byFolder = new Map<string, { files: number; symbols: number }>()
  for (const node of graph.map.nodes) {
    if (node.path === undefined || isTestPath(node.path)) continue
    const isFile = node.kind === 'file'
    if (!isFile && !SYMBOL_KINDS.has(node.kind)) continue
    const segments = dirname(node.path).split('/').filter(Boolean)
    for (let level = 1; level <= Math.min(maxDepth, segments.length); level += 1) {
      const path = segments.slice(0, level).join('/')
      const entry = byFolder.get(path) ?? { files: 0, symbols: 0 }
      if (isFile) entry.files += 1
      else entry.symbols += 1
      byFolder.set(path, entry)
    }
  }
  return byFolder
}

/** The deepest kept folder a path lies in. */
function keptFolderOf(path: string, kept: ReadonlySet<string>): string | undefined {
  let folder = dirname(path)
  while (folder !== '') {
    if (kept.has(folder)) return folder
    folder = dirname(folder)
  }
  return undefined
}

function dependencies(graph: CodeGraph, kept: ReadonlySet<string>) {
  const counts = new Map<string, number>()
  for (const edge of graph.map.edges) {
    if (edge.kind !== 'imports') continue
    const from = graph.byKey.get(edge.from)
    const to = graph.byKey.get(edge.to)
    if (from?.path === undefined || to?.path === undefined || to.kind === 'module') continue
    if (isTestPath(from.path) || isTestPath(to.path)) continue
    const a = keptFolderOf(from.path, kept)
    const b = keptFolderOf(to.path, kept)
    if (a === undefined || b === undefined || a === b) continue
    const key = `${a}\n${b}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].map(([key, imports]) => {
    const [from, to] = key.split('\n') as [string, string]
    return { from: folderKey(from), to: folderKey(to), imports }
  })
}

function classes(graph: CodeGraph): OutlineClass[] {
  const incoming = new Map<string, number>()
  for (const edge of graph.map.edges) {
    if (DEPENDENCY_KINDS.has(edge.kind)) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
  }
  const list: OutlineClass[] = []
  for (const node of graph.map.nodes) {
    if (node.kind !== 'class' || node.path === undefined || isTestPath(node.path)) continue
    const members = (graph.children.get(node.key) ?? []).filter((child) => child.kind === 'method')
    let degree = 0
    for (const key of [node.key, ...members.map((member) => member.key)]) {
      degree += incoming.get(key) ?? 0
      for (const edge of graph.outgoing.get(key) ?? []) {
        if (DEPENDENCY_KINDS.has(edge.kind)) degree += 1
      }
    }
    const parents = [
      ...edgesOf(graph, node.key, 'extends'),
      ...edgesOf(graph, node.key, 'implements'),
    ]
      .map((edge) => graph.byKey.get(edge.to)?.name)
      .filter((name): name is string => name !== undefined)
    list.push({
      key: node.key,
      name: node.name,
      path: node.path,
      methods: members.length,
      parents: [...new Set(parents)].sort(compare),
      degree,
    })
  }
  return list.sort((a, b) => b.degree - a.degree || compare(a.key, b.key))
}

function starts(map: CodeMap, graph: CodeGraph, limit: number): OutlineStart[] {
  const reach = (node: CodeNode) => trace(graph, node.key, DEFAULT_FLOW_DEPTH).nodes.length
  const entries: OutlineStart[] = []
  const called = new Set<string>()
  for (const edge of map.edges) if (edge.kind === 'calls') called.add(edge.to)
  const roots: OutlineStart[] = []
  for (const node of map.nodes) {
    if (node.path === undefined || isTestPath(node.path)) continue
    if (node.entry !== undefined) {
      entries.push({
        key: node.key,
        name: node.name,
        path: node.path,
        kind: node.entry,
        reach: reach(node),
      })
      continue
    }
    if (node.kind !== 'function' && node.kind !== 'method') continue
    if (called.has(node.key) || edgesOf(graph, node.key, 'calls').length === 0) continue
    const size = reach(node)
    if (size >= MIN_ROOT_REACH) {
      roots.push({ key: node.key, name: node.name, path: node.path, kind: 'root', reach: size })
    }
  }
  const order = (a: OutlineStart, b: OutlineStart) => b.reach - a.reach || compare(a.key, b.key)
  // Entry points first; roots fill what is left, so a map without entry points still has starts.
  const kept = entries.sort(order).slice(0, limit)
  return [...kept, ...roots.sort(order).slice(0, limit - kept.length)]
}

function modules(graph: CodeGraph): { name: string; files: number }[] {
  const counts = new Map<string, number>()
  for (const [path, names] of graph.modulesByPath) {
    if (isTestPath(path)) continue
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts]
    .map(([name, files]) => ({ name, files }))
    .sort((a, b) => b.files - a.files || compare(a.name, b.name))
}

/** The outline of `map` a model reads to propose diagrams. Tests are left out. */
export function outlineCodeMap(map: CodeMap, options: OutlineOptions = {}): CodeMapOutline {
  const limits = { ...OUTLINE_DEFAULTS, ...options }
  const graph = buildCodeGraph(map)
  const all = folders(graph, limits.depth)
  // Small folders say little: the shallowest and largest are kept, then listed in path order.
  const threshold = Math.max(
    2,
    Math.ceil(map.nodes.filter((node) => node.kind === 'file').length / 200),
  )
  const level = (path: string) => path.split('/').length
  const keptFolders = [...all]
    .filter(([, entry]) => entry.files >= threshold)
    // A folder that only wraps one subfolder (`apps/` around `apps/api/`) adds nothing.
    .filter(
      ([path, entry]) =>
        ![...all].some(([other, sub]) => dirname(other) === path && sub.files === entry.files),
    )
    .sort((a, b) => level(a[0]) - level(b[0]) || b[1].files - a[1].files || compare(a[0], b[0]))
    .slice(0, limits.maxFolders)
    .sort((a, b) => compare(a[0], b[0]))
  const kept = new Set(keptFolders.map(([path]) => path))
  const counts = { files: 0, symbols: 0, entries: 0 }
  for (const node of map.nodes) {
    if (node.path === undefined || isTestPath(node.path)) continue
    if (node.kind === 'file') counts.files += 1
    else if (SYMBOL_KINDS.has(node.kind)) counts.symbols += 1
    if (node.entry !== undefined) counts.entries += 1
  }
  return {
    folders: keptFolders.map(([path, entry]) => ({ key: folderKey(path), path, ...entry })),
    dependencies: dependencies(graph, kept)
      .sort((a, b) => b.imports - a.imports || compare(a.from, b.from) || compare(a.to, b.to))
      .slice(0, limits.maxDependencies),
    classes: classes(graph).slice(0, limits.maxClasses),
    starts: starts(map, graph, limits.maxStarts),
    modules: modules(graph).slice(0, limits.maxModules),
    counts,
  }
}
