import type {
  C4Diagram,
  ClassDiagram,
  ErDiagram,
  SequenceDiagram,
  SequenceStep,
  StateDiagram,
  UmlLayout,
  UmlNote,
  UmlSpec,
} from '@/lib/uml'
import { NAMESPACE, START_END, takenIds, type UmlSelection, uniqueId } from '@/lib/uml-edit'
import { copyIn, isElementDiagram, pasteIn } from '@/lib/uml-edit-elements'
import { insertAt, stepAt, stepId, stepPath } from '@/lib/uml-edit-sequence'

/** What was copied: a diagram of the same kind, and the class namespaces copied whole. */
interface UmlClip {
  diagram: UmlSpec
  namespaces?: string[]
}

interface PasteResult {
  diagram: UmlSpec
  /** What was pasted, to select it. */
  selection: UmlSelection
}

/** How far a pasted element lands from where it was copied. */
const OFFSET = 32

function pickLayout(layout: UmlLayout | undefined, ids: ReadonlySet<string>) {
  if (!layout) return {}
  const kept = Object.fromEntries(Object.entries(layout).filter(([id]) => ids.has(id)))
  return Object.keys(kept).length ? { layout: kept } : {}
}

function pickNotes(notes: readonly UmlNote[] | undefined, picked: ReadonlySet<string>) {
  const kept = (notes ?? []).filter((_, i) => picked.has(`note:${String(i)}`))
  return kept.length ? { notes: kept } : {}
}

/** `seed` and everything inside it, by walking `parentOf` until nothing new joins. */
function withInside<T extends { id: string }>(
  items: readonly T[],
  seed: ReadonlySet<string>,
  parentOf: (item: T) => string | undefined,
): Set<string> {
  const out = new Set(seed)
  for (let grew = true; grew;) {
    grew = false
    for (const item of items) {
      const parent = parentOf(item)
      if (!out.has(item.id) && parent && out.has(parent)) {
        out.add(item.id)
        grew = true
      }
    }
  }
  return out
}

// ── Copying ─────────────────────────────────────────────────────────────────────────────────────

function copyClass(d: ClassDiagram, picked: ReadonlySet<string>): UmlClip | null {
  const namespaces = [...picked]
    .filter((id) => id.startsWith(NAMESPACE))
    .map((id) => id.slice(NAMESPACE.length))
  const whole = new Set(namespaces)
  const classes = d.classes.filter(
    (c) => picked.has(c.id) || (c.namespace !== undefined && whole.has(c.namespace)),
  )
  const ids = new Set(classes.map((c) => c.id))
  const relations = d.relations.filter((r) => ids.has(r.from) && ids.has(r.to))
  const notes = pickNotes(d.notes, picked)
  if (!classes.length && !notes.notes) return null
  const diagram: ClassDiagram = {
    kind: 'class',
    classes,
    relations,
    ...notes,
    ...pickLayout(d.layout, ids),
  }
  return { diagram, ...(namespaces.length ? { namespaces } : {}) }
}

function copyState(d: StateDiagram, picked: ReadonlySet<string>): UmlClip | null {
  const ids = withInside(d.states, picked, (s) => s.parent)
  const states = d.states.filter((s) => ids.has(s.id))
  const inside = (id: string, parent: string | undefined) =>
    id === START_END ? parent !== undefined && ids.has(parent) : ids.has(id)
  const transitions = d.transitions.filter(
    (t) => inside(t.from, t.parent) && inside(t.to, t.parent),
  )
  const notes = pickNotes(d.notes, picked)
  if (!states.length && !notes.notes) return null
  const diagram: StateDiagram = {
    kind: 'state',
    states,
    transitions,
    ...notes,
    ...pickLayout(d.layout, ids),
  }
  return { diagram }
}

function copyEr(d: ErDiagram, picked: ReadonlySet<string>): UmlClip | null {
  const entities = d.entities.filter((e) => picked.has(e.id))
  if (!entities.length) return null
  const relations = d.relations.filter((r) => picked.has(r.from) && picked.has(r.to))
  return { diagram: { kind: 'er', entities, relations, ...pickLayout(d.layout, picked) } }
}

