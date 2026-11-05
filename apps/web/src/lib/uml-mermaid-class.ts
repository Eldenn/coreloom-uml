import type {
  ClassDiagram,
  ClassMember,
  ClassRelation,
  ClassRelationKind,
  ClassVisibility,
  UmlClass,
  UmlDirection,
  UmlNote,
  UmlProblem,
} from '@/lib/uml'
import {
  type Groups,
  match,
  problem,
  quote,
  type SourceLine,
  STYLING,
  titleBlock,
  unquote,
} from '@/lib/uml-text'

const ID = '[A-Za-z_][\\w]*'
const GENERIC = '(?:~([^~]+)~)?'
const CLASS_DECL = new RegExp(
  `^class\\s+(${ID})${GENERIC}(?:\\["([^"]*)"\\])?(?::::\\w+)?\\s*(\\{)?\\s*(\\})?$`,
)
const RELATION = new RegExp(
  `^(${ID})(?:~[^~]*~)?\\s*(?:"([^"]*)"\\s*)?(<\\||\\*|o|<)?(--|\\.\\.)(\\|>|\\*|o|>)?\\s*(?:"([^"]*)"\\s*)?(${ID})(?:~[^~]*~)?\\s*(?::\\s*(.*))?$`,
)
const MEMBER = new RegExp(`^(${ID})\\s*:\\s*(.+)$`)
const ANNOTATION = new RegExp(`^<<\\s*([^>]+?)\\s*>>\\s+(${ID})$`)
const NOTE = new RegExp(`^note\\s+(?:for\\s+(${ID})\\s+)?"(.*)"$`)
const NAMESPACE = /^namespace\s+([\w.]+)\s*\{$/
const DIRECTION = /^direction\s+(TB|TD|BT|LR|RL)$/

const VISIBILITY: Partial<Record<string, ClassVisibility>> = {
  '+': 'public',
  '-': 'private',
  '#': 'protected',
  '~': 'package',
}
const SIGN: Record<ClassVisibility, string> = {
  public: '+',
  private: '-',
  protected: '#',
  package: '~',
}

type Scope =
  { type: 'class'; cls: UmlClass } | { type: 'namespace'; name: string; line: SourceLine }

interface ClassState {
  classes: Map<string, UmlClass>
  relations: ClassRelation[]
  notes: UmlNote[]
  problems: UmlProblem[]
  stack: (Scope & { line: SourceLine })[]
  direction?: UmlDirection
}

/** `+getName()$ String` → a method member: public, static, `getName() String`. */
function parseMember(input: string): ClassMember {
  let text = input.trim()
  const member: ClassMember = { text }
  const sign = text.charAt(0)
  const visibility = VISIBILITY[sign]
  if (visibility) {
    member.visibility = visibility
    text = text.slice(1).trim()
  }
  const classifier = match(/\)\s*([$*])/, text) ?? match(/([$*])$/, text)
  const [whole = '', mark] = classifier ?? []
  if (whole) {
    if (mark === '$') member.static = true
    else member.abstract = true
    text = text.replace(whole, whole.startsWith(')') ? ')' : '').trim()
  }
  member.text = text
  return member
}

function memberText(m: ClassMember): string {
  const sign = m.visibility ? SIGN[m.visibility] : ''
  let classifier = ''
  if (m.static) classifier = '$'
  else if (m.abstract) classifier = '*'
  if (!classifier) return `${sign}${m.text}`
  const close = m.text.indexOf(')')
  if (close < 0) return `${sign}${m.text}${classifier}`
  return `${sign}${m.text.slice(0, close + 1)}${classifier}${m.text.slice(close + 1)}`
}

const isMethod = (text: string) => text.includes('(')

function ensureClass(state: ClassState, id: string): UmlClass {
  let cls = state.classes.get(id)
  if (!cls) {
    cls = { id }
    const ns = [...state.stack].reverse().find((s) => s.type === 'namespace')
    if (ns?.type === 'namespace') cls.namespace = ns.name
    state.classes.set(id, cls)
  }
  return cls
}

