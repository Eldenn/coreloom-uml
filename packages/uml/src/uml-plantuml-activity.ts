import type { UmlNote, UmlProblem } from './uml.ts'
import type {
  ActivityDiagram,
  ActivityFlow,
  ActivityNode,
  ActivityNodeKind,
} from './uml-elements.ts'
import { match, problem, type SourceLine, unquote } from './uml-text.ts'

/** Where the next node connects from: a node, with the guard its flow carries. */
interface Tail {
  id: string
  label?: string
}

type Frame =
  | { type: 'if'; decision: string; ends: Tail[]; hasElse: boolean; line: SourceLine }
  | { type: 'while'; decision: string; line: SourceLine }
  | { type: 'repeat'; merge: string; line: SourceLine }
  | { type: 'fork'; fork: string; ends: Tail[]; line: SourceLine }
  | { type: 'partition'; id: string; line: SourceLine }

interface ActivityParse {
  nodes: ActivityNode[]
  flows: ActivityFlow[]
  notes: UmlNote[]
  problems: UmlProblem[]
  frames: Frame[]
  tails: Tail[]
  /** The swimlane nodes now go in (a partition). */
  lane?: string
  /** An action whose text runs over several lines, until `;`. */
  open?: { lines: string[]; line: SourceLine }
  /** A note over several lines, until `end note`. */
  note?: { lines: string[] }
  counter: Record<string, number>
  title?: string
}

