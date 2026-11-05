import type {
  C4Diagram,
  ClassDiagram,
  ClassMember,
  ErAttribute,
  ErCardinality,
  ErDiagram,
  SequenceDiagram,
  SequenceStep,
  StateDiagram,
  UmlLayout,
  UmlNote,
  UmlSpec,
} from '@/lib/uml'
import {
  type EditResult,
  NAMESPACE,
  noteIndex,
  relationTypes,
  takenIds,
  toIdentifier,
  type UmlRelationType,
} from '@/lib/uml-edit'
import {
  fieldsIn,
  isElementDiagram,
  relationFieldsIn,
  renameIdIn,
  reverseIn,
  setElementField,
  setRelationIn,
} from '@/lib/uml-edit-elements'
import type { ElementDiagram } from '@/lib/uml-elements'
import { parseMember } from '@/lib/uml-mermaid-class'
import { erAttributeText, parseErAttribute } from '@/lib/uml-mermaid-er'

/** The fields an element has; a field that's absent doesn't apply to it. */
interface UmlElementFields {
  name: string
  /** Classes: `interface`, `abstract`…, empty for none. */
  stereotype?: string
  /** Classes: attributes and methods in order; a member with `(` in its text is a method. */
  members?: ClassMember[]
  /** Entities: attributes, one per line (`string email UK "comment"`). */
  attributes?: string
  /** States and C4 elements. */
  description?: string
  /** C4 containers and components. */
  technology?: string
  /** C4 people and systems: outside what the diagram is about. */
  external?: boolean
  /** Sequence participants: drawn as a person. */
  actor?: boolean
}

/** The fields of a relation; a field that's absent doesn't apply to it. */
interface UmlRelationFields {
  /** The kind of line, when the diagram has several (class, C4). */
  type?: UmlRelationType
  label: string
  /** Class multiplicities, as written: `1`, `0..1`, `*`, `1..*`. */
  fromCardinality?: string
  toCardinality?: string
  /** Entity–relationship ends. */
  fromEnd?: ErCardinality
  toEnd?: ErCardinality
  /** C4: `HTTPS`, `SQL`. */
  technology?: string
}

// ── Renaming ────────────────────────────────────────────────────────────────────────────────────

const swap = (id: string, from: string, to: string) => (id === from ? to : id)

function renameLayout(layout: UmlLayout | undefined, from: string, to: string) {
  if (!layout) return {}
  return {
    layout: Object.fromEntries(Object.entries(layout).map(([k, v]) => [swap(k, from, to), v])),
  }
}

function renameNotes(notes: readonly UmlNote[] | undefined, from: string, to: string) {
  if (!notes) return {}
  return { notes: notes.map((n) => (n.for === from ? { ...n, for: to } : n)) }
}

function renameClass(d: ClassDiagram, from: string, to: string): ClassDiagram {
  if (from.startsWith(NAMESPACE)) {
    const ns = from.slice(NAMESPACE.length)
    const classes = d.classes.map((c) => (c.namespace === ns ? { ...c, namespace: to } : c))
    return { ...d, classes }
  }
  return {
    ...d,
    classes: d.classes.map((c) => (c.id === from ? { ...c, id: to } : c)),
    relations: d.relations.map((r) => ({
      ...r,
      from: swap(r.from, from, to),
      to: swap(r.to, from, to),
    })),
    ...renameNotes(d.notes, from, to),
    ...renameLayout(d.layout, from, to),
  }
}

function renameState(d: StateDiagram, from: string, to: string): StateDiagram {
  const parent = <T extends { parent?: string }>(x: T): T =>
    x.parent === from ? { ...x, parent: to } : x
  return {
    ...d,
    states: d.states.map((s) => parent(s.id === from ? { ...s, id: to } : s)),
    transitions: d.transitions.map((t) =>
      parent({ ...t, from: swap(t.from, from, to), to: swap(t.to, from, to) }),
    ),
    ...renameNotes(d.notes, from, to),
    ...renameLayout(d.layout, from, to),
  }
}

function renameEr(d: ErDiagram, from: string, to: string): ErDiagram {
  return {
    ...d,
    entities: d.entities.map((e) => (e.id === from ? { ...e, id: to } : e)),
    relations: d.relations.map((r) => ({
      ...r,
      from: swap(r.from, from, to),
      to: swap(r.to, from, to),
    })),
    ...renameLayout(d.layout, from, to),
  }
}

