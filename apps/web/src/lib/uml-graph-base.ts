import type {
  C4ElementKind,
  ClassRelationKind,
  ErCardinality,
  UmlDirection,
  UmlNote,
} from '@/lib/uml'

type DiagramShape =
  | 'box'
  | 'rounded'
  | 'person'
  | 'start'
  | 'end'
  | 'choice'
  | 'bar'
  | 'note'
  | 'frame'
  | 'actor'
  | 'ellipse'
  | 'decision'
  | 'flowEnd'
  | 'node3d'
  | 'lollipop'
  | 'port'
  | 'folder'

/** The look of a box: plain, the system in focus (C4), or something outside it. */
type DiagramTone = 'default' | 'primary' | 'external'

type DiagramMarker =
  | 'triangle'
  | 'diamond'
  | 'diamondFilled'
  | 'arrow'
  | 'arrowFilled'
  | 'one'
  | 'zeroOrOne'
  | 'oneOrMore'
  | 'zeroOrMore'
  | 'socket'
  | 'assembly'

/** A line in a compartment: `+ name: String`, or `PK id string`. */
interface DiagramRow {
  text: string
  /** A narrow column before the text: visibility sign, PK/FK. */
  prefix?: string
  /** Muted, after the text: an ER attribute's type. */
  suffix?: string
  underline?: boolean
  italic?: boolean
}

/** What the box stands for, which the UI names in the reader's language. */
type DiagramRole =
  | 'class'
  | 'note'
  | 'namespace'
  | 'state'
  | 'composite'
  | 'start'
  | 'end'
  | 'choice'
  | 'fork'
  | 'join'
  | 'entity'
  | C4ElementKind
  | 'boundary'
  | 'actor'
  | 'usecase'
  | 'subject'
  | 'action'
  | 'decision'
  | 'merge'
  | 'flowEnd'
  | 'partition'
  | 'node'
  | 'device'
  | 'environment'
  | 'artifact'
  | 'database'
  | 'cloud'
  | 'interface'
  | 'port'
  | 'package'

interface DiagramNode {
  id: string
  parent?: string
  /** Drawn on its frame's edge rather than inside it: a component's port. */
  border?: boolean
  /** The concurrent region of its frame it sits in (a composite state's), when not the first. */
  region?: number
  shape: DiagramShape
  role: DiagramRole
  title: string
  /** Shown above the title in guillemets: «interface». */
  stereotype?: string
  /** C4: the technology, after the kind: [Container: React]. */
  technology?: string
  /** C4: drawn as a database or a queue. */
  variant?: 'database' | 'queue' | 'artifact' | 'component' | 'cloud'
  italicTitle?: boolean
  body?: string
  compartments?: DiagramRow[][]
  tone?: DiagramTone
  width: number
  height: number
}

/** What a line means, for the words a screen reader hears. */
type DiagramRelation =
  | ClassRelationKind
  | 'note'
  | 'transition'
  | 'er'
  | 'c4'
  | 'include'
  | 'extend'
  | 'generalization'
  | 'flow'
  | 'deploy'
  | 'provide'
  | 'require'
  | 'assembly'
  | 'delegate'
  | 'import'
  | 'merge'

interface DiagramEdge {
  id: string
  source: string
  target: string
  /** The ends as the model has them (`from` → `to`), whichever way the line was laid out. */
  from: string
  to: string
  relation: DiagramRelation
  dashed?: boolean
  sourceMarker?: DiagramMarker
  targetMarker?: DiagramMarker
  label?: string
  /** Multiplicities or cardinalities by each end. */
  sourceLabel?: string
  targetLabel?: string
  /** ER: the cardinalities in words, at `from` and at `to`. */
  cardinality?: [ErCardinality, ErCardinality]
  /** C4: the technology, in brackets under the label. */
  technology?: string
}

