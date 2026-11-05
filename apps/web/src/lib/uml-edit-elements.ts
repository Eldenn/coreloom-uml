import type { UmlLayout, UmlNote, UmlPoint, UmlSpec } from '@/lib/uml'
import {
  type ActivityNodeKind,
  type DeploymentNodeKind,
  type DeploymentRelationKind,
  type ElementDiagram,
  isContainer,
  type UseCaseElementKind,
  type UseCaseRelationKind,
} from '@/lib/uml-elements'

/** The parts every element and relation of these kinds has. */
interface BaseElement {
  id: string
  kind: string
  label?: string
  parent?: string
  stereotype?: string
}
interface BaseRelation {
  from: string
  to: string
  kind?: string
  label?: string
}

/** A change to the element and relation lists that works for any of the three kinds. */
type PartsChange = <E extends BaseElement, R extends BaseRelation>(
  elements: readonly E[],
  relations: readonly R[],
) => { elements: E[]; relations: R[] }

function isElementDiagram(diagram: UmlSpec): diagram is ElementDiagram {
  return diagram.kind === 'usecase' || diagram.kind === 'activity' || diagram.kind === 'deployment'
}

/** A diagram's notes and positions, as they should end up: an absent key means none. */
interface Extras {
  notes?: UmlNote[]
  layout?: UmlLayout
}

function extrasOf(notes: readonly UmlNote[], layout: [string, UmlPoint][]): Extras {
  return {
    ...(notes.length ? { notes: [...notes] } : {}),
    ...(layout.length ? { layout: Object.fromEntries(layout) } : {}),
  }
}

const same: PartsChange = (elements, relations) => ({
  elements: [...elements],
  relations: [...relations],
})

/**
 * The diagram with its lists changed by `change`, whichever kind it is; with `extras`, its notes
 * and positions replaced by those.
 */
function withParts(d: ElementDiagram, change: PartsChange, extras?: Extras): ElementDiagram {
  const tail = (x: Extras) =>
    extras ?? { ...(x.notes ? { notes: x.notes } : {}), ...(x.layout ? { layout: x.layout } : {}) }
  switch (d.kind) {
    case 'usecase': {
      const { notes: _n, layout: _l, ...rest } = d
      return { ...rest, ...change(d.elements, d.relations), ...tail(d) }
    }
    case 'activity': {
      const { notes: _n, layout: _l, ...rest } = d
      return { ...rest, ...change(d.elements, d.relations), ...tail(d) }
    }
    case 'deployment': {
      const { notes: _n, layout: _l, ...rest } = d
      return { ...rest, ...change(d.elements, d.relations), ...tail(d) }
    }
  }
}

// ── Kinds the tools offer ───────────────────────────────────────────────────────────────────────

/** Toolbar element types to element kinds, per diagram. `subject` is a use case's system. */
const USE_CASE_TYPES = {
  actor: 'actor',
  usecase: 'usecase',
  subject: 'system',
} as const satisfies Record<string, UseCaseElementKind>
const ACTIVITY_TYPES = {
  action: 'action',
  decision: 'decision',
  merge: 'merge',
  start: 'start',
  end: 'end',
  flowEnd: 'flowEnd',
  fork: 'fork',
  join: 'join',
  partition: 'partition',
} as const satisfies Record<string, ActivityNodeKind>
const DEPLOYMENT_TYPES = {
  node: 'node',
  device: 'device',
  environment: 'environment',
  artifact: 'artifact',
  component: 'component',
  database: 'database',
  cloud: 'cloud',
} as const satisfies Record<string, DeploymentNodeKind>

type ElementTypeOfKinds =
  keyof typeof USE_CASE_TYPES | keyof typeof ACTIVITY_TYPES | keyof typeof DEPLOYMENT_TYPES

/** The relations the tools draw, per diagram; the first is the usual one. */
const USE_CASE_LINES = ['association', 'include', 'extend', 'generalization'] as const
const DEPLOYMENT_LINES = ['link', 'dependency', 'deploy'] as const
type RelationTypeOfKinds =
  (typeof USE_CASE_LINES)[number] | (typeof DEPLOYMENT_LINES)[number] | 'flow'

