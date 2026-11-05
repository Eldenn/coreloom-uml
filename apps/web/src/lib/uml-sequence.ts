import type {
  SequenceArrow,
  SequenceBlockKind,
  SequenceDiagram,
  SequenceParticipant,
  SequenceStep,
} from '@/lib/uml'
import { stepId } from '@/lib/uml-edit-sequence'

interface SequenceColumn {
  id: string
  label: string
  kind: 'participant' | 'actor'
  /** The lifeline's x. */
  x: number
  /** The width of the box at the top and bottom. */
  width: number
}

type SequenceItem =
  | {
      type: 'message'
      y: number
      from: number
      to: number
      self: boolean
      text: string
      arrow: SequenceArrow
      /** With autonumber. */
      number?: number
      fromId: string
      toId: string
      /** The step it draws, as `step:<path>` (see `stepId` in uml-edit-sequence.ts). */
      id: string
    }
  | {
      type: 'note'
      x: number
      y: number
      width: number
      height: number
      text: string
      who: string[]
      id: string
    }
  | {
      type: 'block'
      kind: SequenceBlockKind
      x: number
      y: number
      width: number
      height: number
      /** The first section's label, then each further section's divider. */
      sections: { label: string; y: number }[]
      depth: number
      id: string
    }
  | { type: 'activation'; participant: string; x: number; y1: number; y2: number }

interface SequenceLayout {
  width: number
  height: number
  columns: SequenceColumn[]
  items: SequenceItem[]
  /** Where lifelines start and end. */
  top: number
  bottom: number
}

const BOX_H = 44
const ACTOR_H = 64
const LINE = 16
const MESSAGE_H = 40
const SELF_H = 56
const NOTE_PAD = 10
const BLOCK_HEAD = 30
const SECTION_H = 26
const BLOCK_END = 14
const MARGIN = 16
const CHAR = 6.9
const MIN_BOX = 96
const MIN_GAP = 40

const textWidth = (text: string) => Math.max(0, ...text.split('\n').map((l) => l.length)) * CHAR
const lineCount = (text: string) => Math.max(1, text.split('\n').length)

function messages(steps: readonly SequenceStep[]): Extract<SequenceStep, { type: 'message' }>[] {
  return steps.flatMap((s) => {
    if (s.type === 'message') return [s]
    if (s.type === 'block') return s.sections.flatMap((sec) => messages(sec.steps))
    return []
  })
}

function notes(steps: readonly SequenceStep[]): Extract<SequenceStep, { type: 'note' }>[] {
  return steps.flatMap((s) => {
    if (s.type === 'note') return [s]
    if (s.type === 'block') return s.sections.flatMap((sec) => notes(sec.steps))
    return []
  })
}

/** Every participant, including ones only named in steps (in the order they appear). */
function allParticipants(d: SequenceDiagram): SequenceParticipant[] {
  const out = new Map(d.participants.map((p) => [p.id, p]))
  for (const m of messages(d.steps)) {
    for (const id of [m.from, m.to]) if (!out.has(id)) out.set(id, { id })
  }
  for (const n of notes(d.steps))
    for (const id of n.participants) if (!out.has(id)) out.set(id, { id })
  return [...out.values()]
}

/** Widens gaps for the messages and notes between columns; returns the room each needs on its right. */
function widen(
  d: SequenceDiagram,
  index: Map<string, number>,
  need: (a: number, b: number, width: number) => void,
): number[] {
  const selfRoom: number[] = Array.from({ length: index.size }, () => 0)
  const room = (i: number, width: number) => {
    selfRoom[i] = Math.max(selfRoom[i] ?? 0, width)
  }
  // Message texts sit on the line between their ends; self messages loop out to the right.
  for (const m of messages(d.steps)) {
    const a = index.get(m.from) ?? 0
    const b = index.get(m.to) ?? 0
    const w = textWidth(m.text) + 36
    if (a === b) room(a, w + 30)
    else need(a, b, w)
  }
  for (const n of notes(d.steps)) {
    const a = index.get(n.participants[0] ?? '') ?? 0
    const w = textWidth(n.text) + 2 * NOTE_PAD + 16
    if (n.participants.length > 1) need(a, index.get(n.participants[1] ?? '') ?? a, w - 40)
    else if (n.position === 'right') room(a, w + 20)
    else if (n.position === 'left' && a > 0) need(a - 1, a, w + 20)
  }
  return selfRoom
}