function copyC4(d: C4Diagram, picked: ReadonlySet<string>): UmlClip | null {
  const frames = withInside(d.boundaries ?? [], picked, (b) => b.parent)
  const boundaries = (d.boundaries ?? []).filter((b) => frames.has(b.id))
  const elements = d.elements.filter(
    (e) => picked.has(e.id) || (e.boundary !== undefined && frames.has(e.boundary)),
  )
  if (!elements.length && !boundaries.length) return null
  const ids = new Set([...elements.map((e) => e.id), ...boundaries.map((b) => b.id)])
  const relations = d.relations.filter((r) => ids.has(r.from) && ids.has(r.to))
  const diagram: C4Diagram = {
    kind: 'c4',
    level: d.level,
    elements,
    relations,
    ...(boundaries.length ? { boundaries } : {}),
    ...pickLayout(d.layout, ids),
  }
  return { diagram }
}

/** The picked steps in order, leaving out those inside a picked block (they come with it). */
function pickedSteps(d: SequenceDiagram, picked: ReadonlySet<string>): SequenceStep[] {
  const paths = [...picked]
    .map(stepPath)
    .filter((p): p is number[] => p !== null && stepAt(d.steps, p) !== undefined)
  const covered = (p: number[]) =>
    paths.some((q) => q.length < p.length && q.every((n, i) => p[i] === n))
  return paths
    .filter((p) => !covered(p))
    .sort((a, b) => stepId(a).localeCompare(stepId(b), undefined, { numeric: true }))
    .map((p) => stepAt(d.steps, p))
    .filter((s) => s !== undefined)
}

function copySequence(d: SequenceDiagram, picked: ReadonlySet<string>): UmlClip | null {
  const participants = d.participants.filter((p) => picked.has(p.id))
  const steps = pickedSteps(d, picked)
  if (!participants.length && !steps.length) return null
  return { diagram: { kind: 'sequence', participants, steps } }
}

/** What's selected, as a clip to paste; null when nothing in it can be copied. */
function copyItems(diagram: UmlSpec, selection: UmlSelection): UmlClip | null {
  const picked = new Set(selection.elements)
  if (isElementDiagram(diagram)) {
    const clip = copyIn(diagram, picked)
    return clip ? { diagram: clip } : null
  }
  switch (diagram.kind) {
    case 'class':
      return copyClass(diagram, picked)
    case 'state':
      return copyState(diagram, picked)
    case 'er':
      return copyEr(diagram, picked)
    case 'c4':
      return copyC4(diagram, picked)
    case 'sequence':
      return copySequence(diagram, picked)
  }
}

// ── Pasting ─────────────────────────────────────────────────────────────────────────────────────

/** New ids for `ids`, none of them taken (and each one taken for the next). */
function freshIds(ids: readonly string[], taken: Set<string>): Map<string, string> {
  const map = new Map<string, string>()
  for (const id of ids) {
    const next = uniqueId(id, taken)
    taken.add(next)
    map.set(id, next)
  }
  return map
}

/** The clip's positions under the new ids, moved aside; inner ones stay put in their frame. */
function movedLayout(
  layout: UmlLayout | undefined,
  map: ReadonlyMap<string, string>,
  isTop: (id: string) => boolean,
): UmlLayout {
  const out: UmlLayout = {}
  for (const [id, p] of Object.entries(layout ?? {})) {
    const next = map.get(id)
    if (!next) continue
    out[next] = isTop(id) ? { x: p.x + OFFSET, y: p.y + OFFSET } : p
  }
  return out
}

function mergeLayout<T extends { layout?: UmlLayout }>(d: T, extra: UmlLayout): T {
  if (!Object.keys(extra).length) return d
  return { ...d, layout: { ...d.layout, ...extra } }
}

function mappedNotes(
  base: readonly UmlNote[] | undefined,
  notes: readonly UmlNote[] | undefined,
  map: ReadonlyMap<string, string>,
) {
  const added = (notes ?? []).map((n) => (n.for ? { ...n, for: map.get(n.for) ?? n.for } : n))
  const all = [...(base ?? []), ...added]
  const first = (base ?? []).length
  return {
    notes: all.length ? { notes: all } : {},
    ids: added.map((_, i) => `note:${String(first + i)}`),
  }
}

