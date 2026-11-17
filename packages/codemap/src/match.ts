import { buildCodeGraph, type CodeGraph, membersOf } from './code-graph.ts'
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
 * Deterministic matching of a diagram against a code map: which code each element stands for,
 * which drawn relations the code has, and which dependencies the code has that the diagram does
 * not draw. Nothing here calls a model: the results are proposals for the user to confirm, and
 * evidence for the conformance review.
 *
 * - Package and component diagrams: a package's name is its folder from the repository root,
 *   under its parent package's folder when nested (the convention of the dependency rules drawn
 *   from package diagrams); a name that is not a path matches folders of that name. A class or
 *   an interface matches a class of the same name.
 * - Class diagrams: classes by name (case, spaces, dashes and generics ignored); the namespace,
 *   when set, picks among homonyms.
 * - Sequence diagrams: participants by class, file or folder name; actors are left out. Messages
 *   are checked against calls, not their order.
 * - C4: containers and components by folder name (`apps/api` for `api`); people and systems are
 *   left out.
 * - State, ER, use case, activity and deployment diagrams have no counterpart the map can show.
 */

/** What the matcher reads of a diagram: a `UmlSpec` from `@coreloom-uml/uml` fits. */
export type MatchableDiagram =
  | {
      kind: 'package' | 'component'
      elements: readonly { id: string; kind?: string; label?: string; parent?: string }[]
      relations: readonly { from: string; to: string; kind?: string }[]
    }
  | {
      kind: 'class'
      classes: readonly { id: string; label?: string; namespace?: string }[]
      relations: readonly { from: string; to: string; kind?: string }[]
    }
  | {
      kind: 'sequence'
      participants: readonly { id: string; label?: string; kind?: string }[]
      steps: readonly SequenceStepShape[]
    }
  | {
      kind: 'c4'
      elements: readonly { id: string; kind: string; label?: string }[]
      relations: readonly { from: string; to: string }[]
    }
  | { kind: 'state' | 'er' | 'usecase' | 'activity' | 'deployment' }

type SequenceStepShape = {
  type: string
  from?: string
  to?: string
  text?: string
  sections?: readonly { steps: readonly SequenceStepShape[] }[]
}

export type LinkStatus = 'suggested' | 'confirmed' | 'ignored'

/** A link the user already reviewed, kept from one map to the next by its code key. */
export type DiagramCodeLink = { elementId: string; codeKey: string; status: LinkStatus }

export type MatchReason = 'confirmed' | 'folder-path' | 'folder-name' | 'class-name' | 'file-name'

export type ElementMatch = {
  elementId: string
  /** `confirmed` by the user, `suggested` by the matcher, or `missing`: nothing found. */
  status: 'confirmed' | 'suggested' | 'missing'
  /** Node keys, or folder keys (`apps/api/`). At most `MAX_CANDIDATES`. */
  candidates: { codeKey: string; reason: MatchReason }[]
}

export type RelationCheck = {
  from: string
  to: string
  label?: string
  /**
   * `found` with up to three code edges as evidence; `missing` when the code has none;
   * `unresolved` when one end is missing or ambiguous, so nothing can be said.
   */
  status: 'found' | 'missing' | 'unresolved'
  evidence: { from: string; to: string }[]
}

export type MatchFinding =
  | { kind: 'missing-in-code'; elementId: string }
  | { kind: 'stale-link'; elementId: string; codeKey: string }
  | { kind: 'relation-not-in-code'; from: string; to: string; label?: string }
  | {
      kind: 'dependency-not-drawn'
      from: string
      to: string
      /** How many code edges, and the first three of them (node keys). */
      count: number
      evidence: { from: string; to: string }[]
    }

export type DiagramMatch = {
  elements: ElementMatch[]
  relations: RelationCheck[]
  findings: MatchFinding[]
}

export const MAX_CANDIDATES = 5
const MAX_EVIDENCE = 3

/** Edges that make one part of the code depend on another. */
const DEPENDENCY_KINDS: ReadonlySet<CodeEdgeKind> = new Set([
  'imports',
  'calls',
  'extends',
  'implements',
  'references',
])
const STRUCTURAL_KINDS: ReadonlySet<CodeEdgeKind> = new Set(['extends', 'implements', 'references'])