/** Lifeline x positions: each gap wide enough for its boxes and the messages that cross it. */
function columns(d: SequenceDiagram, people: readonly SequenceParticipant[]): SequenceColumn[] {
  const index = new Map(people.map((p, i) => [p.id, i]))
  const widths = people.map((p) => Math.max(MIN_BOX, textWidth(p.label ?? p.id) + 28))
  const gaps = widths.slice(1).map((w, i) => (widths[i] ?? 0) / 2 + w / 2 + MIN_GAP)
  const need = (a: number, b: number, width: number) => {
    const [lo, hi] = a < b ? [a, b] : [b, a]
    const have = gaps.slice(lo, hi).reduce((s, g) => s + g, 0)
    if (have < width && hi > lo) gaps[hi - 1] = (gaps[hi - 1] ?? 0) + width - have
  }
  const selfRoom = widen(d, index, need)
  selfRoom.forEach((room, i) => {
    if (i < gaps.length && (gaps[i] ?? 0) < room) gaps[i] = room
  })
  let x = MARGIN + Math.max((widths[0] ?? MIN_BOX) / 2, leftRoom(d, people[0]?.id))
  return people.map((p, i) => {
    if (i > 0) x += gaps[i - 1] ?? 0
    return {
      id: p.id,
      label: p.label ?? p.id,
      kind: p.kind ?? 'participant',
      x,
      width: widths[i] ?? MIN_BOX,
    }
  })
}

/** Room a "left of" note on the first participant needs. */
function leftRoom(d: SequenceDiagram, first: string | undefined): number {
  const widths = notes(d.steps)
    .filter((n) => n.position === 'left' && n.participants[0] === first)
    .map((n) => textWidth(n.text) + 2 * NOTE_PAD + 24)
  return Math.max(0, ...widths)
}

interface Walk {
  y: number
  number: number
  items: SequenceItem[]
  x: Map<string, number>
  /** Open activations, per participant: the y each started at. */
  active: Map<string, number[]>
  autonumber: boolean
}

function startActivation(w: Walk, id: string, y: number) {
  w.active.set(id, [...(w.active.get(id) ?? []), y])
}

function endActivation(w: Walk, id: string, y: number) {
  const open = w.active.get(id) ?? []
  const start = open.pop()
  if (start === undefined) return
  w.items.push({
    type: 'activation',
    participant: id,
    x: (w.x.get(id) ?? 0) + open.length * 4,
    y1: start,
    y2: y,
  })
}

function placeMessage(w: Walk, m: Extract<SequenceStep, { type: 'message' }>, id: string) {
  const self = m.from === m.to
  const extra = (lineCount(m.text) - 1) * LINE
  w.y += extra
  const y = w.y + (self ? 24 : 26)
  w.items.push({
    type: 'message',
    y,
    from: w.x.get(m.from) ?? 0,
    to: w.x.get(m.to) ?? 0,
    self,
    text: m.text,
    arrow: m.arrow,
    fromId: m.from,
    toId: m.to,
    id,
    ...(w.autonumber ? { number: ++w.number } : {}),
  })
  if (m.activate) startActivation(w, m.to, y)
  if (m.deactivate) endActivation(w, m.from, y)
  w.y += self ? SELF_H : MESSAGE_H
}

function placeNote(w: Walk, n: Extract<SequenceStep, { type: 'note' }>, id: string) {
  const xs = n.participants.map((id) => w.x.get(id) ?? 0)
  const width = textWidth(n.text) + 2 * NOTE_PAD
  const height = lineCount(n.text) * LINE + 2 * NOTE_PAD - 4
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  let x = lo - width / 2
  if (n.participants.length > 1) x = lo - 24
  if (n.position === 'right') x = lo + 12
  if (n.position === 'left') x = lo - 12 - width
  const span = n.participants.length > 1 ? Math.max(width, hi - lo + 48) : width
  w.items.push({
    type: 'note',
    x,
    y: w.y + 8,
    width: span,
    height,
    text: n.text,
    who: n.participants,
    id,
  })
  w.y += height + 20
}

