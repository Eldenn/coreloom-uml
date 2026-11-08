import type {
  C4Boundary,
  C4Diagram,
  C4Element,
  C4ElementKind,
  C4Level,
  C4Relation,
  UmlProblem,
} from './uml.ts'
import { type Groups, macroArgs, match, problem, quote, type SourceLine } from './uml-text.ts'

const MACRO = /^(\w+)\s*\((.*)\)\s*(\{)?$/
const HEADERS: Partial<Record<string, C4Level>> = {
  C4Context: 'context',
  C4Container: 'container',
  C4Component: 'component',
}

/** `SystemDb_Ext` → a system, drawn as a database, external. */
function elementMacro(name: string): Pick<C4Element, 'kind' | 'shape' | 'external'> | null {
  const m = match(/^(Person|System|Container|Component)(Db|Queue)?(_Ext)?$/, name)
  if (!m) return null
  const kind = (m[1] ?? 'system').toLowerCase() as C4ElementKind
  // People are never databases or queues.
  if (kind === 'person' && m[2]) return null
  const shape = m[2] === 'Db' ? ('database' as const) : ('queue' as const)
  return {
    kind,
    ...(m[2] ? { shape } : {}),
    ...(m[3] ? { external: true } : {}),
  }
}

const BOUNDARIES: Partial<Record<string, NonNullable<C4Boundary['kind']>>> = {
  Enterprise_Boundary: 'enterprise',
  System_Boundary: 'system',
  Container_Boundary: 'container',
  Boundary: 'boundary',
}
const RELATIONS =
  /^(Rel|BiRel|Rel_U|Rel_Up|Rel_D|Rel_Down|Rel_L|Rel_Left|Rel_R|Rel_Right|Rel_Back)$/
const STYLE_MACROS =
  /^(UpdateElementStyle|UpdateRelStyle|UpdateLayoutConfig|UpdateBoundaryStyle|AddElementTag|AddRelTag|AddBoundaryTag|Lay_\w+)$/

interface C4Parse {
  elements: C4Element[]
  boundaries: C4Boundary[]
  relations: C4Relation[]
  problems: UmlProblem[]
  stack: { id: string; line: SourceLine }[]
  /** A boundary whose `{` is on the next line. */
  pending?: { id: string; line: SourceLine }
  title?: string
}

function addElement(p: C4Parse, shape: ReturnType<typeof elementMacro>, args: string[]) {
  if (!shape) return
  const [id = '', label = '', third, fourth] = args
  const hasTechnology = shape.kind === 'container' || shape.kind === 'component'
  const technology = hasTechnology ? third : undefined
  const description = hasTechnology ? fourth : third
  const boundary = p.stack.at(-1)?.id
  p.elements.push({
    id,
    label: label || id,
    ...shape,
    ...(technology ? { technology } : {}),
    ...(description ? { description } : {}),
    ...(boundary ? { boundary } : {}),
  })
}

function addBoundary(
  p: C4Parse,
  kind: NonNullable<C4Boundary['kind']>,
  args: string[],
  line: SourceLine,
) {
  const [id = '', label = ''] = args
  const parent = p.stack.at(-1)?.id
  p.boundaries.push({
    id,
    label: label || id,
    ...(kind !== 'boundary' ? { kind } : {}),
    ...(parent ? { parent } : {}),
  })
  return { id, line }
}

function addRelation(p: C4Parse, macro: string, args: string[]) {
  const [from = '', to = '', label, technology] = args
  p.relations.push({
    from,
    to,
    ...(label ? { label } : {}),
    ...(technology ? { technology } : {}),
    ...(macro === 'BiRel' ? { bidirectional: true } : {}),
  })
}

function readMacro(p: C4Parse, line: SourceLine, m: Groups): boolean {
  const [, name = '', rawArgs = '', open] = m
  const args = macroArgs(rawArgs)
  const boundary = BOUNDARIES[name]
  if (boundary) {
    const frame = addBoundary(p, boundary, args, line)
    if (open) p.stack.push(frame)
    else p.pending = frame
  } else if (elementMacro(name)) addElement(p, elementMacro(name), args)
  else if (RELATIONS.test(name)) addRelation(p, name, args)
  else if (STYLE_MACROS.test(name)) p.problems.push(problem(line, 'unsupported', 'warning'))
  else return false
  return true
}

function readLine(p: C4Parse, line: SourceLine) {
  const m = match(MACRO, line.text)
  if (line.text === '{' && p.pending) {
    p.stack.push(p.pending)
    delete p.pending
  } else if (line.text === '}') {
    if (!p.stack.pop()) p.problems.push(problem(line, 'unexpected'))
  } else if (/^title\b/.test(line.text)) p.title = line.text.replace(/^title\s*/, '')
  else if (!m || !readMacro(p, line, m)) p.problems.push(problem(line, 'syntax'))
}

/** The C4 level a header line names, or null. */
function c4Level(header: string): C4Level | null {
  return HEADERS[header] ?? null
}

/** The lines after `C4Context`, `C4Container` or `C4Component`. */
function parseC4Diagram(
  level: C4Level,
  lines: readonly SourceLine[],
  title?: string,
): { diagram: C4Diagram; problems: UmlProblem[] } {
  const p: C4Parse = { elements: [], boundaries: [], relations: [], problems: [], stack: [] }
  if (title) p.title = title
  for (const line of lines) readLine(p, line)
  for (const open of p.stack) p.problems.push(problem(open.line, 'unclosed'))
  const diagram: C4Diagram = {
    kind: 'c4',
    level,
    ...(p.title ? { title: p.title } : {}),
    elements: p.elements,
    ...(p.boundaries.length ? { boundaries: p.boundaries } : {}),
    relations: p.relations,
  }
  return { diagram, problems: p.problems }
}

// ── Writing ─────────────────────────────────────────────────────────────────────────────────────

const HEADER_OF: Record<C4Level, string> = {
  context: 'C4Context',
  container: 'C4Container',
  component: 'C4Component',
}
const BOUNDARY_OF: Record<NonNullable<C4Boundary['kind']>, string> = {
  enterprise: 'Enterprise_Boundary',
  system: 'System_Boundary',
  container: 'Container_Boundary',
  boundary: 'Boundary',
}

const flat = (value: string) => quote(value.replace(/\r?\n/g, ' '))

function elementLine(e: C4Element): string {
  const kind = e.kind.charAt(0).toUpperCase() + e.kind.slice(1)
  let variant = ''
  if (e.shape === 'database') variant = 'Db'
  if (e.shape === 'queue') variant = 'Queue'
  if (e.kind === 'person') variant = ''
  const macro = `${kind}${variant}${e.external ? '_Ext' : ''}`
  const hasTechnology = e.kind === 'container' || e.kind === 'component'
  const args = [e.id, flat(e.label)]
  if (hasTechnology) args.push(flat(e.technology ?? ''))
  if (e.description) args.push(flat(e.description))
  // Trailing empty technology adds nothing.
  if (hasTechnology && !e.description && !e.technology) args.pop()
  return `${macro}(${args.join(', ')})`
}

function scopeLines(diagram: C4Diagram, scope: string | undefined, indent: string): string[] {
  const out: string[] = []
  for (const e of diagram.elements.filter((x) => x.boundary === scope))
    out.push(indent + elementLine(e))
  for (const b of (diagram.boundaries ?? []).filter((x) => x.parent === scope)) {
    out.push(`${indent}${BOUNDARY_OF[b.kind ?? 'boundary']}(${b.id}, ${flat(b.label)}) {`)
    out.push(...scopeLines(diagram, b.id, `${indent}  `), `${indent}}`)
  }
  return out
}

/** The diagram as Mermaid C4 text. */
function c4ToMermaid(diagram: C4Diagram): string {
  const out = [HEADER_OF[diagram.level]]
  if (diagram.title) out.push(`  title ${diagram.title.replace(/\r?\n/g, ' ')}`)
  out.push(...scopeLines(diagram, undefined, '  '))
  for (const r of diagram.relations) {
    const args = [r.from, r.to, flat(r.label ?? '')]
    if (r.technology) args.push(flat(r.technology))
    out.push(`  ${r.bidirectional ? 'BiRel' : 'Rel'}(${args.join(', ')})`)
  }
  return out.join('\n')
}

export { c4Level, c4ToMermaid, parseC4Diagram }