function pasteClass(d: ClassDiagram, clip: UmlClip & { diagram: ClassDiagram }): PasteResult {
  const taken = takenIds(d)
  const map = freshIds(
    clip.diagram.classes.map((c) => c.id),
    taken,
  )
  const spaces = freshIds(clip.namespaces ?? [], taken)
  const id = (x: string) => map.get(x) ?? x
  const classes = clip.diagram.classes.map((c) => ({
    ...c,
    id: id(c.id),
    ...(c.namespace ? { namespace: spaces.get(c.namespace) ?? c.namespace } : {}),
  }))
  const relations = clip.diagram.relations.map((r) => ({ ...r, from: id(r.from), to: id(r.to) }))
  const notes = mappedNotes(d.notes, clip.diagram.notes, map)
  const next = mergeLayout(
    { ...d, classes: [...d.classes, ...classes], relations: [...d.relations, ...relations] },
    movedLayout(clip.diagram.layout, map, () => true),
  )
  const elements = [...classes.map((c) => c.id), ...notes.ids]
  return { diagram: { ...next, ...notes.notes }, selection: { elements, relations: [] } }
}

function pasteState(d: StateDiagram, clip: StateDiagram): PasteResult {
  const map = freshIds(
    clip.states.map((s) => s.id),
    takenIds(d),
  )
  const id = (x: string) => map.get(x) ?? x
  const parent = <T extends { parent?: string }>(x: T): T =>
    x.parent ? { ...x, parent: id(x.parent) } : x
  const states = clip.states.map((s) => parent({ ...s, id: id(s.id) }))
  const transitions = clip.transitions.map((t) => parent({ ...t, from: id(t.from), to: id(t.to) }))
  const copied = new Set(map.keys())
  const top = (x: string) => {
    const p = clip.states.find((s) => s.id === x)?.parent
    return !p || !copied.has(p)
  }
  const notes = mappedNotes(d.notes, clip.notes, map)
  const next = mergeLayout(
    {
      ...d,
      states: [...d.states, ...states],
      transitions: [...d.transitions, ...transitions],
    },
    movedLayout(clip.layout, map, top),
  )
  const elements = [...states.map((s) => s.id), ...notes.ids]
  return { diagram: { ...next, ...notes.notes }, selection: { elements, relations: [] } }
}

function pasteEr(d: ErDiagram, clip: ErDiagram): PasteResult {
  const map = freshIds(
    clip.entities.map((e) => e.id),
    takenIds(d),
  )
  const id = (x: string) => map.get(x) ?? x
  const entities = clip.entities.map((e) => ({ ...e, id: id(e.id) }))
  const relations = clip.relations.map((r) => ({ ...r, from: id(r.from), to: id(r.to) }))
  const next = mergeLayout(
    { ...d, entities: [...d.entities, ...entities], relations: [...d.relations, ...relations] },
    movedLayout(clip.layout, map, () => true),
  )
  return { diagram: next, selection: { elements: entities.map((e) => e.id), relations: [] } }
}

function pasteC4(d: C4Diagram, clip: C4Diagram): PasteResult {
  const boundaries = clip.boundaries ?? []
  const map = freshIds(
    [...boundaries.map((b) => b.id), ...clip.elements.map((e) => e.id)],
    takenIds(d),
  )
  const id = (x: string) => map.get(x) ?? x
  const frames = boundaries.map((b) => ({
    ...b,
    id: id(b.id),
    ...(b.parent ? { parent: id(b.parent) } : {}),
  }))
  const elements = clip.elements.map((e) => ({
    ...e,
    id: id(e.id),
    ...(e.boundary ? { boundary: id(e.boundary) } : {}),
  }))
  const relations = clip.relations.map((r) => ({ ...r, from: id(r.from), to: id(r.to) }))
  const copied = new Set(boundaries.map((b) => b.id))
  const top = (x: string) => {
    const p =
      clip.elements.find((e) => e.id === x)?.boundary ?? boundaries.find((b) => b.id === x)?.parent
    return !p || !copied.has(p)
  }
  const next = mergeLayout(
    {
      ...d,
      elements: [...d.elements, ...elements],
      relations: [...d.relations, ...relations],
      ...(frames.length || d.boundaries
        ? { boundaries: [...(d.boundaries ?? []), ...frames] }
        : {}),
    },
    movedLayout(clip.layout, map, top),
  )
  const picked = [...frames.map((b) => b.id), ...elements.map((e) => e.id)]
  return { diagram: next, selection: { elements: picked, relations: [] } }
}