function renameSteps(steps: readonly SequenceStep[], from: string, to: string): SequenceStep[] {
  return steps.map((s): SequenceStep => {
    switch (s.type) {
      case 'message':
        return { ...s, from: swap(s.from, from, to), to: swap(s.to, from, to) }
      case 'activation':
        return { ...s, participant: swap(s.participant, from, to) }
      case 'note':
        return { ...s, participants: s.participants.map((p) => swap(p, from, to)) }
      case 'block':
        return {
          ...s,
          sections: s.sections.map((x) => ({ ...x, steps: renameSteps(x.steps, from, to) })),
        }
    }
  })
}

function renameSequence(d: SequenceDiagram, from: string, to: string): SequenceDiagram {
  return {
    ...d,
    participants: d.participants.map((p) => (p.id === from ? { ...p, id: to } : p)),
    steps: renameSteps(d.steps, from, to),
  }
}

/** Gives the element a new id and updates everything that points to it. */
function renameId(
  d: Exclude<UmlSpec, C4Diagram | ElementDiagram>,
  from: string,
  to: string,
): UmlSpec {
  switch (d.kind) {
    case 'class':
      return renameClass(d, from, to)
    case 'state':
      return renameState(d, from, to)
    case 'er':
      return renameEr(d, from, to)
    case 'sequence':
      return renameSequence(d, from, to)
  }
}

interface Labelled {
  id: string
  label?: string
}

/** The element's own record, for the kinds whose elements are named by their id or a label. */
function labelled(
  d: Exclude<UmlSpec, C4Diagram | ElementDiagram>,
  id: string,
): Labelled | undefined {
  switch (d.kind) {
    case 'class':
      return d.classes.find((c) => c.id === id)
    case 'state':
      return d.states.find((s) => s.id === id)
    case 'er':
      return d.entities.find((e) => e.id === id)
    case 'sequence':
      return d.participants.find((p) => p.id === id)
  }
}

function setLabel(
  d: Exclude<UmlSpec, C4Diagram | ElementDiagram>,
  id: string,
  label: string | null,
): UmlSpec {
  const apply = <T extends Labelled>(x: T): T => {
    if (x.id !== id) return x
    const { label: _old, ...rest } = x
    return (label ? { ...rest, label } : rest) as T
  }
  switch (d.kind) {
    case 'class':
      return { ...d, classes: d.classes.map(apply) }
    case 'state':
      return { ...d, states: d.states.map(apply) }
    case 'er':
      return { ...d, entities: d.entities.map(apply) }
    case 'sequence':
      return { ...d, participants: d.participants.map(apply) }
  }
}

function renameC4(d: C4Diagram, id: string, name: string): C4Diagram {
  return {
    ...d,
    elements: d.elements.map((e) => (e.id === id ? { ...e, label: name } : e)),
    ...(d.boundaries
      ? { boundaries: d.boundaries.map((b) => (b.id === id ? { ...b, label: name } : b)) }
      : {}),
  }
}

type WithNotes = ClassDiagram | StateDiagram | ElementDiagram

function renameNote(d: WithNotes, index: number, text: string): UmlSpec {
  const notes = (d.notes ?? []).map((n, i) => (i === index ? { ...n, text } : n))
  return { ...d, notes }
}

/**
 * Renames an element. When the name can be an id (letters, digits, `_`) and isn't taken, the id
 * changes everywhere it's used, so the Mermaid stays readable; otherwise the id stays and the name
 * becomes its label. C4 elements keep their alias and change their label.
 */
function renameElement(diagram: UmlSpec, id: string, name: string): EditResult {
  const next = name.trim()
  if (!next) return { diagram, id }
  if (diagram.kind === 'c4') return { diagram: renameC4(diagram, id, next), id }
  const note = noteIndex(id)
  if (note !== null && (diagram.kind === 'class' || diagram.kind === 'state'))
    return { diagram: renameNote(diagram, note, next), id }
  if (isElementDiagram(diagram)) return renameIn(diagram, id, next, note)
  if (id.startsWith(NAMESPACE)) {
    const ns = toIdentifier(next, 'Namespace')
    return { diagram: renameId(diagram, id, ns), id: `${NAMESPACE}${ns}` }
  }
  const own = labelled(diagram, id)
  if (!own) return { diagram, id }
  if (next === id) return { diagram: setLabel(diagram, id, null), id }
  const free = toIdentifier(next) === next && !takenIds(diagram).has(next)
  if (!free) return { diagram: setLabel(diagram, id, next), id }
  const renamed = renameId(diagram, id, next)
  if (renamed.kind === 'c4' || isElementDiagram(renamed)) return { diagram: renamed, id: next }
  return { diagram: setLabel(renamed, next, null), id: next }
}