function addMember(cls: UmlClass, raw: string) {
  const member = parseMember(raw)
  if (isMethod(member.text)) cls.methods = [...(cls.methods ?? []), member]
  else cls.attributes = [...(cls.attributes ?? []), member]
}

/** The relation kind from Mermaid's markers and line. */
function relationKind(marker: string, dashed: boolean): ClassRelationKind {
  switch (marker) {
    case '<|':
    case '|>':
      return dashed ? 'realization' : 'inheritance'
    case '*':
      return 'composition'
    case 'o':
      return 'aggregation'
    case '<':
    case '>':
      return dashed ? 'dependency' : 'association'
    default:
      return dashed ? 'dashedLink' : 'link'
  }
}

function readRelation(state: ClassState, line: SourceLine, m: Groups) {
  const [, a = '', aCard, left, lineType, right, bCard, b = '', label] = m
  if (left && right) state.problems.push(problem(line, 'unsupported', 'warning'))
  ensureClass(state, a)
  ensureClass(state, b)
  // The marker belongs to `to`: written on the left, the relation points from b to a.
  const markedLeft = Boolean(left) && !right
  const relation: ClassRelation = {
    from: markedLeft ? b : a,
    to: markedLeft ? a : b,
    kind: relationKind(right ?? left ?? '', lineType === '..'),
  }
  setCardinalities(relation, markedLeft ? [bCard, aCard] : [aCard, bCard])
  if (label?.trim()) relation.label = unquote(label)
  state.relations.push(relation)
}

function setCardinalities(relation: ClassRelation, [from, to]: (string | undefined)[]) {
  if (from) relation.fromCardinality = from
  if (to) relation.toCardinality = to
}

function readClassDecl(state: ClassState, line: SourceLine, m: Groups) {
  const [, id = '', generic, label, open, close] = m
  const cls = ensureClass(state, id)
  if (generic) cls.generic = generic
  if (label) cls.label = unquote(label)
  if (open && !close) state.stack.push({ type: 'class', cls, line })
}

function readNote(m: Groups): UmlNote {
  const text = (m[2] ?? '').replaceAll('\\n', '\n').replaceAll('#quot;', '"')
  return m[1] ? { text, for: m[1] } : { text }
}

function closeScope(state: ClassState, line: SourceLine) {
  if (!state.stack.pop()) state.problems.push(problem(line, 'unexpected'))
}

function readInsideClass(cls: UmlClass, line: SourceLine) {
  const stereotype = match(/^<<\s*([^>]+?)\s*>>$/, line.text)
  if (stereotype?.[1]) cls.stereotype = stereotype[1]
  else addMember(cls, line.text)
}

/** One line outside a class body. Returns false when nothing understood it. */
function readStatement(state: ClassState, line: SourceLine): boolean {
  const { text } = line
  let m: Groups | null
  if ((m = match(DIRECTION, text))) state.direction = m[1] === 'TD' ? 'TB' : (m[1] as UmlDirection)
  else if ((m = match(NAMESPACE, text)))
    state.stack.push({ type: 'namespace', name: m[1] ?? '', line })
  else if ((m = match(CLASS_DECL, text))) readClassDecl(state, line, m)
  else if ((m = match(ANNOTATION, text))) ensureClass(state, m[2] ?? '').stereotype = m[1] ?? ''
  else if ((m = match(NOTE, text))) state.notes.push(readNote(m))
  else if ((m = match(RELATION, text))) readRelation(state, line, m)
  else if ((m = match(MEMBER, text))) addMember(ensureClass(state, m[1] ?? ''), m[2] ?? '')
  else if (STYLING.test(text)) state.problems.push(problem(line, 'unsupported', 'warning'))
  else return false
  return true
}

