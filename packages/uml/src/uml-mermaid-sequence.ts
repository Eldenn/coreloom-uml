import type {
  SequenceArrow,
  SequenceBlockKind,
  SequenceDiagram,
  SequenceParticipant,
  SequenceStep,
  UmlProblem,
} from './uml.ts'
import {
  type Groups,
  lineBreaks,
  match,
  oneLine,
  problem,
  type SourceLine,
  titleBlock,
} from './uml-text.ts'

const NAME = '[\\w.]+(?: [\\w.]+)*?'
const ARROW = '-->>|->>|--x|-x|--\\)|-\\)|-->|->'
const MESSAGE = new RegExp(`^(${NAME})\\s*(${ARROW})\\s*([+-]?)\\s*(${NAME})\\s*:(.*)$`)
const PARTICIPANT = /^(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/
const NOTE = /^note\s+(left of|right of|over)\s+([^:]+?)\s*:(.*)$/i
const ACTIVATION = /^(activate|deactivate)\s+(.+)$/
const BLOCK = /^(loop|alt|opt|par|critical|break)(?:\s+(.*))?$/
const SECTION = /^(else|and|option)(?:\s+(.*))?$/
const PASS_THROUGH = /^(box|rect)\b/

const ARROWS: Partial<Record<string, SequenceArrow>> = {
  '->>': 'sync',
  '-->>': 'reply',
  '->': 'line',
  '-->': 'dottedLine',
  '-x': 'lost',
  '--x': 'dottedLost',
  '-)': 'async',
  '--)': 'dottedAsync',
}

/** A block being read: its kind, its sections, and the line that opened it. */
type Frame =
  | {
      type: 'block'
      kind: SequenceBlockKind
      sections: { label: string; steps: SequenceStep[] }[]
      line: SourceLine
    }
  | { type: 'pass'; line: SourceLine }

interface SequenceParse {
  participants: Map<string, SequenceParticipant>
  steps: SequenceStep[]
  problems: UmlProblem[]
  stack: Frame[]
  title?: string
  autonumber?: boolean
}

function ensureParticipant(p: SequenceParse, id: string): void {
  if (!p.participants.has(id)) p.participants.set(id, { id })
}

/** Where the next step goes: the innermost block's current section, or the diagram. */
function target(p: SequenceParse): SequenceStep[] {
  const block = [...p.stack].reverse().find((f) => f.type === 'block')
  return block?.type === 'block' ? (block.sections.at(-1)?.steps ?? p.steps) : p.steps
}

function readMessage(p: SequenceParse, m: Groups) {
  const [, from = '', arrow = '', sign, to = '', text = ''] = m
  ensureParticipant(p, from.trim())
  ensureParticipant(p, to.trim())
  target(p).push({
    type: 'message',
    from: from.trim(),
    to: to.trim(),
    text: lineBreaks(text.trim()),
    arrow: ARROWS[arrow] ?? 'sync',
    ...(sign === '+' ? { activate: true } : {}),
    ...(sign === '-' ? { deactivate: true } : {}),
  })
}

function readParticipant(p: SequenceParse, m: Groups) {
  const [, kind, id = '', label] = m
  p.participants.set(id.trim(), {
    id: id.trim(),
    ...(label ? { label: lineBreaks(label.trim()) } : {}),
    ...(kind === 'actor' ? { kind: 'actor' as const } : {}),
  })
}

function notePosition(where: string): 'left' | 'right' | 'over' {
  const w = where.toLowerCase()
  if (w.startsWith('left')) return 'left'
  if (w.startsWith('right')) return 'right'
  return 'over'
}

function readNote(p: SequenceParse, m: Groups) {
  const [, where = '', who = '', text = ''] = m
  const participants = who
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2)
  for (const id of participants) ensureParticipant(p, id)
  target(p).push({
    type: 'note',
    position: notePosition(where),
    participants,
    text: lineBreaks(text.trim()),
  })
}

function readSection(p: SequenceParse, line: SourceLine, label: string) {
  const top = p.stack.at(-1)
  if (top?.type !== 'block') {
    p.problems.push(problem(line, 'unexpected'))
    return
  }
  top.sections.push({ label, steps: [] })
}

function closeFrame(p: SequenceParse, line: SourceLine) {
  const top = p.stack.pop()
  if (!top) {
    p.problems.push(problem(line, 'unexpected'))
    return
  }
  if (top.type === 'block')
    target(p).push({ type: 'block', kind: top.kind, sections: top.sections })
}

function readActivation(p: SequenceParse, m: Groups) {
  const participant = (m[2] ?? '').trim()
  ensureParticipant(p, participant)
  target(p).push({ type: 'activation', participant, active: m[1] === 'activate' })
}