/** The same rule for use case, activity and deployment elements, which all have a label. */
function renameIn(d: ElementDiagram, id: string, name: string, note: number | null): EditResult {
  if (note !== null) return { diagram: renameNote(d, note, name), id }
  if (!d.elements.some((e) => e.id === id)) return { diagram: d, id }
  if (name === id) return { diagram: setElementField(d, id, 'label', null), id }
  const free = toIdentifier(name) === name && !takenIds(d).has(name)
  if (!free) return { diagram: setElementField(d, id, 'label', name), id }
  return { diagram: setElementField(renameIdIn(d, id, name), name, 'label', null), id: name }
}

// ── Element fields ──────────────────────────────────────────────────────────────────────────────

const isMethod = (m: ClassMember) => m.text.includes('(')
const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

function classFields(d: ClassDiagram, id: string): UmlElementFields | null {
  if (id.startsWith(NAMESPACE)) return { name: id.slice(NAMESPACE.length) }
  const c = d.classes.find((x) => x.id === id)
  if (!c) return null
  const members = [...(c.attributes ?? []), ...(c.methods ?? [])]
  return { name: c.label ?? c.id, stereotype: c.stereotype ?? '', members }
}

function noteFields(d: WithNotes, id: string): UmlElementFields | null {
  const index = noteIndex(id)
  const note = index === null ? undefined : d.notes?.[index]
  return note ? { name: note.text } : null
}

function c4Fields(d: C4Diagram, id: string): UmlElementFields | null {
  const b = d.boundaries?.find((x) => x.id === id)
  if (b) return { name: b.label }
  const e = d.elements.find((x) => x.id === id)
  if (!e) return null
  const fields: UmlElementFields = { name: e.label, description: e.description ?? '' }
  if (e.kind === 'container' || e.kind === 'component') fields.technology = e.technology ?? ''
  else fields.external = Boolean(e.external)
  return fields
}

function stateFields(d: StateDiagram, id: string): UmlElementFields | null {
  if (noteIndex(id) !== null) return noteFields(d, id)
  const s = d.states.find((x) => x.id === id)
  if (!s) return null
  const name = s.label ?? s.id
  return (s.kind ?? 'state') === 'state' ? { name, description: s.description ?? '' } : { name }
}

function erFields(d: ErDiagram, id: string): UmlElementFields | null {
  const e = d.entities.find((x) => x.id === id)
  if (!e) return null
  return { name: e.label ?? e.id, attributes: (e.attributes ?? []).map(erAttributeText).join('\n') }
}

/** What a properties panel shows for an element; null when the id isn't one. */
function elementFields(diagram: UmlSpec, id: string): UmlElementFields | null {
  if (isElementDiagram(diagram))
    return noteIndex(id) === null ? fieldsIn(diagram, id) : noteFields(diagram, id)
  switch (diagram.kind) {
    case 'class':
      return noteIndex(id) === null ? classFields(diagram, id) : noteFields(diagram, id)
    case 'state':
      return stateFields(diagram, id)
    case 'er':
      return erFields(diagram, id)
    case 'sequence': {
      const p = diagram.participants.find((x) => x.id === id)
      return p ? { name: p.label ?? p.id, actor: p.kind === 'actor' } : null
    }
    case 'c4':
      return c4Fields(diagram, id)
  }
}

/** An attribute line, read loosely: what the parser can't read becomes `type name`. */
function attributeOf(line: string): ErAttribute {
  const strict = parseErAttribute(line)
  if (strict) return strict
  const [type = 'string', ...rest] = line.split(/\s+/)
  return { type, name: rest.join('_') || 'value' }
}

const optional = <K extends string>(key: K, value: string | undefined) =>
  (value?.trim() ? { [key]: value.trim() } : {}) as Partial<Record<K, string>>