/** Lowercase letters and digits only: `Owned Architecture`, `owned-architecture` match. */
export function normalizeName(name: string): string {
  return name
    .replace(/[<~].*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

const FOLDER_PATH = /^[A-Za-z0-9._@-]+(?:\/[A-Za-z0-9._@-]+)*$/

type MapIndex = {
  graph: CodeGraph
  folders: ReadonlySet<string>
  foldersByName: ReadonlyMap<string, string[]>
  classesByName: ReadonlyMap<string, CodeNode[]>
  filesByStem: ReadonlyMap<string, CodeNode[]>
}

function add<V>(map: Map<string, V[]>, key: string, value: V) {
  if (!key) return
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

function indexMap(map: CodeMap): MapIndex {
  const graph = buildCodeGraph(map)
  const folders = new Set<string>()
  const foldersByName = new Map<string, string[]>()
  const classesByName = new Map<string, CodeNode[]>()
  const filesByStem = new Map<string, CodeNode[]>()
  for (const node of map.nodes) {
    if (node.path === undefined) continue
    for (
      let folder = dirname(node.path);
      folder && !folders.has(folder);
      folder = dirname(folder)
    ) {
      folders.add(folder)
      add(foldersByName, normalizeName(folder.slice(folder.lastIndexOf('/') + 1)), folder)
    }
    if (node.kind === 'class') add(classesByName, normalizeName(node.name), node)
    if (node.kind === 'file')
      add(filesByStem, normalizeName(node.name.replace(/\.[^.]+$/, '')), node)
  }
  return { graph, folders, foldersByName, classesByName, filesByStem }
}

/** Shallow folders first, then path order; at most `MAX_CANDIDATES`. */
function pickFolders(paths: Iterable<string>) {
  return [...paths]
    .sort((a, b) => a.split('/').length - b.split('/').length || compare(a, b))
    .slice(0, MAX_CANDIDATES)
}

/** The folder a package names, from the root or under its parent's folder (PR #37 convention). */
function folderPath(name: string, parentFolder: string | undefined): string | null {
  const clean = name.trim().replace(/^(?:\.?\/)+|\/+$/g, '')
  const path = !parentFolder || within(clean, parentFolder) ? clean : `${parentFolder}/${clean}`
  return FOLDER_PATH.test(path) && !path.split('/').includes('..') ? path : null
}

function folderCandidates(
  index: MapIndex,
  name: string,
  parentFolder?: string,
  prefixes: readonly string[] = [],
): ElementMatch['candidates'] {
  const path = folderPath(name, parentFolder)
  if (path && index.folders.has(path)) return [{ codeKey: folderKey(path), reason: 'folder-path' }]
  for (const prefix of prefixes) {
    const guess = folderPath(`${prefix}/${name}`, undefined)
    if (guess && index.folders.has(guess)) {
      return [{ codeKey: folderKey(guess), reason: 'folder-path' }]
    }
  }
  const named = (index.foldersByName.get(normalizeName(name)) ?? []).filter(
    (folder) => !parentFolder || within(folder, parentFolder),
  )
  return pickFolders(named).map((folder) => ({
    codeKey: folderKey(folder),
    reason: 'folder-name' as const,
  }))
}

function classCandidates(
  index: MapIndex,
  name: string,
  namespace?: string,
): ElementMatch['candidates'] {
  let classes = index.classesByName.get(normalizeName(name)) ?? []
  if (namespace && classes.length > 1) {
    const segments = namespace
      .split(/[./\\:]+/)
      .map(normalizeName)
      .filter(Boolean)
    const inNamespace = classes.filter((node) => {
      const folders = dirname(node.path ?? '')
        .split('/')
        .map(normalizeName)
      return segments.every((segment) => folders.includes(segment))
    })
    if (inNamespace.length > 0) classes = inNamespace
  }
  return [...classes]
    .sort((a, b) => compare(a.key, b.key))
    .slice(0, MAX_CANDIDATES)
    .map((node) => ({ codeKey: node.key, reason: 'class-name' as const }))
}

function fileCandidates(index: MapIndex, name: string): ElementMatch['candidates'] {
  return [...(index.filesByStem.get(normalizeName(name)) ?? [])]
    .sort((a, b) => compare(a.key, b.key))
    .slice(0, MAX_CANDIDATES)
    .map((node) => ({ codeKey: node.key, reason: 'file-name' as const }))
}

/** The elements to match, each with what the matcher proposes for it. */
type Wanted = {
  id: string
  /** Proposals; may use the folder resolved for the element's parent. */
  propose: (parentFolder: string | undefined) => ElementMatch['candidates']
  parent?: string
}

function wantedElements(diagram: MatchableDiagram, index: MapIndex): Wanted[] {
  switch (diagram.kind) {
    case 'package':
    case 'component':
      return diagram.elements.flatMap((element): Wanted[] => {
        const name = element.label ?? element.id
        const base = { id: element.id, ...(element.parent ? { parent: element.parent } : {}) }
        if (element.kind === 'package' || element.kind === 'component') {
          return [
            {
              ...base,
              propose: (parent) => {
                const folders = folderCandidates(index, name, parent)
                return folders.length > 0 || element.kind === 'package'
                  ? folders
                  : classCandidates(index, name)
              },
            },
          ]
        }
        if (element.kind === 'class' || element.kind === 'interface') {
          return [{ ...base, propose: () => classCandidates(index, name) }]
        }
        return []
      })
    case 'class':
      return diagram.classes.map((element) => ({
        id: element.id,
        propose: () => classCandidates(index, element.label ?? element.id, element.namespace),
      }))
    case 'sequence':
      return diagram.participants
        .filter((participant) => participant.kind !== 'actor')
        .map((participant) => ({
          id: participant.id,
          propose: () => {
            const name = participant.label ?? participant.id
            const classes = classCandidates(index, name)
            if (classes.length > 0) return classes
            const files = fileCandidates(index, name)
            return files.length > 0 ? files : folderCandidates(index, name)
          },
        }))
    case 'c4':
      return diagram.elements
        .filter((element) => element.kind === 'container' || element.kind === 'component')
        .map((element) => ({
          id: element.id,
          propose: () =>
            folderCandidates(index, element.label ?? element.id, undefined, ['apps', 'packages']),
        }))
    default:
      return []
  }
}

function codeKeyExists(index: MapIndex, key: string): boolean {
  return isFolderKey(key) ? index.folders.has(key.slice(0, -1)) : index.graph.byKey.has(key)
}

/** The node keys a code key stands for: a folder's nodes, a file's, a class with its members. */
function scopeOf(index: MapIndex, key: string): Set<string> {
  if (isFolderKey(key)) {
    const folder = key.slice(0, -1)
    const keys = new Set<string>()
    for (const [path, nodes] of index.graph.byPath) {
      if (within(path, folder)) for (const node of nodes) keys.add(node.key)
    }
    return keys
  }
  const node = index.graph.byKey.get(key)
  return new Set(node ? membersOf(index.graph, node).map((member) => member.key) : [])
}

function sequenceMessages(steps: readonly SequenceStepShape[]): SequenceStepShape[] {
  return steps.flatMap((step) =>
    step.type === 'message'
      ? [step]
      : (step.sections ?? []).flatMap((section) => sequenceMessages(section.steps)),
  )
}

type DrawnRelation = { from: string; to: string; kind?: string; label?: string }

function drawnRelations(diagram: MatchableDiagram): DrawnRelation[] {
  switch (diagram.kind) {
    case 'package':
    case 'component':
    case 'class':
    case 'c4':
      return diagram.relations.map((relation) => {
        const kind = 'kind' in relation ? relation.kind : undefined
        return { from: relation.from, to: relation.to, ...(kind ? { kind } : {}) }
      })
    case 'sequence': {
      const seen = new Set<string>()
      return sequenceMessages(diagram.steps).flatMap((message): DrawnRelation[] => {
        const pair = `${message.from}\u0000${message.to}`
        if (!message.from || !message.to || message.from === message.to || seen.has(pair)) return []
        seen.add(pair)
        const text = message.text?.trim()
        return [{ from: message.from, to: message.to, ...(text ? { label: text } : {}) }]
      })
    }
    default:
      return []
  }
}

/** The code edge kinds that can stand for a drawn relation. */
function kindsFor(diagram: MatchableDiagram, relationKind: string | undefined) {
  if (diagram.kind === 'sequence') return new Set<CodeEdgeKind>(['calls'])
  if (diagram.kind === 'class' && relationKind === 'inheritance') {
    return new Set<CodeEdgeKind>(['extends'])
  }
  if (diagram.kind === 'class' && relationKind === 'realization') {
    return new Set<CodeEdgeKind>(['implements', 'extends'])
  }
  return DEPENDENCY_KINDS
}

function edgesBetween(
  index: MapIndex,
  from: ReadonlySet<string>,
  to: ReadonlySet<string>,
  kinds: ReadonlySet<CodeEdgeKind>,
) {
  const found: { from: string; to: string }[] = []
  for (const key of [...from].sort(compare)) {
    for (const edge of index.graph.outgoing.get(key) ?? []) {
      if (kinds.has(edge.kind) && to.has(edge.to) && !from.has(edge.to)) {
        found.push({ from: edge.from, to: edge.to })
      }
    }
  }
  return found
}

/**
 * Matches one diagram against a code map. `links` are the user's earlier decisions: confirmed
 * links replace the proposals, ignored ones are never proposed again. Relations are only checked
 * between elements that resolve to one place in the code (confirmed, or a single proposal).
 */
export function matchDiagram(
  diagram: MatchableDiagram,
  map: CodeMap,
  links: readonly DiagramCodeLink[] = [],
): DiagramMatch {
  const index = indexMap(map)
  const wanted = wantedElements(diagram, index)
  const byId = new Map(wanted.map((item) => [item.id, item]))
  const findings: MatchFinding[] = []
  const elements = new Map<string, ElementMatch>()
  /** Each resolved element's code keys. */
  const resolved = new Map<string, string[]>()

  const resolve = (item: Wanted, depth = 0): ElementMatch => {
    const known = elements.get(item.id)
    if (known) return known
    const own = links.filter((link) => link.elementId === item.id)
    const confirmed = own.filter((link) => link.status === 'confirmed')
    const live = confirmed.filter((link) => codeKeyExists(index, link.codeKey))
    for (const link of confirmed) {
      if (!live.includes(link)) {
        findings.push({ kind: 'stale-link', elementId: item.id, codeKey: link.codeKey })
      }
    }
    let match: ElementMatch
    if (live.length > 0) {
      match = {
        elementId: item.id,
        status: 'confirmed',
        candidates: live.map((link) => ({ codeKey: link.codeKey, reason: 'confirmed' as const })),
      }
    } else {
      // The depth bound stops a cycle of parents.
      const parent = item.parent !== undefined ? byId.get(item.parent) : undefined
      const parentMatch = parent && depth < wanted.length ? resolve(parent, depth + 1) : undefined
      const parentKeys = parentMatch ? resolved.get(parentMatch.elementId) : undefined
      const parentFolder =
        parentKeys?.length === 1 && isFolderKey(parentKeys[0] as string)
          ? (parentKeys[0] as string).slice(0, -1)
          : undefined
      const ignored = new Set(
        own.filter((link) => link.status === 'ignored').map((link) => link.codeKey),
      )
      const candidates = item.propose(parentFolder).filter((c) => !ignored.has(c.codeKey))
      match = {
        elementId: item.id,
        status: candidates.length > 0 ? 'suggested' : 'missing',
        candidates,
      }
    }
    elements.set(item.id, match)
    if (match.status === 'confirmed' || match.candidates.length === 1) {
      resolved.set(
        item.id,
        match.candidates.map((candidate) => candidate.codeKey),
      )
    }
    return match
  }
  for (const item of wanted) resolve(item)
  for (const match of elements.values()) {
    if (match.status === 'missing') {
      findings.push({ kind: 'missing-in-code', elementId: match.elementId })
    }
  }

  const scopes = new Map<string, Set<string>>()
  for (const [id, keys] of resolved) {
    const scope = new Set<string>()
    for (const key of keys) for (const member of scopeOf(index, key)) scope.add(member)
    scopes.set(id, scope)
  }

  const relations: RelationCheck[] = []
  const drawn = drawnRelations(diagram)
  for (const relation of drawn) {
    if (!byId.has(relation.from) || !byId.has(relation.to)) continue
    const from = scopes.get(relation.from)
    const to = scopes.get(relation.to)
    const check: RelationCheck = {
      from: relation.from,
      to: relation.to,
      status: 'unresolved',
      evidence: [],
    }
    if (relation.label) check.label = relation.label
    if (from && to && from.size > 0 && to.size > 0) {
      const evidence = edgesBetween(index, from, to, kindsFor(diagram, relation.kind))
      check.status = evidence.length > 0 ? 'found' : 'missing'
      check.evidence = evidence.slice(0, MAX_EVIDENCE)
      if (check.status === 'missing') {
        findings.push({
          kind: 'relation-not-in-code',
          from: relation.from,
          to: relation.to,
          ...(check.label ? { label: check.label } : {}),
        })
      }
    }
    relations.push(check)
  }

  findings.push(...undrawnDependencies(diagram, index, scopes, drawn, byId))

  return {
    elements: wanted.map((item) => elements.get(item.id) as ElementMatch),
    relations,
    findings,
  }
}

/**
 * Code dependencies between two resolved elements that no drawn relation covers. In package,
 * component and C4 diagrams each edge counts for the smallest element holding each end, and an
 * arrow covers what both of its ends contain. In class diagrams only inheritance, realization and
 * typed references count: calls between classes are too many to all be drawn.
 */
function undrawnDependencies(
  diagram: MatchableDiagram,
  index: MapIndex,
  scopes: ReadonlyMap<string, Set<string>>,
  drawn: readonly { from: string; to: string }[],
  byId: ReadonlyMap<string, Wanted>,
): MatchFinding[] {
  if (!['package', 'component', 'c4', 'class'].includes(diagram.kind)) return []
  const kinds = diagram.kind === 'class' ? STRUCTURAL_KINDS : DEPENDENCY_KINDS

  const ancestors = (id: string): string[] => {
    const chain: string[] = []
    for (
      let current: string | undefined = id;
      current !== undefined && chain.length <= byId.size;
    ) {
      chain.push(current)
      current = byId.get(current)?.parent
    }
    return chain
  }
  const covered = (a: string, b: string) => {
    const fromChain = ancestors(a)
    const toChain = ancestors(b)
    return drawn.some(
      (relation) =>
        (fromChain.includes(relation.from) && toChain.includes(relation.to)) ||
        (diagram.kind === 'class' &&
          fromChain.includes(relation.to) &&
          toChain.includes(relation.from)),
    )
  }

  // The smallest resolved element holding each node.
  const owner = new Map<string, string>()
  const bySize = [...scopes].sort((a, b) => a[1].size - b[1].size || compare(a[0], b[0]))
  for (const [id, scope] of bySize) {
    for (const key of scope) if (!owner.has(key)) owner.set(key, id)
  }

  const pairs = new Map<
    string,
    { from: string; to: string; count: number; evidence: { from: string; to: string }[] }
  >()
  for (const edge of index.graph.map.edges) {
    if (!kinds.has(edge.kind)) continue
    const from = owner.get(edge.from)
    const to = owner.get(edge.to)
    if (!from || !to || from === to) continue
    const fromScope = scopes.get(from) as Set<string>
    const toScope = scopes.get(to) as Set<string>
    // Nested elements (a package inside another) depend on each other freely.
    if (fromScope.has(edge.to) || toScope.has(edge.from)) continue
    if (ancestors(from).includes(to) || ancestors(to).includes(from)) continue
    if (covered(from, to)) continue
    const pair = `${from}\u0000${to}`
    const entry = pairs.get(pair) ?? { from, to, count: 0, evidence: [] }
    entry.count += 1
    if (entry.evidence.length < MAX_EVIDENCE) entry.evidence.push({ from: edge.from, to: edge.to })
    pairs.set(pair, entry)
  }
  return [...pairs.values()]
    .sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to))
    .map((entry) => ({ kind: 'dependency-not-drawn' as const, ...entry }))
}

/**
 * The code keys a set of matches resolves to, for `findUncoveredFlows`: confirmed links, and
 * proposals that are the only candidate of their element.
 */
export function linkedCodeKeys(matches: readonly DiagramMatch[]): string[] {
  const keys = new Set<string>()
  for (const match of matches) {
    for (const element of match.elements) {
      if (element.status === 'confirmed' || element.candidates.length === 1) {
        for (const candidate of element.candidates) keys.add(candidate.codeKey)
      }
    }
  }
  return [...keys].sort(compare)
}
