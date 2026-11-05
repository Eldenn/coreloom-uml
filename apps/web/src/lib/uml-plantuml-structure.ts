import type { UmlProblem } from '@/lib/uml'
import type {
  ComponentDiagram,
  ComponentElement,
  ComponentElementKind,
  ComponentRelation,
  PackageDiagram,
  PackageElement,
  PackageElementKind,
  PackageRelation,
} from '@/lib/uml-elements'
import {
  arrowOf,
  commonLine,
  declaration,
  directionLine,
  type ElementParse,
  END,
  idOf,
  keyword,
  LINE,
  notesText,
  readNamed,
  STEREOTYPE,
  wrap,
} from '@/lib/uml-plantuml-elements'
import { match, problem, type SourceLine } from '@/lib/uml-text'

/** `name <<stereotype>> {`: the name and alias, the stereotype, and whether it opens a block. */
function declared(text: string) {
  const stereotype = STEREOTYPE.exec(text)?.[1]
  const named = readNamed(text.replace(STEREOTYPE, '').replace(/#\w+/g, '').trim())
  return { named, stereotype, opens: /\{\s*$/.test(text) }
}

/** A new element at the current block, or null when the line names nothing. */
function declare<E extends { id: string; parent?: string }>(
  p: ElementParse<E>,
  line: SourceLine,
  text: string,
  make: (base: { id: string; label?: string; stereotype?: string; parent?: string }) => E,
): boolean {
  const { named, stereotype, opens } = declared(text)
  if (!named) {
    p.problems.push(problem(line, 'syntax'))
    return true
  }
  const parent = p.stack.at(-1)?.id
  p.elements.set(
    named.id,
    make({
      id: named.id,
      ...(named.label ? { label: named.label } : {}),
      ...(stereotype ? { stereotype } : {}),
      ...(parent ? { parent } : {}),
    }),
  )
  if (opens) p.stack.push({ id: named.id, line })
  return true
}

function start<E>(): ElementParse<E> {
  return { elements: new Map(), problems: [], notes: [], stack: [] }
}

/** The fields every element diagram has, from what the lines said. */
function finish<E, K extends 'component' | 'package'>(p: ElementParse<E>, kind: K) {
  for (const open of p.stack) p.problems.push(problem(open.line, 'unclosed'))
  return {
    kind,
    ...(p.title ? { title: p.title } : {}),
    ...(p.direction ? { direction: p.direction } : {}),
    elements: [...p.elements.values()],
    ...(p.notes.length ? { notes: p.notes } : {}),
  }
}

// ── Component ───────────────────────────────────────────────────────────────────────────────────

/** Words that open a component, and the groupings read as one (with the word as stereotype). */
const COMPONENT_DECL =
  /^(component|interface|port|portin|portout|package|node|folder|frame|cloud|rectangle|database)\s+(.+)$/i
const LOLLIPOP = /^\(\)\s*(.+)$/
/** `A -( I`, `I )- A`, `A -(0)- B`, `A -(0- B`, `A -0)- B`, with a label after `:`. */
const SOCKET = new RegExp(
  String.raw`^(${END})\s*(-*)(\(0\)|\(0|0\)|\(|\))(-*)\s*(${END})\s*(?::\s*(.*))?$`,
)

function componentKind(word: string): ComponentElementKind {
  if (word === 'interface') return 'interface'
  return word.startsWith('port') ? 'port' : 'component'
}

function declareComponent(p: ElementParse<ComponentElement>, line: SourceLine): boolean {
  const lollipop = match(LOLLIPOP, line.text)
  if (lollipop) {
    return declare(p, line, lollipop[1] ?? '', (base) => ({ ...base, kind: 'interface' }))
  }
  const decl = match(COMPONENT_DECL, line.text)
  if (!decl) return false
  const word = (decl[1] ?? '').toLowerCase()
  const kind = componentKind(word)
  // A grouping is a component that holds others, and says what it was in its stereotype.
  const grouping = kind === 'component' && word !== 'component' && word !== 'rectangle'
  return declare(p, line, decl[2] ?? '', (base) => ({
    ...(grouping && !base.stereotype ? { stereotype: word } : {}),
    ...base,
    kind,
  }))
}

function componentEnd(p: ElementParse<ComponentElement>, text: string): string {
  const named = readNamed(text)
  const id = named?.id ?? idOf(text)
  if (!p.elements.has(id)) {
    const parent = p.stack.at(-1)?.id
    p.elements.set(id, {
      id,
      kind: 'component',
      ...(named?.label ? { label: named.label } : {}),
      ...(parent ? { parent } : {}),
    })
  }
  return id
}

/** The relation a ball-and-socket line draws: `-(0)-` wires two components, `-(` requires. */
function socketRelation(
  p: ElementParse<ComponentElement>,
  m: readonly (string | undefined)[],
): ComponentRelation {
  const left = componentEnd(p, m[1] ?? '')
  const right = componentEnd(p, m[5] ?? '')
  const token = m[3] ?? ''
  const label = m[6]?.trim() ? { label: m[6].trim() } : {}
  if (token.includes('0')) return { from: left, to: right, kind: 'assembly', ...label }
  // The socket is on the side of the one that requires: `A -( I`, or `I )- A`.
  const [from, to] = token === '(' ? [left, right] : [right, left]
  return { from, to, kind: 'require', ...label }
}

function lineRelation(
  p: ElementParse<ComponentElement>,
  m: readonly (string | undefined)[],
): ComponentRelation {
  let from = componentEnd(p, m[1] ?? '')
  let to = componentEnd(p, m[6] ?? '')
  const said = keyword(m[7], ['delegate'])
  const label = said.label ? { label: said.label } : {}
  const arrow = arrowOf(m)
  const head = Boolean(m[5] ?? m[2])
  if (said.word === 'delegate') return { from, to, kind: 'delegate', ...label }
  if (arrow.dotted) return { from, to, ...label }
  const kindOf = (id: string) => p.elements.get(id)?.kind
  if (!head && (kindOf(from) === 'interface' || kindOf(to) === 'interface')) {
    // A component provides the interface, whichever way round the line was written.
    if (kindOf(from) === 'interface') [from, to] = [to, from]
    return { from, to, kind: 'provide', ...label }
  }
  if (kindOf(from) === 'port' || kindOf(to) === 'port')
    return { from, to, kind: 'delegate', ...label }
  return { from, to, kind: head ? 'dependency' : 'assembly', ...label }
}

function readComponentLine(
  p: ElementParse<ComponentElement>,
  relations: ComponentRelation[],
  line: SourceLine,
) {
  if (commonLine(p, line) || declareComponent(p, line)) return
  const socket = match(SOCKET, line.text)
  // A socket needs a line on one side at least: `A -( I`, `I )- A`.
  const dashes = `${socket?.[2] ?? ''}${socket?.[4] ?? ''}`
  if (socket && dashes) return void relations.push(socketRelation(p, socket))
  const m = match(LINE, line.text)
  if (m) return void relations.push(lineRelation(p, m))
  // `[Name]` alone declares a component.
  const named = line.text.startsWith('[') ? readNamed(line.text) : null
  if (named && !named.rest) componentEnd(p, line.text)
  else p.problems.push(problem(line, 'syntax'))
}

function parsePlantComponent(lines: readonly SourceLine[]): {
  diagram: ComponentDiagram
  problems: UmlProblem[]
} {
  const p = start<ComponentElement>()
  const relations: ComponentRelation[] = []
  for (const line of lines) readComponentLine(p, relations, line)
  // A dependency is the usual kind and goes unsaid.
  const kept = relations.map((r) => {
    if (r.kind !== 'dependency') return r
    const { kind: _k, ...rest } = r
    return rest
  })
  return { diagram: { ...finish(p, 'component'), relations: kept }, problems: p.problems }
}

const COMPONENT_LINES: Record<NonNullable<ComponentRelation['kind']>, string> = {
  dependency: '..>',
  provide: '--',
  require: '-(',
  assembly: '-(0)-',
  delegate: '-->',
}

function componentToPlantUml(d: ComponentDiagram): string {
  const ids = new Set(d.elements.map((e) => e.id))
  const stereo = (e: ComponentElement) => (e.stereotype ? ` <<${e.stereotype}>>` : '')
  const scope = (parent: string | undefined, pad: string): string[] =>
    d.elements
      .filter((e) => (parent === undefined ? !e.parent || !ids.has(e.parent) : e.parent === parent))
      .flatMap((e) => {
        const inner = scope(e.id, `${pad}  `)
        const head = `${pad}${declaration(e.kind, e, stereo(e))}`
        return inner.length ? [`${head} {`, ...inner, `${pad}}`] : [head]
      })
  const lines = d.relations.map((r) => {
    const kind = r.kind ?? 'dependency'
    const text = [kind === 'delegate' ? '<<delegate>>' : '', r.label?.replace(/\r?\n/g, '\\n')]
      .filter(Boolean)
      .join(' ')
    return `${r.from} ${COMPONENT_LINES[kind]} ${r.to}${text ? ` : ${text}` : ''}`
  })
  return wrap(d.title, [
    ...directionLine(d.direction, 'LR'),
    ...scope(undefined, ''),
    ...lines,
    ...notesText(d.notes),
  ])
}

// ── Package ─────────────────────────────────────────────────────────────────────────────────────

const PACKAGE_DECL =
  /^(package|namespace|folder|(?:abstract\s+)?class|interface|enum|component)\s+(.+)$/i

function packageKind(word: string): PackageElementKind {
  const w = word.toLowerCase()
  if (w === 'interface' || w === 'component') return w
  return w.endsWith('class') || w === 'enum' ? 'class' : 'package'
}

function declarePackage(p: ElementParse<PackageElement>, line: SourceLine): boolean {
  const decl = match(PACKAGE_DECL, line.text)
  if (decl) {
    const kind = packageKind(decl[1] ?? '')
    const enumeration = (decl[1] ?? '').toLowerCase() === 'enum'
    return declare(p, line, decl[2] ?? '', (base) => ({
      ...(enumeration && !base.stereotype ? { stereotype: 'enumeration' } : {}),
      ...base,
      kind,
    }))
  }
  if (!line.text.startsWith('[')) return false
  return declare(p, line, line.text, (base) => ({ ...base, kind: 'component' }))
}

function packageEnd(p: ElementParse<PackageElement>, text: string): string {
  const named = readNamed(text)
  const id = named?.id ?? idOf(text)
  if (!p.elements.has(id)) {
    p.elements.set(id, {
      id,
      kind: text.startsWith('[') ? 'component' : 'package',
      ...(named?.label ? { label: named.label } : {}),
    })
  }
  return id
}

function readPackageLine(
  p: ElementParse<PackageElement>,
  relations: PackageRelation[],
  line: SourceLine,
) {
  if (commonLine(p, line) || declarePackage(p, line)) return
  const m = match(LINE, line.text)
  if (!m) return void p.problems.push(problem(line, 'syntax'))
  const from = packageEnd(p, m[1] ?? '')
  const to = packageEnd(p, m[6] ?? '')
  const said = keyword(m[7], ['import', 'merge'])
  const label = said.label ? { label: said.label } : {}
  if (said.word === 'import' || said.word === 'merge') {
    relations.push({ from, to, kind: said.word, ...label })
  } else relations.push({ from, to, ...label })
}

function parsePlantPackage(lines: readonly SourceLine[]): {
  diagram: PackageDiagram
  problems: UmlProblem[]
} {
  const p = start<PackageElement>()
  const relations: PackageRelation[] = []
  for (const line of lines) readPackageLine(p, relations, line)
  return { diagram: { ...finish(p, 'package'), relations }, problems: p.problems }
}

function packageToPlantUml(d: PackageDiagram): string {
  const ids = new Set(d.elements.map((e) => e.id))
  const stereo = (e: PackageElement) => (e.stereotype ? ` <<${e.stereotype}>>` : '')
  const scope = (parent: string | undefined, pad: string): string[] =>
    d.elements
      .filter((e) => (parent === undefined ? !e.parent || !ids.has(e.parent) : e.parent === parent))
      .flatMap((e) => {
        const inner = scope(e.id, `${pad}  `)
        const head = `${pad}${declaration(e.kind, e, stereo(e))}`
        // An empty package still opens a block, so it reads back as a package.
        if (e.kind === 'package') return [`${head} {`, ...inner, `${pad}}`]
        return [head]
      })
  const lines = d.relations.map((r) => {
    const text = [r.kind && r.kind !== 'dependency' ? `<<${r.kind}>>` : '', r.label]
      .filter(Boolean)
      .join(' ')
      .replace(/\r?\n/g, '\\n')
    return `${r.from} ..> ${r.to}${text ? ` : ${text}` : ''}`
  })
  return wrap(d.title, [
    ...directionLine(d.direction, 'TB'),
    ...scope(undefined, ''),
    ...lines,
    ...notesText(d.notes),
  ])
}

export { componentToPlantUml, packageToPlantUml, parsePlantComponent, parsePlantPackage }