function applyFields(d: UmlSpec, id: string, f: UmlElementFields): UmlSpec {
  if (isElementDiagram(d)) {
    if (d.kind !== 'deployment' || f.stereotype === undefined) return d
    return setElementField(d, id, 'stereotype', f.stereotype.trim() || null)
  }
  switch (d.kind) {
    case 'class': {
      const members = f.members?.filter((m) => m.text.trim())
      const classes = d.classes.map((c) => {
        if (c.id !== id) return c
        const { stereotype: _s, attributes: _a, methods: _m, ...rest } = c
        const kept = members ?? [...(c.attributes ?? []), ...(c.methods ?? [])]
        const attributes = kept.filter((m) => !isMethod(m))
        const methods = kept.filter(isMethod)
        return {
          ...rest,
          ...optional('stereotype', f.stereotype ?? c.stereotype),
          ...(attributes.length ? { attributes } : {}),
          ...(methods.length ? { methods } : {}),
        }
      })
      return { ...d, classes }
    }
    case 'state': {
      const states = d.states.map((s) => {
        if (s.id !== id || f.description === undefined) return s
        const { description: _d, ...rest } = s
        return { ...rest, ...optional('description', f.description) }
      })
      return { ...d, states }
    }
    case 'er': {
      if (f.attributes === undefined) return d
      const attributes = lines(f.attributes).map(attributeOf)
      const entities = d.entities.map((e) => {
        if (e.id !== id) return e
        const { attributes: _a, ...rest } = e
        return attributes.length ? { ...rest, attributes } : rest
      })
      return { ...d, entities }
    }
    case 'c4': {
      const elements = d.elements.map((e) => {
        if (e.id !== id) return e
        const { description: _d, technology: _t, external: _x, ...rest } = e
        const external = f.external ?? e.external
        return {
          ...rest,
          ...optional('description', f.description ?? e.description),
          ...optional('technology', f.technology ?? e.technology),
          ...(external ? { external: true } : {}),
        }
      })
      return { ...d, elements }
    }
    case 'sequence': {
      if (f.actor === undefined) return d
      const participants = d.participants.map((p) => {
        if (p.id !== id) return p
        const { kind: _k, ...rest } = p
        return f.actor ? { ...rest, kind: 'actor' as const } : rest
      })
      return { ...d, participants }
    }
  }
}

/**
 * A member as typed in one field: a leading `+ - # ~` sets the visibility and a trailing `$` or
 * `*` makes it static or abstract, as in Mermaid; otherwise `current`'s flags stay.
 */
function memberFromText(text: string, current: ClassMember): ClassMember {
  const read = parseMember(text)
  const visibility = read.visibility ?? current.visibility
  return { ...current, ...read, ...(visibility ? { visibility } : {}) }
}

/** Changes an element's fields (its name last, since renaming may change its id). */
function setElementFields(diagram: UmlSpec, id: string, fields: UmlElementFields): EditResult {
  const changed = applyFields(diagram, id, fields)
  return renameElement(changed, id, fields.name)
}

// ── Relation fields ─────────────────────────────────────────────────────────────────────────────

/** The item at `index`, or undefined past either end. */
function itemAt<T>(list: readonly T[], index: number): T | undefined {
  return index >= 0 && index < list.length ? list[index] : undefined
}

function classRelationFields(d: ClassDiagram, index: number): UmlRelationFields | null {
  const r = itemAt(d.relations, index)
  if (!r) return null
  return {
    type: r.kind === 'link' || r.kind === 'dashedLink' ? 'association' : r.kind,
    label: r.label ?? '',
    fromCardinality: r.fromCardinality ?? '',
    toCardinality: r.toCardinality ?? '',
  }
}

function c4RelationFields(d: C4Diagram, index: number): UmlRelationFields | null {
  const r = itemAt(d.relations, index)
  if (!r) return null
  const type = r.bidirectional ? 'usesBoth' : 'uses'
  return { type, label: r.label ?? '', technology: r.technology ?? '' }
}