/** The steps with their participants renamed through `id`. */
function mapSteps(steps: readonly SequenceStep[], id: (x: string) => string): SequenceStep[] {
  return steps.map((s): SequenceStep => {
    switch (s.type) {
      case 'message':
        return { ...s, from: id(s.from), to: id(s.to) }
      case 'activation':
        return { ...s, participant: id(s.participant) }
      case 'note':
        return { ...s, participants: s.participants.map(id) }
      case 'block':
        return { ...s, sections: s.sections.map((x) => ({ ...x, steps: mapSteps(x.steps, id) })) }
    }
  })
}

function pasteSequence(d: SequenceDiagram, clip: SequenceDiagram, near?: string): PasteResult {
  const map = freshIds(
    clip.participants.map((p) => p.id),
    takenIds(d),
  )
  const id = (x: string) => map.get(x) ?? x
  const participants = clip.participants.map((p) => ({ ...p, id: id(p.id) }))
  const withPeople = { ...d, participants: [...d.participants, ...participants] }
  const steps = mapSteps(clip.steps, id)
  // Right after the step `near` names (after a block, not inside it), or at the end.
  const at = near ? stepPath(near) : null
  const path =
    at && stepAt(d.steps, at) ? [...at.slice(0, -1), (at.at(-1) ?? 0) + 1] : [d.steps.length]
  const next = steps.length ? insertAt(withPeople, path, steps) : withPeople
  const first = path.at(-1) ?? 0
  const ids = steps.map((_, i) => stepId([...path.slice(0, -1), first + i]))
  return {
    diagram: next,
    selection: { elements: [...participants.map((p) => p.id), ...ids], relations: [] },
  }
}

/**
 * Pastes a clip under fresh ids: elements beside where they were copied from, sequence steps
 * after the step `near` names (or at the end). Unchanged when the clip is another kind.
 */
function pasteItems(diagram: UmlSpec, clip: UmlClip, near?: string): PasteResult {
  const nothing = { diagram, selection: { elements: [], relations: [] } }
  const c = clip.diagram
  if (diagram.kind === 'class' && c.kind === 'class')
    return pasteClass(diagram, { ...clip, diagram: c })
  if (diagram.kind === 'state' && c.kind === 'state') return pasteState(diagram, c)
  if (diagram.kind === 'er' && c.kind === 'er') return pasteEr(diagram, c)
  if (diagram.kind === 'c4' && c.kind === 'c4') return pasteC4(diagram, c)
  if (diagram.kind === 'sequence' && c.kind === 'sequence') return pasteSequence(diagram, c, near)
  if (isElementDiagram(diagram) && isElementDiagram(c)) {
    const pasted = pasteIn(diagram, c, (ids) => freshIds(ids, takenIds(diagram)))
    if (pasted)
      return { diagram: pasted.diagram, selection: { elements: pasted.ids, relations: [] } }
  }
  return nothing
}

/** Copies and pastes at once: the selection again, beside itself (steps after the last one). */
function duplicateItems(diagram: UmlSpec, selection: UmlSelection): PasteResult {
  const clip = copyItems(diagram, selection)
  if (!clip) return { diagram, selection }
  const steps = selection.elements.filter((id) => stepPath(id))
  const last = [...steps].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1)
  return pasteItems(diagram, clip, last)
}

/** True when `selection` has something `copyItems` takes. */
function canCopy(diagram: UmlSpec, selection: UmlSelection): boolean {
  return copyItems(diagram, selection) !== null
}

export { canCopy, copyItems, duplicateItems, pasteItems, type PasteResult, type UmlClip }