const IF = /^if\s*\((.*?)\)\s*(?:then|is)?\s*(?:\((.*)\))?$/i
const ELSEIF = /^else\s*if\s*\((.*?)\)\s*(?:then|is)?\s*(?:\((.*)\))?$/i
const ELSE = /^else\s*(?:\((.*)\))?$/i
const WHILE = /^while\s*\((.*?)\)\s*(?:is\s*\((.*)\))?$/i
const END_WHILE = /^end\s*while\s*(?:\((.*)\))?$/i
const REPEAT_WHILE = /^repeat\s*while\s*\((.*?)\)\s*(?:is\s*\((.*?)\))?\s*(?:not\s*\((.*?)\))?$/i
const LANE = /^\|(?:#[\w]+\|)?([^|]+)\|$/
const PARTITION = /^(?:partition|group|package|rectangle)\s+(.+?)\s*\{$/i
const ARROW_LABEL = /^-+>\s*(.*?);?$/
const NOTE_INLINE = /^(?:floating\s+)?note\s+(?:left|right)\s*:\s*(.+)$/i
const NOTE_OPEN = /^(?:floating\s+)?note\s+(?:left|right)$/i
const STYLING = /^(skinparam|hide|show|!|scale|caption|legend|footer|header|detach)/i

function fresh(p: ActivityParse, kind: string): string {
  const n = (p.counter[kind] ?? 0) + 1
  p.counter[kind] = n
  return `${kind}${String(n)}`
}

/** Adds a node, joins every open tail to it, and makes it the only tail. */
function addNode(p: ActivityParse, kind: ActivityNodeKind, label?: string): string {
  const id = fresh(p, kind === 'action' ? 'a' : kind)
  const parent = p.lane
  p.nodes.push({ id, kind, ...(label ? { label } : {}), ...(parent ? { parent } : {}) })
  connect(p, id)
  return id
}

function connect(p: ActivityParse, to: string) {
  for (const t of p.tails) p.flows.push({ from: t.id, to, ...(t.label ? { label: t.label } : {}) })
  p.tails = [{ id: to }]
}

const guard = (label: string | undefined) => {
  const text = label?.trim()
  return text ? { label: text } : {}
}

function openIf(p: ActivityParse, m: readonly (string | undefined)[], line: SourceLine) {
  const decision = addNode(p, 'decision', unquote(m[1] ?? ''))
  p.frames.push({ type: 'if', decision, ends: [], hasElse: false, line })
  p.tails = [{ id: decision, ...guard(m[2]) }]
}

function nextBranch(
  p: ActivityParse,
  label: string | undefined,
  line: SourceLine,
  isElse: boolean,
) {
  const frame = p.frames.at(-1)
  if (frame?.type !== 'if') return void p.problems.push(problem(line, 'unexpected'))
  frame.ends.push(...p.tails)
  if (isElse) frame.hasElse = true
  p.tails = [{ id: frame.decision, ...guard(label) }]
}

function closeIf(p: ActivityParse, line: SourceLine) {
  const frame = p.frames.pop()
  if (frame?.type !== 'if') return void p.problems.push(problem(line, 'unexpected'))
  // Without an else, the false branch goes straight on.
  const ends = [...frame.ends, ...p.tails, ...(frame.hasElse ? [] : [{ id: frame.decision }])]
  p.tails = ends
  if (ends.length > 1) addNode(p, 'merge')
}

/** `endwhile`: back to the question, then out of the loop on the exit label. */
function closeWhile(p: ActivityParse, frame: Frame, label: string | undefined): boolean {
  if (frame.type !== 'while') return false
  p.frames.pop()
  connect(p, frame.decision)
  p.tails = [{ id: frame.decision, ...guard(label) }]
  return true
}

/** `repeat while (more?) is (yes) not (no)`: `is` labels the way back, `not` the way out. */
function closeRepeat(p: ActivityParse, frame: Frame, m: readonly (string | undefined)[]): boolean {
  if (frame.type !== 'repeat') return false
  p.frames.pop()
  const decision = addNode(p, 'decision', unquote(m[1] ?? ''))
  p.flows.push({ from: decision, to: frame.merge, ...guard(m[2]) })
  p.tails = [{ id: decision, ...guard(m[3]) }]
  return true
}

function closeFork(p: ActivityParse, frame: Frame): boolean {
  if (frame.type !== 'fork') return false
  p.frames.pop()
  p.tails = [...frame.ends, ...p.tails]
  addNode(p, 'join')
  return true
}

function closePartition(p: ActivityParse, frame: Frame): boolean {
  if (frame.type !== 'partition') return false
  p.frames.pop()
  const outer = [...p.frames].reverse().find((f) => f.type === 'partition')
  if (outer?.type === 'partition') p.lane = outer.id
  else delete p.lane
  return true
}

/** The line that closes the innermost loop, fork or partition; false when it closes nothing. */
function closeFrame(p: ActivityParse, text: string, line: SourceLine): boolean {
  const whileEnd = match(END_WHILE, text)
  const repeatEnd = match(REPEAT_WHILE, text)
  const forkEnd = /^end\s*(fork|merge|split)$|^fork\s*end$/i.test(text)
  if (!whileEnd && !repeatEnd && !forkEnd && text !== '}') return false
  const frame = p.frames.at(-1)
  let closed = false
  if (frame && whileEnd) closed = closeWhile(p, frame, whileEnd[1])
  else if (frame && repeatEnd) closed = closeRepeat(p, frame, repeatEnd)
  else if (frame && forkEnd) closed = closeFork(p, frame)
  else if (frame) closed = closePartition(p, frame)
  if (!closed) p.problems.push(problem(line, 'unexpected'))
  return true
}

/** The swimlane or partition called `name`, made the first time it's named. */
function lane(p: ActivityParse, name: string): string {
  const label = unquote(name.trim())
  const found = p.nodes.find((n) => n.kind === 'partition' && (n.label ?? n.id) === label)
  if (found) return found.id
  const id = fresh(p, 'lane')
  p.nodes.push({ id, kind: 'partition', label })
  return id
}

function readFlowWord(p: ActivityParse, text: string, line: SourceLine): boolean {
  const word = text.toLowerCase()
  if (word === 'start') {
    p.tails = []
    addNode(p, 'start')
  } else if (word === 'stop' || word === 'end') {
    addNode(p, 'end')
    p.tails = []
  } else if (word === 'kill' || word === 'detach') {
    addNode(p, 'flowEnd')
    p.tails = []
  } else if (word === 'fork' || word === 'split') {
    const fork = addNode(p, 'fork')
    p.frames.push({ type: 'fork', fork, ends: [], line })
  } else if (word === 'fork again' || word === 'split again') {
    const frame = p.frames.at(-1)
    if (frame?.type !== 'fork') p.problems.push(problem(line, 'unexpected'))
    else {
      frame.ends.push(...p.tails)
      p.tails = [{ id: frame.fork }]
    }
  } else if (word === 'repeat') {
    p.frames.push({ type: 'repeat', merge: addNode(p, 'merge'), line })
  } else if (word === 'endif' || word === 'end if') closeIf(p, line)
  else return false
  return true
}

function readStructure(p: ActivityParse, text: string, line: SourceLine): boolean {
  const ifOpen = match(IF, text)
  if (ifOpen) {
    openIf(p, ifOpen, line)
    return true
  }
  const elseIf = match(ELSEIF, text)
  if (elseIf) {
    nextBranch(p, [elseIf[1], elseIf[2]].filter(Boolean).join(': '), line, false)
    return true
  }
  const elseBranch = match(ELSE, text)
  if (elseBranch) {
    nextBranch(p, elseBranch[1], line, true)
    return true
  }
  const loop = match(WHILE, text)
  if (loop) {
    const decision = addNode(p, 'decision', unquote(loop[1] ?? ''))
    p.frames.push({ type: 'while', decision, line })
    p.tails = [{ id: decision, ...guard(loop[2]) }]
    return true
  }
  const swim = match(LANE, text)
  if (swim) {
    p.lane = lane(p, swim[1] ?? '')
    return true
  }
  const group = match(PARTITION, text)
  if (group) {
    const id = lane(p, group[1] ?? '')
    p.frames.push({ type: 'partition', id, line })
    p.lane = id
    return true
  }
  return closeFrame(p, text, line) || readFlowWord(p, text, line)
}

function readNoteLine(p: ActivityParse, text: string): boolean {
  const last = p.nodes.at(-1)?.id
  if (p.note) {
    if (/^end\s*note$/i.test(text)) {
      p.notes.push({ text: p.note.lines.join('\n'), ...(last ? { for: last } : {}) })
      delete p.note
    } else p.note.lines.push(text)
    return true
  }
  const inline = match(NOTE_INLINE, text)
  if (inline) {
    p.notes.push({ text: unquote(inline[1] ?? ''), ...(last ? { for: last } : {}) })
    return true
  }
  if (NOTE_OPEN.test(text)) {
    p.note = { lines: [] }
    return true
  }
  return false
}

function readActivityLine(p: ActivityParse, line: SourceLine) {
  const { text } = line
  if (p.open) {
    p.open.lines.push(text.replace(/;$/, ''))
    if (text.endsWith(';')) {
      addNode(p, 'action', p.open.lines.join('\n'))
      delete p.open
    }
    return
  }
  if (readNoteLine(p, text)) return
  if (text.startsWith(':')) {
    const body = text.slice(1)
    if (/[;|<>\]}/]$/.test(body)) addNode(p, 'action', body.slice(0, -1).trim())
    else p.open = { lines: [body], line }
    return
  }
  const arrow = match(ARROW_LABEL, text)
  if (arrow) {
    const label = arrow[1]?.trim()
    if (label) p.tails = p.tails.map((t) => ({ ...t, label }))
    return
  }
  if (/^title\s+/i.test(text)) p.title = unquote(text.replace(/^title\s+/i, ''))
  else if (STYLING.test(text)) p.problems.push(problem(line, 'unsupported', 'warning'))
  else if (!readStructure(p, text, line)) p.problems.push(problem(line, 'syntax'))
}