/** What a properties panel shows for the relation at `index`; null when there's none. */
function relationFields(diagram: UmlSpec, index: number): UmlRelationFields | null {
  if (isElementDiagram(diagram)) return relationFieldsIn(diagram, index)
  switch (diagram.kind) {
    case 'class':
      return classRelationFields(diagram, index)
    case 'state': {
      const t = itemAt(diagram.transitions, index)
      return t ? { label: t.label ?? '' } : null
    }
    case 'er': {
      const r = itemAt(diagram.relations, index)
      return r ? { label: r.label, fromEnd: r.fromCardinality, toEnd: r.toCardinality } : null
    }
    case 'c4':
      return c4RelationFields(diagram, index)
    case 'sequence':
      return null
  }
}

function at<T>(list: readonly T[], index: number, change: (item: T) => T): T[] {
  return list.map((item, i) => (i === index ? change(item) : item))
}

const CLASS_TYPES = new Set<string>(relationTypes({ kind: 'class', classes: [], relations: [] }))

/** Changes the relation at `index`. */
function setRelationFields(diagram: UmlSpec, index: number, f: UmlRelationFields): UmlSpec {
  if (isElementDiagram(diagram))
    return setRelationIn(diagram, index, { label: f.label, ...(f.type ? { type: f.type } : {}) })
  switch (diagram.kind) {
    case 'class':
      return {
        ...diagram,
        relations: at(diagram.relations, index, (r) => {
          const { label: _l, fromCardinality: _f, toCardinality: _t, ...rest } = r
          const kind = f.type && CLASS_TYPES.has(f.type) ? (f.type as typeof r.kind) : r.kind
          return {
            ...rest,
            kind,
            ...optional('label', f.label),
            ...optional('fromCardinality', f.fromCardinality),
            ...optional('toCardinality', f.toCardinality),
          }
        }),
      }
    case 'state':
      return {
        ...diagram,
        transitions: at(diagram.transitions, index, (t) => {
          const { label: _l, ...rest } = t
          return { ...rest, ...optional('label', f.label) }
        }),
      }
    case 'er':
      return {
        ...diagram,
        relations: at(diagram.relations, index, (r) => ({
          ...r,
          label: f.label.trim(),
          fromCardinality: f.fromEnd ?? r.fromCardinality,
          toCardinality: f.toEnd ?? r.toCardinality,
        })),
      }
    case 'c4':
      return {
        ...diagram,
        relations: at(diagram.relations, index, (r) => {
          const { label: _l, technology: _t, bidirectional: _b, ...rest } = r
          const both = f.type ? f.type === 'usesBoth' : r.bidirectional
          return {
            ...rest,
            ...optional('label', f.label),
            ...optional('technology', f.technology),
            ...(both ? { bidirectional: true } : {}),
          }
        }),
      }
    case 'sequence':
      return diagram
  }
}

/** Turns the relation at `index` round: `from` becomes `to`, and their ends swap too. */
function reverseRelation(diagram: UmlSpec, index: number): UmlSpec {
  if (isElementDiagram(diagram)) return reverseIn(diagram, index)
  switch (diagram.kind) {
    case 'class':
      return {
        ...diagram,
        relations: at(diagram.relations, index, (r) => {
          const { fromCardinality, toCardinality, ...rest } = r
          return {
            ...rest,
            from: r.to,
            to: r.from,
            ...(toCardinality ? { fromCardinality: toCardinality } : {}),
            ...(fromCardinality ? { toCardinality: fromCardinality } : {}),
          }
        }),
      }
    case 'state':
      return {
        ...diagram,
        transitions: at(diagram.transitions, index, (t) =>
          // `[*]` is a start as `from` and an end as `to`, so it can't simply swap sides.
          t.from === '[*]' || t.to === '[*]' ? t : { ...t, from: t.to, to: t.from },
        ),
      }
    case 'er':
      return {
        ...diagram,
        relations: at(diagram.relations, index, (r) => ({
          ...r,
          from: r.to,
          to: r.from,
          fromCardinality: r.toCardinality,
          toCardinality: r.fromCardinality,
        })),
      }
    case 'c4':
      return {
        ...diagram,
        relations: at(diagram.relations, index, (r) => ({ ...r, from: r.to, to: r.from })),
      }
    case 'sequence':
      return diagram
  }
}

export {
  elementFields,
  memberFromText,
  relationFields,
  renameElement,
  reverseRelation,
  setElementFields,
  setRelationFields,
  type UmlElementFields,
  type UmlRelationFields,
}
