import { z } from 'zod'

import {
  CODE_MAP_LIMITS,
  CODE_MAP_VERSION,
  type CodeConfidence,
  type CodeEdge,
  type CodeEdgeKind,
  type CodeMap,
  type CodeNode,
  type CodeNodeKind,
  compare,
  isControlCharacter,
  isRepoPath,
} from './code-map.ts'
import { detectEntryPoints } from './entry-points.ts'

/**
 * Reads the `graph.json` that graphify writes (`graphify-out/graph.json`, a NetworkX node-link
 * graph). Only the fields listed here are read: the ones prefixed with `_` are graphify's own and
 * change between versions.
 */

/** The `schema_version` of `graph.json` this importer reads. */
export const GRAPHIFY_SCHEMA_VERSION = 1
/** The graphify release the importer was written and tested against (PyPI `graphifyy`). */
export const GRAPHIFY_TESTED_VERSION = '0.9.108'

/**
 * Folders left out of a map: build output and dependencies. The CLI writes them to
 * `.graphifyignore` too, so that graphify does not read them at all.
 */
export const DEFAULT_IGNORED_FOLDERS = [
  '.adonisjs',
  '.git',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'graphify-out',
  'node_modules',
  'vendor',
] as const

/** The `.graphifyignore` content for `DEFAULT_IGNORED_FOLDERS`. */
export function defaultGraphifyIgnore(): string {
  return `${DEFAULT_IGNORED_FOLDERS.map((folder) => `${folder}/`).join('\n')}\n`
}

const graphifyNode = z.looseObject({
  id: z.string(),
  label: z.string().optional(),
  source_file: z.string().nullish(),
  source_location: z.string().nullish(),
  file_type: z.string().nullish(),
  community: z.number().nullish(),
  type: z.string().nullish(),
  external: z.boolean().nullish(),
  _callable_class: z.boolean().nullish(),
})
type GraphifyNode = z.infer<typeof graphifyNode>

const graphifyEdge = z.looseObject({
  source: z.string(),
  target: z.string(),
  relation: z.string(),
  confidence: z.string().nullish(),
  context: z.string().nullish(),
})

const graphifyGraph = z.looseObject({
  graph: z.looseObject({
    schema_version: z.unknown(),
    graphify_version: z.string().optional(),
  }),
  nodes: z.array(z.unknown()),
  links: z.array(z.unknown()).optional(),
  edges: z.array(z.unknown()).optional(),
})

const RELATIONS: Record<string, CodeEdgeKind> = {
  contains: 'contains',
  method: 'contains',
  case_of: 'contains',
  imports: 'imports',
  imports_from: 'imports',
  re_exports: 'imports',
  dynamic_import: 'imports',
  calls: 'calls',
  indirect_call: 'calls',
  extends: 'extends',
  inherits: 'extends',
  implements: 'implements',
  references: 'references',
}

/** Files graphify reads as code although they hold no code symbol worth mapping. */
const DATA_FILE = /\.(?:json|jsonc|ya?ml|toml|lock|md|mdx|txt|csv|ini|env)$/i

export type GraphifyImportOptions = {
  /** Stripped from the start of absolute paths, when graphify ran with absolute paths. */
  root?: string
  repository?: string
  branch?: string
  commit?: string
  generatedAt?: string
  /** Folder names left out wherever they appear. Default: `DEFAULT_IGNORED_FOLDERS`. */
  ignoredFolders?: readonly string[]
}

export type GraphifyImportResult =
  | {
      ok: true
      map: CodeMap
      /** What was dropped: graphify nodes and edges with no place in the map. */
      skipped: { nodes: number; edges: number }
    }
  | { ok: false; problems: string[] }

