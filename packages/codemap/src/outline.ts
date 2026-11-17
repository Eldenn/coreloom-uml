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
  /**
   * An entry point the map found, `root`: called by nothing in the repository, or `function`:
   * a function or method other code calls, listed because a request names it.
   */
  kind: EntryKind | 'root' | 'function'
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
  /**
   * What the user asked for, in their words: the folders, classes, functions and methods whose
   * name or path holds one of its words are added after the lists above, so that a request can
   * be about code the outline would leave out.
   */
  query?: string
  /**
   * The requests made before `query` in the same conversation, the latest first: their words
   * fill what `query` leaves free, so that "the same as an activity diagram" still finds the code.
   */
  earlier?: readonly string[]
}

/** How much of a request is read, and how much it may add to each list. */
export const OUTLINE_QUERY_LIMITS = {
  /** Words compared with the names: the rarest in the map, a request's own before earlier ones. */
  words: 8,
  /** Words of one request considered before the rarest are kept. */
  candidates: 40,
  minWordLength: 3,
  folders: 10,
  classes: 20,
  starts: 20,
} as const

/** Words that ask for a diagram or name its kind, not the code it is about (English, French). */
const REQUEST_WORDS = new Set(
  (
    'draw show shows diagram diagrams view sequence activity class classes package packages ' +
    'component components uml please ' +
    'dessine dessiner montre montrer diagramme diagrammes vue séquence sequence activité activite ' +
    'classe paquetage paquetages composant composants'
  ).split(' '),
)

/** The words of a request that may name code, in the order they come. */
export function queryWords(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= OUTLINE_QUERY_LIMITS.minWordLength && !REQUEST_WORDS.has(word))
  return [...new Set(words)].slice(0, OUTLINE_QUERY_LIMITS.candidates)
}

/**
 * The words names are compared with: of each request, those that name something in the map, the
 * rarest first, so that "the" or "how" never push out the one word that names the code. An
 * earlier request only fills what the later ones leave free.
 */
function chosenWords(map: CodeMap, requests: readonly string[]): string[] {
  const chosen: string[] = []
  for (const request of requests) {
    const words = queryWords(request).filter((word) => !chosen.includes(word))
    const counts = new Map(words.map((word) => [word, 0]))
    for (const node of map.nodes) {
      if (node.path === undefined || isTestPath(node.path)) continue
      const text = `${node.key}\n${node.name}`.toLowerCase()
      for (const word of words) {
        if (text.includes(word)) counts.set(word, (counts.get(word) ?? 0) + 1)
      }
    }
    const found = words
      .filter((word) => (counts.get(word) ?? 0) > 0)
      .sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0))
    chosen.push(...found.slice(0, OUTLINE_QUERY_LIMITS.words - chosen.length))
    if (chosen.length >= OUTLINE_QUERY_LIMITS.words) break
  }
  return chosen
}

/** How many of `words` the text holds. */
function matched(words: readonly string[], ...texts: string[]): number {
  // ponytail: plain substring match, no stemming; rank by embedding or an index if requests
  // miss their target.
  const text = texts.join('\n').toLowerCase()
  return words.filter((word) => text.includes(word)).length
}

/** The items a request names, those holding the most words first, then as `order` says. */
function bestMatches<T>(
  items: readonly T[],
  score: (item: T) => number,
  order: (a: T, b: T) => number,
  limit: number,
): T[] {
  return items
    .map((item) => ({ item, score: score(item) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || order(a.item, b.item))
    .slice(0, limit)
    .map((entry) => entry.item)
}

const START_RANK = { function: 2, root: 1 } as const
const startRank = (kind: OutlineStart['kind']) =>
  kind === 'function' || kind === 'root' ? START_RANK[kind] : 0

/** Functions, methods and entry points a request names, whatever calls them. */
function matchingStarts(
  map: CodeMap,
  graph: CodeGraph,
  words: readonly string[],
  taken: ReadonlySet<string>,
): OutlineStart[] {
  const called = new Set<string>()
  for (const edge of map.edges) if (edge.kind === 'calls') called.add(edge.to)
  const candidates: (Omit<OutlineStart, 'reach'> & { score: number })[] = []
  for (const node of map.nodes) {
    if (node.path === undefined || isTestPath(node.path) || taken.has(node.key)) continue
    const callable = node.kind === 'function' || node.kind === 'method'
    if (node.entry === undefined && !callable) continue
    const score = matched(words, node.key, node.name, node.path)
    if (score === 0) continue
    const kind = node.entry ?? (called.has(node.key) ? 'function' : 'root')
    candidates.push({ key: node.key, name: node.name, path: node.path, kind, score })
  }
  // Tracing every match of a large map would be slow: only the best ranked are traced.
  const shortlist = candidates
    .sort(
      (a, b) => b.score - a.score || startRank(a.kind) - startRank(b.kind) || compare(a.key, b.key),
    )
    .slice(0, OUTLINE_QUERY_LIMITS.starts * 5)
    .map(({ score, ...start }) => ({
      score,
      start: { ...start, reach: trace(graph, start.key, DEFAULT_FLOW_DEPTH).nodes.length },
    }))
  return shortlist
    .sort(
      (a, b) =>
        b.score - a.score ||
        startRank(a.start.kind) - startRank(b.start.kind) ||
        b.start.reach - a.start.reach ||
        compare(a.start.key, b.start.key),
    )
    .slice(0, OUTLINE_QUERY_LIMITS.starts)
    .map((entry) => entry.start)
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
  const allClasses = classes(graph)
  const outline: CodeMapOutline = {
    folders: keptFolders.map(([path, entry]) => ({ key: folderKey(path), path, ...entry })),
    dependencies: dependencies(graph, kept)
      .sort((a, b) => b.imports - a.imports || compare(a.from, b.from) || compare(a.to, b.to))
      .slice(0, limits.maxDependencies),
    classes: allClasses.slice(0, limits.maxClasses),
    starts: starts(map, graph, limits.maxStarts),
    modules: modules(graph).slice(0, limits.maxModules),
    counts,
  }
  const words = chosenWords(map, [options.query ?? '', ...(options.earlier ?? [])])
  if (words.length === 0) return outline

  const listed = new Set(outline.classes.map((item) => item.key))
  outline.classes.push(
    ...bestMatches(
      allClasses.filter((item) => !listed.has(item.key)),
      (item) => matched(words, item.name, item.path),
      // `allClasses` is sorted by links already, and the sort is stable.
      () => 0,
      OUTLINE_QUERY_LIMITS.classes,
    ),
  )
  outline.starts.push(
    ...matchingStarts(map, graph, words, new Set(outline.starts.map((start) => start.key))),
  )
  outline.folders.push(
    ...bestMatches(
      [...all].filter(([path]) => !kept.has(path)),
      ([path]) => matched(words, path),
      (a, b) => b[1].files - a[1].files || compare(a[0], b[0]),
      OUTLINE_QUERY_LIMITS.folders,
    ).map(([path, entry]) => ({ key: folderKey(path), path, ...entry })),
  )
  return outline
}