interface DiagramGraph {
  direction: UmlDirection
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

// Sizes, matching the canvas's type scale (13px titles, 12px mono rows).
const CHAR = 7.4
const MONO = 7.25
const ROW = 20
const PAD_X = 28
const MIN_W = 120
const MAX_W = 300
const HEAD = 40
const EYEBROW = 16
const COMPARTMENT_PAD = 10
const BODY_LINE = 17

const textWidth = (text: string, char = CHAR) =>
  Math.max(0, ...text.split('\n').map((l) => l.length)) * char

/** How many lines `text` takes at `width`, wrapping at about the same place the browser does. */
function wrappedLines(text: string, width: number): number {
  const perLine = Math.max(8, Math.floor((width - PAD_X) / 6.6))
  return text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / perLine)), 0)
}

const C4_ROLES: ReadonlySet<DiagramRole> = new Set(['person', 'system', 'container', 'component'])

/** The longest line above a title: «stereotype», or a C4 kind with its technology. */
function eyebrowLength(node: Omit<DiagramNode, 'width' | 'height'>): number {
  if (node.stereotype) return node.stereotype.length + 2
  // "[Software System · External]", "[Container: PostgreSQL]".
  if (C4_ROLES.has(node.role))
    return 18 + (node.technology?.length ?? 0) + (node.tone === 'external' ? 11 : 0)
  return 0
}

function sizeBox(node: Omit<DiagramNode, 'width' | 'height'>, minWidth = MIN_W) {
  const rows = (node.compartments ?? []).flat()
  // Keys (PK, FK) get one column wide enough for all of them.
  const prefixed = rows.some((r) => r.prefix)
  let keyColumn = prefixed ? MONO + 8 : 0
  if (prefixed && node.role === 'entity') keyColumn = 3.2 * 12 + 8
  const rowWidth = (r: DiagramRow) =>
    keyColumn + textWidth(r.text, MONO) + (r.suffix ? r.suffix.length * MONO + 8 : 0)
  const eyebrow = eyebrowLength(node)
  const width = Math.min(
    MAX_W,
    Math.max(
      minWidth,
      textWidth(node.title) + PAD_X,
      eyebrow ? eyebrow * 6.5 + PAD_X + (node.variant ? 16 : 0) : 0,
      ...rows.map((r) => rowWidth(r) + PAD_X + 4),
    ),
  )
  let height = HEAD + (eyebrow ? EYEBROW : 0)
  for (const c of node.compartments ?? []) height += Math.max(1, c.length) * ROW + COMPARTMENT_PAD
  if (node.body) height += wrappedLines(node.body, width) * BODY_LINE + 8
  if (node.shape === 'person') height += 22
  return { ...node, width: Math.ceil(width), height: Math.ceil(height) }
}

function noteNodes(
  notes: readonly UmlNote[] | undefined,
  parentOf: (id: string) => string | undefined,
) {
  const nodes: DiagramNode[] = []
  const edges: DiagramEdge[] = []
  ;(notes ?? []).forEach((note, i) => {
    const id = `note:${String(i)}`
    const parent = note.for ? parentOf(note.for) : undefined
    const width = Math.min(240, Math.max(140, textWidth(note.text, 6.6) + PAD_X))
    nodes.push({
      id,
      shape: 'note',
      role: 'note',
      title: '',
      body: note.text,
      ...(parent ? { parent } : {}),
      width,
      height: wrappedLines(note.text, width) * BODY_LINE + 24,
    })
    if (note.for)
      edges.push({
        id: `${id}->${note.for}`,
        source: id,
        target: note.for,
        from: id,
        to: note.for,
        relation: 'note',
        dashed: true,
      })
  })
  return { nodes, edges }
}

export {
  type DiagramEdge,
  type DiagramGraph,
  type DiagramMarker,
  type DiagramNode,
  type DiagramRelation,
  type DiagramRole,
  type DiagramRow,
  type DiagramShape,
  type DiagramTone,
  noteNodes,
  sizeBox,
  textWidth,
  wrappedLines,
}
