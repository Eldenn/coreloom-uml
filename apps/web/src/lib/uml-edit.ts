import type {
  C4Diagram,
  C4Element,
  C4Level,
  ClassDiagram,
  ClassRelationKind,
  ErCardinality,
  ErDiagram,
  SequenceArrow,
  SequenceBlockKind,
  SequenceDiagram,
  SequenceStep,
  StateDiagram,
  StateKind,
  UmlLayout,
  UmlNote,
  UmlSpec,
} from '@/lib/uml'
import {
  addTo,
  deleteIn,
  type ElementTypeOfKinds,
  elementTypesOf,
  isElementDiagram,
  relateIn,
  type RelationTypeOfKinds,
  relationTypesOf,
} from '@/lib/uml-edit-elements'
import { insertBlock, insertNote, keepSteps, stepOf } from '@/lib/uml-edit-sequence'
import type { ElementDiagram } from '@/lib/uml-elements'

/** What a toolbar can add, depending on the diagram's kind (see `elementTypes`). */
type UmlElementType =
  | 'class'
  | 'interface'
  | 'abstract'
  | 'enumeration'
  | 'note'
  | 'state'
  | 'choice'
  | 'fork'
  | 'join'
  | 'entity'
  | 'participant'
  | 'actor'
  | 'person'
  | 'externalPerson'
  | 'system'
  | 'externalSystem'
  | 'container'
  | 'database'
  | 'queue'
  | 'component'
  | 'boundary'
  | SequenceBlockKind
  | ElementTypeOfKinds

/** The lines a toolbar can draw between two elements, depending on the kind (`relationTypes`). */
type UmlRelationType =
  | Exclude<ClassRelationKind, 'link' | 'dashedLink'>
  | 'transition'
  | 'oneToOne'
  | 'oneToMany'
  | 'manyToMany'
  | 'uses'
  | 'usesBoth'
  | 'sync'
  | 'reply'
  | 'async'
  | RelationTypeOfKinds

/** Which elements and relations are picked: element ids, and indexes in the relation list. */
interface UmlSelection {
  elements: readonly string[]
  relations: readonly number[]
}

/** In a state diagram, `[*]` as a transition's `from` is the start, as its `to` the end. */
const START_END = '[*]'

/** The drag-and-drop type a toolbar button sets to an element type, for a canvas to drop. */
const UML_DRAG_TYPE = 'application/x-coreloom-uml-element'

const BLOCKS: readonly SequenceBlockKind[] = ['loop', 'alt', 'opt', 'par', 'critical', 'break']

const C4_ELEMENTS: Record<C4Level, readonly UmlElementType[]> = {
  context: ['person', 'externalPerson', 'system', 'externalSystem', 'boundary'],
  container: [
    'person',
    'externalPerson',
    'system',
    'externalSystem',
    'container',
    'database',
    'queue',
    'boundary',
  ],
  component: [
    'person',
    'system',
    'externalSystem',
    'container',
    'database',
    'component',
    'boundary',
  ],
}

/** The elements a diagram of this kind can hold, in the order a toolbar lists them. */
function elementTypes(diagram: UmlSpec): readonly UmlElementType[] {
  if (isElementDiagram(diagram)) return elementTypesOf(diagram)
  switch (diagram.kind) {
    case 'class':
      return ['class', 'interface', 'abstract', 'enumeration', 'note']
    case 'state':
      return ['state', 'choice', 'fork', 'join', 'note']
    case 'er':
      return ['entity']
    case 'sequence':
      return ['participant', 'actor', 'note', ...BLOCKS]
    case 'c4':
      return C4_ELEMENTS[diagram.level]
  }
}

/** The relations a diagram of this kind can draw; the first is the usual one. */
function relationTypes(diagram: UmlSpec): readonly UmlRelationType[] {
  if (isElementDiagram(diagram)) return relationTypesOf(diagram)
  switch (diagram.kind) {
    case 'class':
      return [
        'association',
        'inheritance',
        'realization',
        'composition',
        'aggregation',
        'dependency',
      ]
    case 'state':
      return ['transition']
    case 'er':
      return ['oneToMany', 'oneToOne', 'manyToMany']
    case 'sequence':
      return ['sync', 'reply', 'async']
    case 'c4':
      return ['uses', 'usesBoth']
  }
}

/** A name as a Mermaid id: letters, digits and `_`, accents dropped, words joined. */
function toIdentifier(name: string, fallback = 'Element'): string {
  const plain = name.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const words = plain.split(/[^A-Za-z0-9_]+/).filter(Boolean)
  const id = words.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('')
  if (!id) return fallback
  return /^[A-Za-z_]/.test(id) ? id : `_${id}`
}