function elementTypesOf(d: ElementDiagram): readonly (ElementTypeOfKinds | 'note')[] {
  const types = {
    usecase: Object.keys(USE_CASE_TYPES),
    activity: Object.keys(ACTIVITY_TYPES),
    deployment: Object.keys(DEPLOYMENT_TYPES),
  }[d.kind] as ElementTypeOfKinds[]
  return [...types, 'note']
}

function relationTypesOf(d: ElementDiagram): readonly RelationTypeOfKinds[] {
  switch (d.kind) {
    case 'usecase':
      return USE_CASE_LINES
    case 'activity':
      return ['flow']
    case 'deployment':
      return DEPLOYMENT_LINES
  }
}

// ── Adding ──────────────────────────────────────────────────────────────────────────────────────

/** Where a new element goes: inside the selected frame, or beside the selected element. */
function parentFor(d: ElementDiagram, near: string | undefined, kind: string): string | undefined {
  if (!near) return undefined
  // A use case's system holds use cases only, and frames don't nest in these kinds but deployment.
  if (d.kind === 'usecase' && kind !== 'usecase') return undefined
  if (d.kind === 'activity' && kind === 'partition') return undefined
  if (isContainer(d, near) || (d.kind === 'deployment' && d.elements.some((e) => e.id === near)))
    return d.kind === 'deployment' && !isHolder(d, near) ? undefined : near
  return d.elements.find((e) => e.id === near)?.parent
}

/** Deployment elements that can hold others: nodes, devices, environments and clouds. */
function isHolder(d: ElementDiagram, id: string): boolean {
  const kind = d.elements.find((e) => e.id === id)?.kind
  return kind === 'node' || kind === 'device' || kind === 'environment' || kind === 'cloud'
}

/** The new element, or null when `type` isn't one of this diagram's. */
function addTo(
  d: ElementDiagram,
  input: { type: string; id: string; label?: string; near?: string },
): ElementDiagram | null {
  const base = (kind: string) => {
    const parent = parentFor(d, input.near, kind)
    return {
      id: input.id,
      ...(input.label ? { label: input.label } : {}),
      ...(parent ? { parent } : {}),
    }
  }
  switch (d.kind) {
    case 'usecase': {
      const kind = (USE_CASE_TYPES as Record<string, UseCaseElementKind | undefined>)[input.type]
      return kind ? { ...d, elements: [...d.elements, { ...base(kind), kind }] } : null
    }
    case 'activity': {
      const kind = (ACTIVITY_TYPES as Record<string, ActivityNodeKind | undefined>)[input.type]
      return kind ? { ...d, elements: [...d.elements, { ...base(kind), kind }] } : null
    }
    case 'deployment': {
      const kind = (DEPLOYMENT_TYPES as Record<string, DeploymentNodeKind | undefined>)[input.type]
      return kind ? { ...d, elements: [...d.elements, { ...base(kind), kind }] } : null
    }
  }
}

/** The diagram with a relation of `type` from `from` to `to`. */
function relateIn(
  d: ElementDiagram,
  input: { type: string; from: string; to: string; label: string },
): ElementDiagram {
  const labelled = input.label ? { label: input.label } : {}
  const ends = { from: input.from, to: input.to }
  switch (d.kind) {
    case 'usecase': {
      const kind = (USE_CASE_LINES as readonly string[]).includes(input.type)
        ? (input.type as UseCaseRelationKind)
        : 'association'
      const relation = { ...ends, ...(kind === 'association' ? {} : { kind }), ...labelled }
      return { ...d, relations: [...d.relations, relation] }
    }
    case 'activity':
      return { ...d, relations: [...d.relations, { ...ends, ...labelled }] }
    case 'deployment': {
      const kind = (DEPLOYMENT_LINES as readonly string[]).includes(input.type)
        ? (input.type as DeploymentRelationKind)
        : 'link'
      const relation = { ...ends, ...(kind === 'link' ? {} : { kind }), ...labelled }
      return { ...d, relations: [...d.relations, relation] }
    }
  }
}

// ── Deleting ────────────────────────────────────────────────────────────────────────────────────