/** The x range a block's steps touch, from the lifelines they use. */
function blockRange(w: Walk, steps: readonly SequenceStep[]): [number, number] {
  const ids = [
    ...messages(steps).flatMap((m) => [m.from, m.to]),
    ...notes(steps).flatMap((n) => n.participants),
  ]
  const xs = ids.map((id) => w.x.get(id) ?? 0)
  if (!xs.length) return [0, 0]
  return [Math.min(...xs), Math.max(...xs)]
}

function placeBlock(
  w: Walk,
  b: Extract<SequenceStep, { type: 'block' }>,
  depth: number,
  path: readonly number[],
) {
  const top = w.y + 4
  const sections: { label: string; y: number }[] = []
  w.y += BLOCK_HEAD
  b.sections.forEach((section, i) => {
    if (i > 0) {
      sections.push({ label: section.label, y: w.y })
      w.y += SECTION_H
    } else sections.push({ label: section.label, y: top })
    placeSteps(w, section.steps, depth + 1, [...path, i])
  })
  w.y += BLOCK_END
  const [lo, hi] = blockRange(
    w,
    b.sections.flatMap((s) => s.steps),
  )
  const pad = 56 - depth * 8
  const labelRoom = textWidth(sections[0]?.label ?? '') + 90
  const x = lo - pad
  const width = Math.max(hi - lo + 2 * pad, labelRoom)
  w.items.push({
    type: 'block',
    kind: b.kind,
    x,
    y: top,
    width,
    height: w.y - top,
    sections,
    depth,
    id: stepId(path),
  })
  w.y += 8
}

function placeSteps(
  w: Walk,
  steps: readonly SequenceStep[],
  depth: number,
  prefix: readonly number[],
) {
  for (const [i, step] of steps.entries()) {
    const path = [...prefix, i]
    switch (step.type) {
      case 'message':
        placeMessage(w, step, stepId(path))
        break
      case 'note':
        placeNote(w, step, stepId(path))
        break
      case 'activation':
        if (step.active) startActivation(w, step.participant, w.y + 4)
        else endActivation(w, step.participant, w.y + 4)
        break
      case 'block':
        placeBlock(w, step, depth, path)
        break
    }
  }
}

/** Lays out a sequence diagram. */
function layoutSequence(d: SequenceDiagram): SequenceLayout {
  const people = allParticipants(d)
  const cols = columns(d, people)
  const head = people.some((p) => p.kind === 'actor') ? ACTOR_H : BOX_H
  const w: Walk = {
    y: head + 16,
    number: 0,
    items: [],
    x: new Map(cols.map((c) => [c.id, c.x])),
    active: new Map(),
    autonumber: Boolean(d.autonumber),
  }
  placeSteps(w, d.steps, 0, [])
  const bottom = w.y + 12
  for (const [id, open] of w.active)
    for (let i = open.length; i > 0; i--) endActivation(w, id, bottom - 8)
  // Blocks are drawn first so messages sit on top; inner blocks after outer ones.
  const blocks = w.items.filter((i) => i.type === 'block').sort((a, b) => a.depth - b.depth)
  // Activation bars next, under the messages and their numbers.
  const bars = w.items.filter((i) => i.type === 'activation')
  const rest = w.items.filter((i) => i.type !== 'block' && i.type !== 'activation')
  const items = [...blocks, ...bars, ...rest]
  const right = Math.max(
    ...cols.map((c) => c.x + c.width / 2),
    ...items.map((i) => ('width' in i ? i.x + i.width : 0)),
    ...items.map((i) => (i.type === 'message' && i.self ? i.from + textWidth(i.text) + 60 : 0)),
  )
  const left = Math.min(0, ...items.map((i) => ('width' in i ? i.x : 0)))
  // Shift everything right when a block or note starts left of the margin.
  const shift = left < MARGIN ? MARGIN - left : 0
  if (shift) shiftAll(cols, items, shift)
  return {
    width: Math.ceil(right + shift + MARGIN),
    height: Math.ceil(bottom + head),
    columns: cols,
    items,
    top: head,
    bottom,
  }
}

function shiftAll(cols: SequenceColumn[], items: SequenceItem[], dx: number) {
  for (const c of cols) c.x += dx
  for (const item of items) {
    if (item.type === 'message') {
      item.from += dx
      item.to += dx
    } else item.x += dx
  }
}

export { layoutSequence, type SequenceColumn, type SequenceItem, type SequenceLayout }
