import {
  STATE_REGIONS_MAX,
  type StateDiagram,
  type StateKind,
  type StateTransition,
  type UmlDirection,
  type UmlNote,
  type UmlProblem,
  type UmlState,
} from './uml.ts'
import {
  type Groups,
  match,
  problem,
  quote,
  type SourceLine,
  STYLING,
  titleBlock,
  unquote,
} from './uml-text.ts'

const ID = '(?:\\[\\*\\]|[\\w.]+)'
const TRANSITION = new RegExp(
  `^(${ID})(?::::\\w+)?\\s*-->\\s*(${ID})(?::::\\w+)?\\s*(?::\\s*(.*))?$`,
)
const ALIAS = /^state\s+"([^"]*)"\s+as\s+([\w.]+)\s*(\{)?$/
const COMPOSITE = /^state\s+([\w.]+)\s*\{$/
const SPECIAL = /^state\s+([\w.]+)\s+<<\s*(choice|fork|join)\s*>>$/
const DECLARE = /^state\s+([\w.]+)$/
const DESCRIPTION = /^([\w.]+)\s*:\s*(.+)$/
const NOTE_INLINE = /^note\s+(left|right)\s+of\s+([\w.]+)\s*:\s*(.+)$/i
const NOTE_OPEN = /^note\s+(left|right)\s+of\s+([\w.]+)$/i
const DIRECTION = /^direction\s+(TB|TD|BT|LR|RL)$/
const BARE = /^[\w.]+$/

interface StateParse {
  states: Map<string, UmlState>
  transitions: StateTransition[]
  notes: UmlNote[]
  problems: UmlProblem[]
  /** The composite states we're inside, innermost last, each with the region being read. */
  stack: { id: string; line: SourceLine; region: number }[]
  /** A multi-line note being read. */
  note?: { for: string; lines: string[] }
  direction?: UmlDirection
}

function scopeOf(p: StateParse): string | undefined {
  return p.stack.at(-1)?.id
}

function ensureState(p: StateParse, id: string): UmlState {
  let state = p.states.get(id)
  if (!state) {
    state = { id }
    const scope = p.stack.at(-1)
    if (scope) state.parent = scope.id
    if (scope?.region) state.region = scope.region
    p.states.set(id, state)
  }
  return state
}

function readTransition(p: StateParse, m: Groups) {
  const [, from = '', to = '', label] = m
  if (from !== '[*]') ensureState(p, from)
  if (to !== '[*]') ensureState(p, to)
  const parent = scopeOf(p)
  p.transitions.push({
    from,
    to,
    ...(label?.trim() ? { label: label.trim() } : {}),
    ...((from === '[*]' || to === '[*]') && parent ? { parent } : {}),
  })
}

function openComposite(p: StateParse, id: string, line: SourceLine) {
  ensureState(p, id)
  p.stack.push({ id, line, region: 0 })
}

function readAlias(p: StateParse, m: Groups, line: SourceLine) {
  const [, label = '', id = '', open] = m
  ensureState(p, id).label = unquote(`"${label}"`)
  if (open) p.stack.push({ id, line, region: 0 })
}

function readNoteLine(p: StateParse, note: NonNullable<StateParse['note']>, line: SourceLine) {
  if (/^end\s+note$/i.test(line.text)) {
    p.notes.push({ for: note.for, text: note.lines.join('\n') })
    delete p.note
  } else note.lines.push(line.text)
}

type Reader = (p: StateParse, m: Groups, line: SourceLine) => void

const toDirection = (d: string | undefined): UmlDirection =>
  d === 'TD' ? 'TB' : (d as UmlDirection)

/** Each statement and what reading it does, tried in order. */
const STATEMENTS: readonly [RegExp, Reader][] = [
  [TRANSITION, readTransition],
  [
    DIRECTION,
    (p, m) => {
      p.direction = toDirection(m[1])
    },
  ],
  [ALIAS, readAlias],
  [COMPOSITE, (p, m, line) => openComposite(p, m[1] ?? '', line)],
  [
    SPECIAL,
    (p, m) => {
      ensureState(p, m[1] ?? '').kind = m[2] as StateKind
    },
  ],
  [DECLARE, (p, m) => ensureState(p, m[1] ?? '')],
  [BARE, (p, m) => ensureState(p, m[0] ?? '')],
  [NOTE_INLINE, (p, m) => p.notes.push({ for: m[2] ?? '', text: m[3] ?? '' })],
  [
    NOTE_OPEN,
    (p, m) => {
      p.note = { for: m[2] ?? '', lines: [] }
    },
  ],
  [DESCRIPTION, (p, m) => addDescription(ensureState(p, m[1] ?? ''), m[2] ?? '')],
]

/** One line. Returns false when nothing understood it. */
function readStatement(p: StateParse, line: SourceLine): boolean {
  // `--` starts the next concurrent region of the composite being read.
  const scope = p.stack.at(-1)
  if (line.text === '--' && scope && scope.region < STATE_REGIONS_MAX) {
    scope.region++
    return true
  }
  for (const [re, read] of STATEMENTS) {
    const m = match(re, line.text)
    if (m) {
      read(p, m, line)
      return true
    }
  }
  if (line.text === '--' || STYLING.test(line.text) || /^class\s/.test(line.text)) {
    p.problems.push(problem(line, 'unsupported', 'warning'))
    return true
  }
  return false
}

function addDescription(state: UmlState, text: string) {
  state.description = state.description ? `${state.description}\n${text.trim()}` : text.trim()
}

/** The lines after `stateDiagram-v2`. */
function parseStateDiagram(
  lines: readonly SourceLine[],
  title?: string,
): { diagram: StateDiagram; problems: UmlProblem[] } {
  const p: StateParse = { states: new Map(), transitions: [], notes: [], problems: [], stack: [] }
  for (const line of lines) {
    if (p.note) readNoteLine(p, p.note, line)
    else if (line.text === '}') {
      if (!p.stack.pop()) p.problems.push(problem(line, 'unexpected'))
    } else if (!readStatement(p, line)) p.problems.push(problem(line, 'syntax'))
  }
  for (const open of p.stack) p.problems.push(problem(open.line, 'unclosed'))
  const diagram: StateDiagram = {
    kind: 'state',
    ...(title ? { title } : {}),
    ...(p.direction ? { direction: p.direction } : {}),
    states: [...p.states.values()],
    transitions: p.transitions,
    ...(p.notes.length ? { notes: p.notes } : {}),
  }
  return { diagram, problems: p.problems }
}

// ── Writing ─────────────────────────────────────────────────────────────────────────────────────

function stateDecl(s: UmlState, composite: boolean): string[] {
  const out: string[] = []
  if (s.label) out.push(`state ${quote(s.label)} as ${s.id}`)
  if (s.kind && s.kind !== 'state') out.push(`state ${s.id} <<${s.kind}>>`)
  for (const d of s.description?.split('\n') ?? []) out.push(`${s.id} : ${d}`)
  // Declared so a state with no transition still shows.
  if (!out.length && !composite) out.push(s.id)
  return out
}

interface StateRegion {
  states: UmlState[]
  transitions: StateTransition[]
}

/**
 * The states of `scope` grouped by concurrent region, in region order, each with the `transitions`
 * written in it: a `[*]` start or end goes with the state at its other end, a transition between
 * two regions with the later one (both its states are declared by then). Empty regions are
 * skipped, so their numbers close up; outside a composite there is a single region.
 */
function stateRegions(
  diagram: StateDiagram,
  scope: string | undefined,
  transitions: readonly StateTransition[],
): StateRegion[] {
  const children = diagram.states.filter((s) => s.parent === scope)
  const regionOf = (s: UmlState) => (scope === undefined ? 0 : (s.region ?? 0))
  const numbers = [...new Set(children.map(regionOf))].sort((a, b) => a - b)
  if (!numbers.length) numbers.push(0)
  const regions = numbers.map((n) => ({
    states: children.filter((s) => regionOf(s) === n),
    transitions: [] as StateTransition[],
  }))
  for (const t of transitions) {
    const ends = children.filter((s) => s.id === t.from || s.id === t.to)
    const index = Math.max(0, ...ends.map((s) => numbers.indexOf(regionOf(s))))
    regions[index]?.transitions.push(t)
  }
  return regions
}

function scopeLines(diagram: StateDiagram, scope: string | undefined, indent: string): string[] {
  const isComposite = (id: string) => diagram.states.some((s) => s.parent === id)
  const parentOf = (id: string) => diagram.states.find((s) => s.id === id)?.parent
  // A transition between two states of the same composite is written inside it.
  const home = (t: StateTransition) => {
    if (t.from === '[*]' || t.to === '[*]') return t.parent
    const parent = parentOf(t.from)
    return parent === parentOf(t.to) ? parent : undefined
  }
  const inScope = (t: StateTransition) => home(t) === scope
  return stateRegions(diagram, scope, diagram.transitions.filter(inScope)).flatMap((r, i) => [
    ...(i ? [`${indent}--`] : []),
    ...r.states.flatMap((s) => [
      ...stateDecl(s, isComposite(s.id)).map((l) => indent + l),
      ...(isComposite(s.id)
        ? [`${indent}state ${s.id} {`, ...scopeLines(diagram, s.id, `${indent}  `), `${indent}}`]
        : []),
    ]),
    ...r.transitions.map(
      (t) =>
        `${indent}${t.from} --> ${t.to}${t.label ? ` : ${t.label.replace(/\r?\n/g, ' ')}` : ''}`,
    ),
  ])
}

/** The diagram as Mermaid `stateDiagram-v2` text. */
function stateToMermaid(diagram: StateDiagram): string {
  const out = [...titleBlock(diagram.title), 'stateDiagram-v2']
  if (diagram.direction && diagram.direction !== 'TB') out.push(`  direction ${diagram.direction}`)
  out.push(...scopeLines(diagram, undefined, '  '))
  for (const n of diagram.notes ?? []) {
    if (!n.for) continue
    const lines = n.text.split('\n')
    if (lines.length === 1) out.push(`  note right of ${n.for} : ${n.text}`)
    else out.push(`  note right of ${n.for}`, ...lines.map((l) => `    ${l}`), '  end note')
  }
  return out.join('\n')
}

export { parseStateDiagram, stateRegions, stateToMermaid }