/** Removes elements (what they held moves up), relations by index, and the lines that touch them. */
function deleteIn(
  d: ElementDiagram,
  removed: ReadonlySet<string>,
  rel: ReadonlySet<number>,
): ElementDiagram {
  const parentOf = new Map(d.elements.map((e) => [e.id, e.parent]))
  const survivor = (start: string | undefined) => {
    let p = start
    for (let guard = 0; p && removed.has(p) && guard < 100; guard++) p = parentOf.get(p)
    return p
  }
  const notes = (d.notes ?? []).filter(
    (n, i) => !removed.has(`note:${String(i)}`) && !(n.for && removed.has(n.for)),
  )
  const layout = Object.entries(d.layout ?? {}).filter(([id]) => !removed.has(id))
  return withParts(
    d,
    (elements, relations) => ({
      elements: elements
        .filter((e) => !removed.has(e.id))
        .map((e) => {
          if (!e.parent || !removed.has(e.parent)) return e
          const { parent: _p, ...rest } = e
          const parent = survivor(e.parent)
          return { ...rest, ...(parent ? { parent } : {}) } as typeof e
        }),
      relations: relations.filter(
        (r, i) => !rel.has(i) && !removed.has(r.from) && !removed.has(r.to),
      ),
    }),
    extrasOf(notes, layout),
  )
}

// ── Renaming and fields ─────────────────────────────────────────────────────────────────────────

/** Gives an element a new id everywhere it's used: parents, relations, notes, positions. */
function renameIdIn(d: ElementDiagram, from: string, to: string): ElementDiagram {
  const swap = (id: string) => (id === from ? to : id)
  const next = withParts(d, (elements, relations) => ({
    elements: elements.map((e) => ({
      ...e,
      id: swap(e.id),
      ...(e.parent ? { parent: swap(e.parent) } : {}),
    })),
    relations: relations.map((r) => ({ ...r, from: swap(r.from), to: swap(r.to) })),
  }))
  const notes = (d.notes ?? []).map((n) => (n.for ? { ...n, for: swap(n.for) } : n))
  const layout = Object.entries(d.layout ?? {}).map(([id, p]): [string, UmlPoint] => [swap(id), p])
  return withParts(next, same, extrasOf(notes, layout))
}

/** Sets (or clears, with null) a field of one element. */
function setElementField(
  d: ElementDiagram,
  id: string,
  key: 'label' | 'stereotype',
  value: string | null,
): ElementDiagram {
  return withParts(d, (elements, relations) => ({
    elements: elements.map((e) => {
      if (e.id !== id) return e
      const { [key]: _old, ...rest } = e
      return (value ? { ...rest, [key]: value } : rest) as typeof e
    }),
    relations: [...relations],
  }))
}

/** Changes the relation at `index`: its kind (when the diagram has several) and its label. */
function setRelationIn(
  d: ElementDiagram,
  index: number,
  fields: { type?: string; label: string },
): ElementDiagram {
  const kinds: readonly string[] = relationTypesOf(d)
  const usual = kinds[0]
  return withParts(d, (elements, relations) => ({
    elements: [...elements],
    relations: relations.map((r, i) => {
      if (i !== index) return r
      const { label: _l, kind: _k, ...rest } = r
      const kind = fields.type && kinds.includes(fields.type) ? fields.type : r.kind
      const label = fields.label.trim()
      return {
        ...rest,
        ...(kind && kind !== usual && d.kind !== 'activity' ? { kind } : {}),
        ...(label ? { label } : {}),
      } as typeof r
    }),
  }))
}

function reverseIn(d: ElementDiagram, index: number): ElementDiagram {
  return withParts(d, (elements, relations) => ({
    elements: [...elements],
    relations: relations.map((r, i) => (i === index ? { ...r, from: r.to, to: r.from } : r)),
  }))
}

/** A properties panel's fields: the name, and a deployment element's stereotype. */
function fieldsIn(d: ElementDiagram, id: string): { name: string; stereotype?: string } | null {
  if (d.kind === 'deployment') {
    const node = d.elements.find((x) => x.id === id)
    return node ? { name: node.label ?? node.id, stereotype: node.stereotype ?? '' } : null
  }
  const e = d.elements.find((x) => x.id === id)
  return e ? { name: e.label ?? e.id } : null
}

/** A relation's fields: its kind (when the diagram has several) and its label. */
function relationFieldsIn(
  d: ElementDiagram,
  index: number,
): { type?: RelationTypeOfKinds; label: string } | null {
  const r = index >= 0 && index < d.relations.length ? d.relations[index] : undefined
  if (!r) return null
  if (d.kind === 'activity') return { label: r.label ?? '' }
  const types = relationTypesOf(d)
  return {
    type: types.find((t) => t === r.kind) ?? types[0],
    label: r.label ?? '',
  }
}