/** The lines after `classDiagram`. */
function parseClassDiagram(
  lines: readonly SourceLine[],
  title?: string,
): { diagram: ClassDiagram; problems: UmlProblem[] } {
  const state: ClassState = {
    classes: new Map(),
    relations: [],
    notes: [],
    problems: [],
    stack: [],
  }
  for (const line of lines) {
    const top = state.stack.at(-1)
    if (line.text === '}') closeScope(state, line)
    else if (top?.type === 'class') readInsideClass(top.cls, line)
    else if (!readStatement(state, line)) state.problems.push(problem(line, 'syntax'))
  }
  for (const open of state.stack) state.problems.push(problem(open.line, 'unclosed'))
  const diagram: ClassDiagram = {
    kind: 'class',
    ...(title ? { title } : {}),
    ...(state.direction ? { direction: state.direction } : {}),
    classes: [...state.classes.values()],
    relations: state.relations,
    ...(state.notes.length ? { notes: state.notes } : {}),
  }
  return { diagram, problems: state.problems }
}

// ── Writing ─────────────────────────────────────────────────────────────────────────────────────

/** How each kind is written, with the marker on the `to` side. */
const ARROWS: Record<ClassRelationKind, { arrow: string; toFirst: boolean }> = {
  inheritance: { arrow: '<|--', toFirst: true },
  realization: { arrow: '<|..', toFirst: true },
  composition: { arrow: '*--', toFirst: true },
  aggregation: { arrow: 'o--', toFirst: true },
  association: { arrow: '-->', toFirst: false },
  dependency: { arrow: '..>', toFirst: false },
  link: { arrow: '--', toFirst: false },
  dashedLink: { arrow: '..', toFirst: false },
}

function relationLine(r: ClassRelation): string {
  const { arrow, toFirst } = ARROWS[r.kind]
  const end = (id: string, card: string | undefined, before: boolean) => {
    if (!card) return id
    return before ? `${id} ${quote(card)}` : `${quote(card)} ${id}`
  }
  const left = toFirst ? end(r.to, r.toCardinality, true) : end(r.from, r.fromCardinality, true)
  const right = toFirst ? end(r.from, r.fromCardinality, false) : end(r.to, r.toCardinality, false)
  return `${left} ${arrow} ${right}${r.label ? ` : ${r.label.replace(/\r?\n/g, ' ')}` : ''}`
}

function classLines(cls: UmlClass, indent: string): string[] {
  const head = `class ${cls.id}${cls.generic ? `~${cls.generic}~` : ''}${cls.label ? `[${quote(cls.label)}]` : ''}`
  const members = [...(cls.attributes ?? []), ...(cls.methods ?? [])]
  if (!members.length && !cls.stereotype) return [`${indent}${head}`]
  return [
    `${indent}${head} {`,
    ...(cls.stereotype ? [`${indent}  <<${cls.stereotype}>>`] : []),
    ...members.map((m) => `${indent}  ${memberText(m)}`),
    `${indent}}`,
  ]
}

/** The diagram as Mermaid `classDiagram` text. */
function classToMermaid(diagram: ClassDiagram): string {
  const out = [...titleBlock(diagram.title), 'classDiagram']
  if (diagram.direction && diagram.direction !== 'TB') out.push(`  direction ${diagram.direction}`)
  const namespaces = [
    ...new Set(diagram.classes.flatMap((c) => (c.namespace ? [c.namespace] : []))),
  ]
  for (const cls of diagram.classes.filter((c) => !c.namespace)) out.push(...classLines(cls, '  '))
  for (const ns of namespaces) {
    out.push(`  namespace ${ns} {`)
    for (const cls of diagram.classes.filter((c) => c.namespace === ns)) {
      out.push(...classLines(cls, '    '))
    }
    out.push('  }')
  }
  for (const r of diagram.relations) out.push(`  ${relationLine(r)}`)
  for (const n of diagram.notes ?? []) {
    out.push(`  note ${n.for ? `for ${n.for} ` : ''}${quote(n.text.replace(/\r?\n/g, '\\n'))}`)
  }
  return out.join('\n')
}

export { classToMermaid, memberText, parseClassDiagram, parseMember }