function parsePlantActivity(lines: readonly SourceLine[], title?: string) {
  const p: ActivityParse = {
    nodes: [],
    flows: [],
    notes: [],
    problems: [],
    frames: [],
    tails: [],
    counter: {},
  }
  for (const line of lines) readActivityLine(p, line)
  if (p.open) p.problems.push(problem(p.open.line, 'unclosed'))
  for (const frame of p.frames) p.problems.push(problem(frame.line, 'unclosed'))
  const diagram: ActivityDiagram = {
    kind: 'activity',
    ...((p.title ?? title) ? { title: p.title ?? title } : {}),
    elements: p.nodes,
    relations: p.flows,
    ...(p.notes.length ? { notes: p.notes } : {}),
  }
  return { diagram, problems: p.problems }
}

/** True when a line only makes sense in an activity diagram. */
const ACTIVITY_LINE =
  /^(start|stop|end|kill|:.*[;|<>\]}/]?|if\s*\(.*|else\s*if\s*\(.*|endif|while\s*\(.*|endwhile.*|repeat(\s+while.*)?|fork( again)?|end\s*fork|\|[^|]+\|)$/i

// ── Writing ─────────────────────────────────────────────────────────────────────────────────────

/** The older syntax: `(*) --> "Action"`, `"A" -->[guard] "B"`, `===bar===` for fork and join. */
function activityToPlantUml(d: ActivityDiagram): string {
  const byId = new Map(d.elements.map((n) => [n.id, n]))
  const named = new Set<string>()
  const ref = (id: string, side: 'from' | 'to') => {
    const n = byId.get(id)
    if (!n) return id
    switch (n.kind) {
      case 'start':
        return side === 'from' ? '(*)' : `"${n.id}"`
      case 'end':
      case 'flowEnd':
        return side === 'to' ? '(*)' : `"${n.id}"`
      case 'fork':
      case 'join':
        return `===${n.id}===`
      default: {
        // The first mention names it; later ones use the id.
        if (named.has(n.id)) return n.id
        named.add(n.id)
        return `"${(n.label ?? n.id).replace(/"/g, "'").replace(/\r?\n/g, '\\n')}" as ${n.id}`
      }
    }
  }
  const lines = d.relations.map((r) => {
    const guard = r.label ? `[${r.label.replace(/^\[(.*)\]$/, '$1')}]` : ''
    return `${ref(r.from, 'from')} -->${guard} ${ref(r.to, 'to')}`
  })
  const title = d.title ? [`title ${d.title.replace(/\r?\n/g, ' ')}`] : []
  return ['@startuml', ...title, ...lines, '@enduml'].join('\n')
}

export { ACTIVITY_LINE, activityToPlantUml, parsePlantActivity }