function openBlock(p: SequenceParse, m: Groups, line: SourceLine) {
  const kind = m[1] as SequenceBlockKind
  p.stack.push({ type: 'block', kind, sections: [{ label: m[2]?.trim() ?? '', steps: [] }], line })
}

function readStatement(p: SequenceParse, line: SourceLine): boolean {
  const { text } = line
  let m: Groups | null
  if ((m = match(MESSAGE, text))) readMessage(p, m)
  else if ((m = match(PARTICIPANT, text))) readParticipant(p, m)
  else if ((m = match(NOTE, text))) readNote(p, m)
  else if ((m = match(ACTIVATION, text))) readActivation(p, m)
  else if ((m = match(BLOCK, text))) openBlock(p, m, line)
  else if ((m = match(SECTION, text))) readSection(p, line, m[2]?.trim() ?? '')
  else if (text === 'end') closeFrame(p, line)
  else if (text === 'autonumber') p.autonumber = true
  else if (/^title\b/.test(text)) p.title = text.replace(/^title\s*:?\s*/, '')
  else if (PASS_THROUGH.test(text)) {
    p.stack.push({ type: 'pass', line })
    p.problems.push(problem(line, 'unsupported', 'warning'))
  } else return false
  return true
}

/** The lines after `sequenceDiagram`. */
function parseSequenceDiagram(
  lines: readonly SourceLine[],
  title?: string,
): { diagram: SequenceDiagram; problems: UmlProblem[] } {
  const p: SequenceParse = { participants: new Map(), steps: [], problems: [], stack: [] }
  if (title) p.title = title
  for (const line of lines) {
    if (!readStatement(p, line)) p.problems.push(problem(line, 'syntax'))
  }
  // An unclosed block still shows what was read inside it.
  while (p.stack.length) {
    const open = p.stack.at(-1)
    if (open) p.problems.push(problem(open.line, 'unclosed'))
    closeFrame(p, open?.line ?? { no: 0, text: '' })
  }
  const diagram: SequenceDiagram = {
    kind: 'sequence',
    ...(p.title ? { title: p.title } : {}),
    ...(p.autonumber ? { autonumber: true } : {}),
    participants: [...p.participants.values()],
    steps: p.steps,
  }
  return { diagram, problems: p.problems }
}

// ── Writing ─────────────────────────────────────────────────────────────────────────────────────

const ARROW_OF = Object.fromEntries(Object.entries(ARROWS).map(([k, v]) => [v, k])) as Record<
  SequenceArrow,
  string
>
const SECTION_WORD: Record<SequenceBlockKind, string> = {
  loop: 'else',
  alt: 'else',
  opt: 'else',
  par: 'and',
  critical: 'option',
  break: 'else',
}

function activationSign(step: { activate?: boolean; deactivate?: boolean }): string {
  if (step.activate) return '+'
  if (step.deactivate) return '-'
  return ''
}

function stepLines(step: SequenceStep, indent: string): string[] {
  switch (step.type) {
    case 'message': {
      return [
        `${indent}${step.from}${ARROW_OF[step.arrow]}${activationSign(step)}${step.to}: ${oneLine(step.text)}`,
      ]
    }
    case 'note': {
      const where = step.position === 'over' ? 'over' : `${step.position} of`
      return [`${indent}Note ${where} ${step.participants.join(',')}: ${oneLine(step.text)}`]
    }
    case 'activation':
      return [`${indent}${step.active ? 'activate' : 'deactivate'} ${step.participant}`]
    case 'block':
      return [
        ...step.sections.flatMap((section, i) => [
          `${indent}${i === 0 ? step.kind : SECTION_WORD[step.kind]}${section.label ? ` ${oneLine(section.label)}` : ''}`,
          ...section.steps.flatMap((s) => stepLines(s, `${indent}  `)),
        ]),
        `${indent}end`,
      ]
  }
}

/** The diagram as Mermaid `sequenceDiagram` text. */
function sequenceToMermaid(diagram: SequenceDiagram): string {
  const out = [...titleBlock(diagram.title), 'sequenceDiagram']
  if (diagram.autonumber) out.push('  autonumber')
  for (const p of diagram.participants) {
    out.push(`  ${p.kind ?? 'participant'} ${p.id}${p.label ? ` as ${oneLine(p.label)}` : ''}`)
  }
  out.push(...diagram.steps.flatMap((s) => stepLines(s, '  ')))
  return out.join('\n')
}

export { parseSequenceDiagram, sequenceToMermaid }