/** `base`, or `base2`, `base3`… whichever isn't taken. */
function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}${String(n)}`)) n++
  return `${base}${String(n)}`
}

/** Every id in use, frames included, so a new element never takes one. */
function takenIds(diagram: UmlSpec): Set<string> {
  if (isElementDiagram(diagram)) return new Set(diagram.elements.map((e) => e.id))
  switch (diagram.kind) {
    case 'class':
      return new Set([
        ...diagram.classes.map((c) => c.id),
        ...diagram.classes.flatMap((c) => (c.namespace ? [c.namespace] : [])),
      ])
    case 'state':
      return new Set([START_END, ...diagram.states.map((s) => s.id)])
    case 'er':
      return new Set(diagram.entities.map((e) => e.id))
    case 'sequence':
      return new Set(diagram.participants.map((p) => p.id))
    case 'c4':
      return new Set([
        ...diagram.elements.map((e) => e.id),
        ...(diagram.boundaries ?? []).map((b) => b.id),
      ])
  }
}

const NAMESPACE = 'namespace:'
const NOTE = /^note:(\d+)$/

/** The note index in a `note:3` id, or null. */
function noteIndex(id: string): number | null {
  const m = NOTE.exec(id)
  return m?.[1] === undefined ? null : Number(m[1])
}

// ── Adding ──────────────────────────────────────────────────────────────────────────────────────

interface AddElementInput {
  type: UmlElementType
  /** The name to show; the id is made from it. */
  name: string
  /**
   * The element selected when adding: the new one joins its namespace, composite state or
   * boundary (or goes inside it, when it's a frame). A note is pinned to it. In a sequence
   * diagram, a note or block goes after the selected step (a block goes round it).
   */
  near?: string
}

interface EditResult {
  diagram: UmlSpec
  /** The element added or renamed (its id may have changed). */
  id: string
}

const STEREOTYPE: Partial<Record<UmlElementType, string>> = {
  interface: 'interface',
  abstract: 'abstract',
  enumeration: 'enumeration',
}

function withNote(
  notes: readonly UmlNote[] | undefined,
  text: string,
  near: string | undefined,
  ids: ReadonlySet<string>,
): { notes: UmlNote[]; id: string } {
  const list = [...(notes ?? []), { text, ...(near && ids.has(near) ? { for: near } : {}) }]
  return { notes: list, id: `note:${String(list.length - 1)}` }
}

function addToClass(d: ClassDiagram, input: AddElementInput): EditResult {
  const ids = new Set(d.classes.map((c) => c.id))
  if (input.type === 'note') {
    const { notes, id } = withNote(d.notes, input.name, input.near, ids)
    return { diagram: { ...d, notes }, id }
  }
  const near = input.near ?? ''
  const namespace = near.startsWith(NAMESPACE)
    ? near.slice(NAMESPACE.length)
    : d.classes.find((c) => c.id === near)?.namespace
  const id = uniqueId(toIdentifier(input.name, 'Class'), takenIds(d))
  const stereotype = STEREOTYPE[input.type]
  const cls = { id, ...(stereotype ? { stereotype } : {}), ...(namespace ? { namespace } : {}) }
  return { diagram: { ...d, classes: [...d.classes, cls] }, id }
}

const STATE_KIND: Partial<Record<UmlElementType, StateKind>> = {
  choice: 'choice',
  fork: 'fork',
  join: 'join',
}

function addToState(d: StateDiagram, input: AddElementInput): EditResult {
  const ids = new Set(d.states.map((s) => s.id))
  if (input.type === 'note') {
    const { notes, id } = withNote(d.notes, input.name, input.near, ids)
    return { diagram: { ...d, notes }, id }
  }
  const near = d.states.find((s) => s.id === input.near)
  // Next to a simple state, inside a composite one.
  const composite = near && d.states.some((s) => s.parent === near.id)
  const parent = composite ? near.id : near?.parent
  const id = uniqueId(toIdentifier(input.name, 'State'), takenIds(d))
  const kind = STATE_KIND[input.type]
  const state = { id, ...(kind ? { kind } : {}), ...(parent ? { parent } : {}) }
  return { diagram: { ...d, states: [...d.states, state] }, id }
}

function addToEr(d: ErDiagram, input: AddElementInput): EditResult {
  const id = uniqueId(toIdentifier(input.name, 'Entity'), takenIds(d))
  const entity = { id, attributes: [{ type: 'string', name: 'id', keys: ['PK' as const] }] }
  return { diagram: { ...d, entities: [...d.entities, entity] }, id }
}

function isBlock(type: UmlElementType): type is SequenceBlockKind {
  return (BLOCKS as readonly string[]).includes(type)
}

/** Participants go at the end; a note or a block goes by the selected step (uml-edit-sequence). */
function addToSequence(d: SequenceDiagram, input: AddElementInput): EditResult {
  if (input.type === 'note') return insertNote(d, input.name, input.near)
  if (isBlock(input.type)) return insertBlock(d, input.type, input.near)
  const id = uniqueId(toIdentifier(input.name, 'Participant'), takenIds(d))
  const participant = { id, ...(input.type === 'actor' ? { kind: 'actor' as const } : {}) }
  return { diagram: { ...d, participants: [...d.participants, participant] }, id }
}

const C4_ELEMENT: Partial<Record<UmlElementType, Omit<C4Element, 'id' | 'label'>>> = {
  person: { kind: 'person' },
  externalPerson: { kind: 'person', external: true },
  system: { kind: 'system' },
  externalSystem: { kind: 'system', external: true },
  container: { kind: 'container' },
  database: { kind: 'container', shape: 'database' },
  queue: { kind: 'container', shape: 'queue' },
  component: { kind: 'component' },
}

function addToC4(d: C4Diagram, input: AddElementInput): EditResult {
  const boundaries = d.boundaries ?? []
  const nearBoundary = boundaries.some((b) => b.id === input.near)
    ? input.near
    : d.elements.find((e) => e.id === input.near)?.boundary
  const scope = nearBoundary ? { boundary: nearBoundary } : {}
  const id = uniqueId(
    toIdentifier(input.name, 'element').replace(/^[A-Z]/, (c) => c.toLowerCase()),
    takenIds(d),
  )
  const look = C4_ELEMENT[input.type]
  if (!look) {
    const boundary = { id, label: input.name, ...(nearBoundary ? { parent: nearBoundary } : {}) }
    return { diagram: { ...d, boundaries: [...boundaries, boundary] }, id }
  }
  const element: C4Element = { id, label: input.name, ...look, ...scope }
  return { diagram: { ...d, elements: [...d.elements, element] }, id }
}

function addToElements(d: ElementDiagram, input: AddElementInput): EditResult {
  if (input.type === 'note') {
    const { notes, id } = withNote(d.notes, input.name, input.near, takenIds(d))
    return { diagram: { ...d, notes }, id }
  }
  const name = input.name.trim()
  const id = uniqueId(toIdentifier(name), takenIds(d))
  const near = input.near ? { near: input.near } : {}
  const next = addTo(d, {
    type: input.type,
    id,
    ...(name && name !== id ? { label: name } : {}),
    ...near,
  })
  return next ? { diagram: next, id } : { diagram: d, id: '' }
}

/** Adds an element of `type` with a fresh id; gives the new diagram and that id. */
function addElement(diagram: UmlSpec, input: AddElementInput): EditResult {
  if (isElementDiagram(diagram)) return addToElements(diagram, input)
  switch (diagram.kind) {
    case 'class':
      return addToClass(diagram, input)
    case 'state':
      return addToState(diagram, input)
    case 'er':
      return addToEr(diagram, input)
    case 'sequence':
      return addToSequence(diagram, input)
    case 'c4':
      return addToC4(diagram, input)
  }
}

interface AddRelationInput {
  type: UmlRelationType
  /** For an inheritance, the child; a composition, the part; a message, the sender. */
  from: string
  /** The parent, the whole, the target. In a state diagram, `[*]` is the start or the end. */
  to: string
  label?: string
}

const ER_ENDS: Partial<Record<UmlRelationType, [ErCardinality, ErCardinality]>> = {
  oneToOne: ['exactlyOne', 'exactlyOne'],
  oneToMany: ['exactlyOne', 'zeroOrMore'],
  manyToMany: ['zeroOrMore', 'zeroOrMore'],
}

const ARROW: Partial<Record<UmlRelationType, SequenceArrow>> = {
  sync: 'sync',
  reply: 'reply',
  async: 'async',
}

const CLASS_KINDS = new Set<string>(relationTypes({ kind: 'class', classes: [], relations: [] }))

function isClassKind(
  type: UmlRelationType,
): type is Exclude<ClassRelationKind, 'link' | 'dashedLink'> {
  return CLASS_KINDS.has(type)
}

/** The ids a relation may join: elements, plus `[*]` in a state diagram. */
function endpoints(diagram: UmlSpec): Set<string> {
  const ids = new Set(
    diagram.kind === 'c4' ? diagram.elements.map((e) => e.id) : [...takenIds(diagram)],
  )
  // A use case's system and an activity's partitions are frames, not ends.
  if (isElementDiagram(diagram))
    for (const e of diagram.elements)
      if (e.kind === 'system' || e.kind === 'partition') ids.delete(e.id)
  if (diagram.kind === 'class')
    for (const c of diagram.classes) if (c.namespace) ids.delete(c.namespace)
  return ids
}

/** The diagram with one more relation; `input` was checked by `addRelation`. */
function withRelation(diagram: UmlSpec, input: AddRelationInput & { label: string }): UmlSpec {
  const { from, to, type, label } = input
  const labelled = label ? { label } : {}
  if (isElementDiagram(diagram)) return relateIn(diagram, { from, to, type, label })
  switch (diagram.kind) {
    case 'class': {
      const kind = isClassKind(type) ? type : 'association'
      return { ...diagram, relations: [...diagram.relations, { from, to, kind, ...labelled }] }
    }
    case 'state':
      return { ...diagram, transitions: [...diagram.transitions, { from, to, ...labelled }] }
    case 'er': {
      const [fromCardinality, toCardinality] = ER_ENDS[type] ?? ['exactlyOne', 'zeroOrMore']
      const relation = { from, to, fromCardinality, toCardinality, label }
      return { ...diagram, relations: [...diagram.relations, relation] }
    }
    case 'sequence': {
      const arrow = ARROW[type] ?? 'sync'
      const step: SequenceStep = { type: 'message', from, to, text: label, arrow }
      return { ...diagram, steps: [...diagram.steps, step] }
    }
    case 'c4': {
      const both = type === 'usesBoth' ? { bidirectional: true } : {}
      return { ...diagram, relations: [...diagram.relations, { from, to, ...labelled, ...both }] }
    }
  }
}

/** What a relation can join, with the name to show: `[*]` stands for a state diagram's start or end. */
function relationEnds(diagram: UmlSpec): { id: string; name: string }[] {
  const ends = endpoints(diagram)
  const named = (list: readonly { id: string; label?: string }[]) =>
    list.filter((x) => ends.has(x.id)).map((x) => ({ id: x.id, name: x.label ?? x.id }))
  if (isElementDiagram(diagram)) return named(diagram.elements)
  switch (diagram.kind) {
    case 'class':
      return named(diagram.classes)
    case 'state':
      return [{ id: START_END, name: START_END }, ...named(diagram.states)]
    case 'er':
      return named(diagram.entities)
    case 'sequence':
      return named(diagram.participants)
    case 'c4':
      return named(diagram.elements)
  }
}

/** Draws a relation between two elements; the diagram unchanged when either end is unknown. */
function addRelation(diagram: UmlSpec, input: AddRelationInput): UmlSpec {
  const ends = endpoints(diagram)
  const { from, to } = input
  if (!ends.has(from) || !ends.has(to)) return diagram
  if (diagram.kind === 'state' && from === START_END && to === START_END) return diagram
  return withRelation(diagram, { ...input, label: input.label?.trim() ?? '' })
}

// ── Deleting ────────────────────────────────────────────────────────────────────────────────────

function pruneLayout<T extends { layout?: UmlLayout }>(d: T, removed: ReadonlySet<string>): T {
  if (!d.layout) return d
  const layout = Object.fromEntries(Object.entries(d.layout).filter(([id]) => !removed.has(id)))
  const { layout: _old, ...rest } = d
  return (Object.keys(layout).length ? { ...rest, layout } : rest) as T
}

function pruneNotes(
  notes: readonly UmlNote[] | undefined,
  removed: ReadonlySet<string>,
): { notes?: UmlNote[] } {
  if (!notes) return {}
  const kept = notes.filter(
    (n, i) => !removed.has(`note:${String(i)}`) && !(n.for && removed.has(n.for)),
  )
  return kept.length ? { notes: kept } : {}
}

/** The nearest parent that stays, walking up through the ones being removed. */
function survivor(
  start: string | undefined,
  parentOf: (id: string) => string | undefined,
  removed: ReadonlySet<string>,
): string | undefined {
  let p = start
  for (let guard = 0; p && removed.has(p) && guard < 100; guard++) p = parentOf(p)
  return p
}

function deleteFromClass(d: ClassDiagram, removed: Set<string>, rel: Set<number>): ClassDiagram {
  const classes = d.classes
    .filter((c) => !removed.has(c.id))
    .map((c) => {
      if (!c.namespace || !removed.has(`${NAMESPACE}${c.namespace}`)) return c
      const { namespace: _ns, ...rest } = c
      return rest
    })
  const relations = d.relations.filter(
    (r, i) => !rel.has(i) && !removed.has(r.from) && !removed.has(r.to),
  )
  const { notes: _n, ...rest } = d
  return pruneLayout({ ...rest, classes, relations, ...pruneNotes(d.notes, removed) }, removed)
}

function deleteFromState(d: StateDiagram, removed: Set<string>, rel: Set<number>): StateDiagram {
  const parentOf = (id: string) => d.states.find((s) => s.id === id)?.parent
  const reparent = <T extends { parent?: string }>(x: T): T => {
    if (!x.parent || !removed.has(x.parent)) return x
    const { parent: _p, ...rest } = x
    const parent = survivor(x.parent, parentOf, removed)
    return (parent ? { ...rest, parent } : rest) as T
  }
  const states = d.states.filter((s) => !removed.has(s.id)).map(reparent)
  const transitions = d.transitions
    .filter((t, i) => !rel.has(i) && !removed.has(t.from) && !removed.has(t.to))
    .map(reparent)
  const { notes: _n, ...rest } = d
  return pruneLayout({ ...rest, states, transitions, ...pruneNotes(d.notes, removed) }, removed)
}

function deleteFromEr(d: ErDiagram, removed: Set<string>, rel: Set<number>): ErDiagram {
  const entities = d.entities.filter((e) => !removed.has(e.id))
  const relations = d.relations.filter(
    (r, i) => !rel.has(i) && !removed.has(r.from) && !removed.has(r.to),
  )
  return pruneLayout({ ...d, entities, relations }, removed)
}

function deleteFromC4(d: C4Diagram, removed: Set<string>, rel: Set<number>): C4Diagram {
  const boundaries = d.boundaries ?? []
  const parentOf = (id: string) => boundaries.find((b) => b.id === id)?.parent
  const elements = d.elements
    .filter((e) => !removed.has(e.id))
    .map((e) => {
      if (!e.boundary || !removed.has(e.boundary)) return e
      const { boundary: _b, ...rest } = e
      const boundary = survivor(e.boundary, parentOf, removed)
      return boundary ? { ...rest, boundary } : rest
    })
  const kept = boundaries
    .filter((b) => !removed.has(b.id))
    .map((b) => {
      if (!b.parent || !removed.has(b.parent)) return b
      const { parent: _p, ...rest } = b
      const parent = survivor(b.parent, parentOf, removed)
      return parent ? { ...rest, parent } : rest
    })
  const relations = d.relations.filter(
    (r, i) => !rel.has(i) && !removed.has(r.from) && !removed.has(r.to),
  )
  const { boundaries: _b, ...rest } = d
  return pruneLayout(
    { ...rest, elements, relations, ...(kept.length || d.boundaries ? { boundaries: kept } : {}) },
    removed,
  )
}

/**
 * Removes elements and relations, with the lines that touch a removed element. What a removed
 * frame (namespace, composite state, boundary) held moves up a level instead of going with it.
 * In a sequence diagram, steps are picked by id (`step:2`) and a removed block takes its steps.
 */
function deleteItems(diagram: UmlSpec, selection: UmlSelection): UmlSpec {
  const removed = new Set(selection.elements)
  const rel = new Set(selection.relations)
  if (isElementDiagram(diagram)) return deleteIn(diagram, removed, rel)
  switch (diagram.kind) {
    case 'class':
      return deleteFromClass(diagram, removed, rel)
    case 'state':
      return deleteFromState(diagram, removed, rel)
    case 'er':
      return deleteFromEr(diagram, removed, rel)
    case 'c4':
      return deleteFromC4(diagram, removed, rel)
    case 'sequence': {
      const participants = diagram.participants.filter((p) => !removed.has(p.id))
      return { ...diagram, participants, steps: keepSteps(diagram.steps, removed) }
    }
  }
}

/** True when the selection holds something `deleteItems` would remove. */
function canDelete(diagram: UmlSpec, selection: UmlSelection): boolean {
  if (selection.relations.length && diagram.kind !== 'sequence') return true
  if (diagram.kind === 'sequence' && selection.elements.some((id) => stepOf(diagram, id)))
    return true
  const ids = takenIds(diagram)
  return selection.elements.some(
    (id) => ids.has(id) || id.startsWith(NAMESPACE) || noteIndex(id) !== null,
  )
}

export {
  addElement,
  type AddElementInput,
  addRelation,
  type AddRelationInput,
  canDelete,
  deleteItems,
  type EditResult,
  elementTypes,
  NAMESPACE,
  noteIndex,
  relationEnds,
  relationTypes,
  START_END,
  takenIds,
  toIdentifier,
  UML_DRAG_TYPE,
  type UmlElementType,
  type UmlRelationType,
  type UmlSelection,
  uniqueId,
}