// ── Copying ─────────────────────────────────────────────────────────────────────────────────────

/** The picked elements with everything inside them, the lines between them, and their notes. */
function copyIn(d: ElementDiagram, picked: ReadonlySet<string>): ElementDiagram | null {
  const ids = new Set(d.elements.filter((e) => picked.has(e.id)).map((e) => e.id))
  for (let grew = true; grew;) {
    grew = false
    for (const e of d.elements) {
      if (!ids.has(e.id) && e.parent && ids.has(e.parent)) {
        ids.add(e.id)
        grew = true
      }
    }
  }
  const notes = (d.notes ?? []).filter((_, i) => picked.has(`note:${String(i)}`))
  if (!ids.size && !notes.length) return null
  const layout = Object.entries(d.layout ?? {}).filter(([id]) => ids.has(id))
  const loose = notes.map((n) => (n.for && !ids.has(n.for) ? { text: n.text } : n))
  return withParts(
    d,
    (elements, relations) => ({
      elements: elements
        .filter((e) => ids.has(e.id))
        .map((e) => {
          if (!e.parent || ids.has(e.parent)) return e
          const { parent: _p, ...rest } = e
          return rest as typeof e
        }),
      relations: relations.filter((r) => ids.has(r.from) && ids.has(r.to)),
    }),
    extrasOf(loose, layout),
  )
}

/** How far a pasted element lands from where it was copied. */
const OFFSET = 32

/**
 * Adds `clip`'s elements under the fresh ids `fresh` gives, beside where they were; what sits
 * inside a pasted frame stays where it was in it. Gives the diagram and the pasted ids.
 */
function pasteIn(
  d: ElementDiagram,
  clip: ElementDiagram,
  fresh: (ids: readonly string[]) => ReadonlyMap<string, string>,
): { diagram: ElementDiagram; ids: string[] } | null {
  const map = fresh(clip.elements.map((e) => e.id))
  const id = (x: string) => map.get(x) ?? x
  const merge = <E extends BaseElement, R extends BaseRelation>(
    own: { elements: readonly E[]; relations: readonly R[] },
    more: { elements: readonly E[]; relations: readonly R[] },
  ) => ({
    elements: [
      ...own.elements,
      ...more.elements.map((e) => ({
        ...e,
        id: id(e.id),
        ...(e.parent ? { parent: id(e.parent) } : {}),
      })),
    ],
    relations: [
      ...own.relations,
      ...more.relations.map((r) => ({ ...r, from: id(r.from), to: id(r.to) })),
    ],
  })
  let next: ElementDiagram
  if (d.kind === 'usecase' && clip.kind === 'usecase') next = { ...d, ...merge(d, clip) }
  else if (d.kind === 'activity' && clip.kind === 'activity') next = { ...d, ...merge(d, clip) }
  else if (d.kind === 'deployment' && clip.kind === 'deployment') next = { ...d, ...merge(d, clip) }
  else return null
  const inner = new Set(clip.elements.filter((e) => e.parent && map.has(e.parent)).map((e) => e.id))
  const moved = Object.entries(clip.layout ?? {}).flatMap(([x, p]): [string, UmlPoint][] => {
    const to = map.get(x)
    if (!to) return []
    return [[to, inner.has(x) ? p : { x: p.x + OFFSET, y: p.y + OFFSET }]]
  })
  const added = (clip.notes ?? []).map((n) => (n.for ? { ...n, for: id(n.for) } : n))
  const first = (d.notes ?? []).length
  const diagram = withParts(
    next,
    same,
    extrasOf([...(d.notes ?? []), ...added], [...Object.entries(d.layout ?? {}), ...moved]),
  )
  const noteIds = added.map((_, i) => `note:${String(first + i)}`)
  return { diagram, ids: [...map.values(), ...noteIds] }
}

export {
  addTo,
  copyIn,
  deleteIn,
  type ElementTypeOfKinds,
  elementTypesOf,
  fieldsIn,
  isElementDiagram,
  pasteIn,
  relateIn,
  relationFieldsIn,
  type RelationTypeOfKinds,
  relationTypesOf,
  renameIdIn,
  reverseIn,
  setElementField,
  setRelationIn,
}