/** Strips control characters and cuts a name to the map's limit. */
export function cleanName(value: string): string {
  return [...value]
    .map((char) => (isControlCharacter(char) ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CODE_MAP_LIMITS.name)
}

function lineOf(location: string | null | undefined): number | undefined {
  const match = location ? /^L(\d+)/.exec(location) : null
  const line = match ? Number(match[1]) : 0
  return line > 0 ? line : undefined
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** The module name of an import graphify could not resolve: `ref_adonisjs_core` → `adonisjs_core`. */
function moduleName(node: GraphifyNode): string {
  return cleanName((node.label ?? node.id).replace(/^ref_/, ''))
}

/**
 * A package from outside the repository. Without a manifest graphify names it `ref_<name>` and
 * flags it external; with one, it reads the manifest and keeps the real name as the label.
 */
function isModule(node: GraphifyNode): boolean {
  return (
    node.external === true ||
    node.type === 'external' ||
    node.type === 'module' ||
    node.id.startsWith('ref_')
  )
}

/** A repository-relative path, or `null` when the path points outside the repository. */
function repoPathOf(raw: string, root: string | undefined): string | null {
  let path = raw.replaceAll('\\', '/')
  if (root) {
    const prefix = root.replaceAll('\\', '/').replace(/\/+$/, '')
    if (path.startsWith(`${prefix}/`)) path = path.slice(prefix.length + 1)
  }
  path = path.replace(/^(?:\.\/)+/, '')
  return path.length <= CODE_MAP_LIMITS.path && isRepoPath(path) ? path : null
}

type Classified = { node: GraphifyNode; kind: CodeNodeKind; name: string; path?: string }

function classify(node: GraphifyNode, options: GraphifyImportOptions): Classified | null {
  if (isModule(node)) {
    const name = moduleName(node)
    return name ? { node, kind: 'module', name } : null
  }
  if (node.file_type && node.file_type !== 'code') return null
  if (!node.source_file) return null
  const path = repoPathOf(node.source_file, options.root)
  if (!path || DATA_FILE.test(path)) return null
  const ignored = options.ignoredFolders ?? DEFAULT_IGNORED_FOLDERS
  if (path.split('/').some((segment) => ignored.includes(segment))) return null

  const label = node.label ?? ''
  const location = node.source_location ?? ''
  // A file's label is its name, or a longer end of its path when two files share a name.
  if ((path === label || path.endsWith(`/${label}`)) && (location === '' || location === 'L1')) {
    return { node, kind: 'file', name: cleanName(basename(path)), path }
  }
  const method = /^\.(.+)\(\)$/.exec(label)
  if (method?.[1]) return { node, kind: 'method', name: cleanName(method[1]), path }
  const fn = /^(.+)\(\)$/.exec(label)
  if (fn?.[1]) return { node, kind: 'function', name: cleanName(fn[1]), path }
  const name = cleanName(label)
  if (!name) return null
  return { node, kind: node._callable_class ? 'class' : 'variable', name, path }
}

function parseItems<T>(schema: z.ZodType<T>, items: readonly unknown[]): [T[], number] {
  const parsed: T[] = []
  let invalid = 0
  for (const item of items) {
    const result = schema.safeParse(item)
    if (result.success) parsed.push(result.data)
    else invalid += 1
  }
  return [parsed, invalid]
}

/**
 * Turns graphify's `graph.json` (already parsed from JSON) into a `CodeMap`, entry points
 * included. Refuses an unknown `schema_version` and a graph over the map's limits; drops what has
 * no place in a map (documents, configuration files, ignored folders, unresolved names).
 */
export function importGraphify(
  value: unknown,
  options: GraphifyImportOptions = {},
): GraphifyImportResult {
  const envelope = graphifyGraph.safeParse(value)
  if (!envelope.success) {
    return { ok: false, problems: ['Not a graphify graph.json: expected graph, nodes and links'] }
  }
  const graph = envelope.data
  const schemaVersion = graph.graph.schema_version
  if (schemaVersion !== GRAPHIFY_SCHEMA_VERSION) {
    return {
      ok: false,
      problems: [
        `Unsupported graphify schema_version ${JSON.stringify(schemaVersion ?? null)}: this ` +
          `importer reads version ${GRAPHIFY_SCHEMA_VERSION} (graphifyy ${GRAPHIFY_TESTED_VERSION}).`,
      ],
    }
  }
  const rawEdges = graph.links ?? graph.edges ?? []
  if (graph.nodes.length > CODE_MAP_LIMITS.nodes) {
    return {
      ok: false,
      problems: [`Too many nodes: ${graph.nodes.length}, at most ${CODE_MAP_LIMITS.nodes}.`],
    }
  }
  if (rawEdges.length > CODE_MAP_LIMITS.edges) {
    return {
      ok: false,
      problems: [`Too many links: ${rawEdges.length}, at most ${CODE_MAP_LIMITS.edges}.`],
    }
  }

  const [nodes, invalidNodes] = parseItems(graphifyNode, graph.nodes)
  const [edges, invalidEdges] = parseItems(graphifyEdge, rawEdges)
  const byId = new Map(nodes.map((node) => [node.id, node]))

  const classified = new Map<string, Classified>()
  for (const node of nodes) {
    const item = classify(node, options)
    if (item) classified.set(node.id, item)
  }

  // A method's key names its class: graphify links them with a `method` edge.
  const classOf = new Map<string, string>()
  for (const edge of edges) {
    const owner = classified.get(edge.source)
    if (edge.relation === 'method' && owner?.kind === 'class') classOf.set(edge.target, owner.name)
  }

  const keyOf = new Map<string, string>()
  const used = new Set<string>()
  const result: CodeNode[] = []
  const ordered = [...classified.values()].sort((a, b) => compare(a.node.id, b.node.id))
  for (const item of ordered) {
    const { node, kind, path } = item
    const owner = kind === 'method' ? classOf.get(node.id) : undefined
    const name = owner ? cleanName(`${owner}.${item.name}`) : item.name
    const line = lineOf(node.source_location)
    let key: string
    if (kind === 'module') key = `module:${name}`
    else if (kind === 'file') key = path as string
    else key = `${path}#${name}`
    if (kind === 'module' && used.has(key)) {
      // The same package, seen from the code and from the manifest: one node.
      keyOf.set(node.id, key)
      continue
    }
    if (used.has(key) && line !== undefined) key = `${key}@L${line}`
    for (let suffix = 2; used.has(key); suffix += 1) key = `${key.replace(/~\d+$/, '')}~${suffix}`
    used.add(key)
    keyOf.set(node.id, key)

    const codeNode: CodeNode = { key, name, kind }
    if (path !== undefined) codeNode.path = path
    if (line !== undefined && kind !== 'file' && kind !== 'module') codeNode.line = line
    if (typeof node.community === 'number' && Number.isInteger(node.community)) {
      if (node.community >= 0) codeNode.community = node.community
    }
    result.push(codeNode)
  }

  const nodeByKey = new Map(result.map((node) => [node.key, node]))
  const annotations = new Map<string, Set<string>>()
  const edgeByPair = new Map<string, CodeEdge>()
  let skippedEdges = invalidEdges
  for (const edge of edges) {
    const from = keyOf.get(edge.source)
    if (edge.relation === 'references' && edge.context === 'decorator') {
      const target = byId.get(edge.target)
      const annotation = target ? cleanName((target.label ?? '').replace(/\(\)$/, '')) : ''
      if (from && annotation) {
        const set = annotations.get(from) ?? new Set<string>()
        set.add(annotation)
        annotations.set(from, set)
      } else skippedEdges += 1
      continue
    }
    const to = keyOf.get(edge.target)
    const kind = RELATIONS[edge.relation]
    if (!from || !to || !kind || from === to) {
      skippedEdges += 1
      continue
    }
    const confidence: CodeConfidence = edge.confidence === 'EXTRACTED' ? 'extracted' : 'inferred'
    const pair = `${from}\u0000${to}\u0000${kind}`
    const known = edgeByPair.get(pair)
    if (known) {
      if (confidence === 'extracted') known.confidence = 'extracted'
      skippedEdges += 1
      continue
    }
    edgeByPair.set(pair, { from, to, kind, confidence })
  }
  for (const [key, set] of annotations) {
    const node = nodeByKey.get(key)
    if (node) node.annotations = [...set].sort(compare).slice(0, CODE_MAP_LIMITS.annotations)
  }

  result.sort((a, b) => compare(a.key, b.key))
  const codeEdges = [...edgeByPair.values()].sort(
    (a, b) => compare(a.from, b.from) || compare(a.to, b.to) || compare(a.kind, b.kind),
  )

  const header: CodeMap['header'] = {
    version: CODE_MAP_VERSION,
    extractor: { name: 'graphify', version: cleanName(graph.graph.graphify_version ?? 'unknown') },
    nodeCount: result.length,
    edgeCount: codeEdges.length,
  }
  if (options.repository) header.repository = options.repository
  if (options.branch) header.branch = options.branch
  if (options.commit) header.commit = options.commit
  if (options.generatedAt) header.generatedAt = options.generatedAt

  return {
    ok: true,
    map: detectEntryPoints({ header, nodes: result, edges: codeEdges }),
    skipped: { nodes: nodes.length - result.length + invalidNodes, edges: skippedEdges },
  }
}
