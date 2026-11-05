import type { UmlDirection, UmlNote, UmlProblem } from '@/lib/uml'
import type {
  DeploymentDiagram,
  DeploymentNode,
  DeploymentNodeKind,
  DeploymentRelation,
  UseCaseDiagram,
  UseCaseElement,
  UseCaseRelation,
} from '@/lib/uml-elements'
import { match, problem, type SourceLine, unquote } from '@/lib/uml-text'

/** `"Long name" as id`, `id as "Long name"`, `:Long name: as id`, `(Name) as id`, or `id`. */
const NAMED =
  /^(?:"([^"]*)"|:([^:]+):|\(([^)]+)\)|\[([^\]]+)\]|([\w.]+))(?:\s+as\s+(?:"([^"]*)"|([\w.]+)))?/

/** An end of a line: an id, a quoted name, `(Use case)`, `:Actor:` or `[Component]`. */
const END = String.raw`(?:"[^"]*"|:[^:]+:|\([^)]+\)|\[[^\]]+\]|[\w.]+)`
/** `-->`, `--`, `..>`, `.>`, `<|--`, `--|>`, `-up->`, `-[#red]->`, with a label after `:`. */
const ARROW = String.raw`(<\|?|\*|o)?([-.]+)(?:\[[^\]]*\])?(?:up|down|left|right|u|d|l|r)?([-.]*)(\|?>|\*|o)?`
const LINE = new RegExp(String.raw`^(${END})\s*${ARROW}\s*(${END})\s*(?::\s*(.*))?$`)

const NOTE = /^note\s+(left|right|top|bottom)\s+of\s+([\w.]+)\s*:\s*(.+)$/i
const STYLING = /^(skinparam|hide|show|!|scale|caption|legend|footer|header|sprite|allowmixing)/i

/** A name as an id: letters, digits and `_`. */
function idOf(name: string): string {
  const id = name
    .trim()
    .replace(/[^\w.]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return id || 'element'
}

interface Named {
  id: string
  label?: string
  rest: string
}

/** Reads a name and its alias at the start of `text`, and what follows. */
function readNamed(text: string): Named | null {
  const m = match(NAMED, text)
  if (!m) return null
  const [whole = '', quoted, colon, paren, bracket, bare, aliasQuoted, alias] = m
  const written = quoted ?? colon ?? paren ?? bracket
  const rest = text.slice(whole.length).trim()
  // `id as "Long name"`: the bare word is the id, the quoted one the name.
  if (bare && aliasQuoted !== undefined) return { id: bare, label: aliasQuoted, rest }
  const id = alias ?? (written === undefined ? (bare ?? '') : idOf(written))
  const label = written ?? aliasQuoted
  return { id, ...(label && label !== id ? { label } : {}), rest }
}

/** `<<include>>` (or `include`) in a label: the keyword, and the label without it. */
function keyword(label: string | undefined, words: readonly string[]) {
  const text = (label ?? '').trim()
  const m = /<<\s*([\w ]+?)\s*>>/.exec(text)
  const word = (m?.[1] ?? text).toLowerCase()
  if (!words.includes(word)) return { label: text }
  return { word, label: m ? text.replace(m[0], '').trim() : '' }
}

/** What a line's arrow says: dotted, and which end has a triangle. */
function arrowOf(m: readonly (string | undefined)[]) {
  const [, , left, body = '', tail = '', right] = m
  return {
    dotted: (body + tail).includes('.'),
    triangleAtFrom: left === '<|',
    triangleAtTo: right === '|>',
  }
}

interface ElementParse<E> {
  elements: Map<string, E>
  problems: UmlProblem[]
  notes: UmlNote[]
  stack: { id: string; line: SourceLine }[]
  direction?: UmlDirection
  title?: string
}

function commonLine(p: ElementParse<unknown>, line: SourceLine): boolean {
  const { text } = line
  if (/^left to right direction$/i.test(text)) p.direction = 'LR'
  else if (/^top to bottom direction$/i.test(text)) p.direction = 'TB'
  else if (/^title\s+/i.test(text)) p.title = unquote(text.replace(/^title\s+/i, ''))
  else if (text === '}') {
    if (!p.stack.pop()) p.problems.push(problem(line, 'unexpected'))
  } else if (STYLING.test(text)) p.problems.push(problem(line, 'unsupported', 'warning'))
  else {
    const note = match(NOTE, text)
    if (!note) return false
    p.notes.push({ text: unquote(note[3] ?? '').replace(/\\n/g, '\n'), for: note[2] ?? '' })
  }
  return true
}

// ── Use case ────────────────────────────────────────────────────────────────────────────────────

const USECASE_DECL = /^(actor|usecase|rectangle|package|frame)\s+(.+?)\s*(\{)?$/i

function usecaseEnd(p: ElementParse<UseCaseElement>, text: string): string {
  const named = readNamed(text)
  const id = named?.id ?? idOf(text)
  if (!p.elements.has(id)) {
    const kind = text.startsWith(':') ? 'actor' : 'usecase'
    const parent = kind === 'usecase' ? p.stack.at(-1)?.id : undefined
    p.elements.set(id, {
      id,
      kind,
      ...(named?.label ? { label: named.label } : {}),
      ...(parent ? { parent } : {}),
    })
  }
  return id
}

/** `actor Clerk`, `usecase "Pay" as UC2`, `rectangle Shop {`: true when the line declared one. */
function declareUseCase(p: ElementParse<UseCaseElement>, line: SourceLine): boolean {
  const decl = match(USECASE_DECL, line.text)
  if (!decl) return false
  const word = (decl[1] ?? '').toLowerCase()
  const named = readNamed(decl[2] ?? '')
  if (!named) {
    p.problems.push(problem(line, 'syntax'))
    return true
  }
  const kind = word === 'actor' || word === 'usecase' ? word : 'system'
  const parent = kind === 'usecase' ? p.stack.at(-1)?.id : undefined
  p.elements.set(named.id, {
    id: named.id,
    kind,
    ...(named.label ? { label: named.label } : {}),
    ...(parent ? { parent } : {}),
  })
  if (decl[3]) p.stack.push({ id: named.id, line })
  return true
}

/** The relation a line draws: the triangle points at the parent, `<<include>>` names the kind. */
function usecaseRelation(
  from: string,
  to: string,
  m: readonly (string | undefined)[],
): UseCaseRelation {
  const arrow = arrowOf(m)
  const said = keyword(m[7], ['include', 'extend'])
  const label = said.label ? { label: said.label } : {}
  if (arrow.triangleAtFrom || arrow.triangleAtTo) {
    const [child, parent] = arrow.triangleAtTo ? [from, to] : [to, from]
    return { from: child, to: parent, kind: 'generalization' as const, ...label }
  }
  if (said.word === 'include') return { from, to, kind: 'include', ...label }
  if (said.word === 'extend') return { from, to, kind: 'extend', ...label }
  return { from, to, ...label }
}

function readUseCaseLine(
  p: ElementParse<UseCaseElement>,
  relations: UseCaseRelation[],
  line: SourceLine,
) {
  if (commonLine(p, line) || declareUseCase(p, line)) return
  const m = match(LINE, line.text)
  if (m) {
    relations.push(usecaseRelation(usecaseEnd(p, m[1] ?? ''), usecaseEnd(p, m[6] ?? ''), m))
    return
  }
  // `(Pay) as UC2` or `:Clerk:` alone declares the use case or the actor.
  const named = /^[(:]/.test(line.text) ? readNamed(line.text) : null
  if (named && !named.rest) usecaseEnd(p, line.text)
  else p.problems.push(problem(line, 'syntax'))
}

function parsePlantUseCase(lines: readonly SourceLine[], title?: string) {
  const p: ElementParse<UseCaseElement> = {
    elements: new Map(),
    problems: [],
    notes: [],
    stack: [],
  }
  const relations: UseCaseRelation[] = []
  for (const line of lines) readUseCaseLine(p, relations, line)
  for (const open of p.stack) p.problems.push(problem(open.line, 'unclosed'))
  const diagram: UseCaseDiagram = {
    kind: 'usecase',
    ...((p.title ?? title) ? { title: p.title ?? title } : {}),
    ...(p.direction ? { direction: p.direction } : {}),
    elements: [...p.elements.values()],
    relations,
    ...(p.notes.length ? { notes: p.notes } : {}),
  }
  return { diagram, problems: p.problems }
}

// ── Deployment ──────────────────────────────────────────────────────────────────────────────────

const DEPLOY_KEYWORDS: Record<string, DeploymentNodeKind> = {
  node: 'node',
  device: 'device',
  artifact: 'artifact',
  file: 'artifact',
  component: 'component',
  database: 'database',
  storage: 'database',
  cloud: 'cloud',
  frame: 'node',
  folder: 'node',
  package: 'node',
  rectangle: 'node',
  stack: 'node',
  queue: 'component',
  collections: 'component',
  agent: 'component',
  card: 'component',
}
const DEPLOY_DECL = new RegExp(
  String.raw`^(${Object.keys(DEPLOY_KEYWORDS).join('|')})\s+(.+?)\s*(\{)?$`,
  'i',
)
const STEREOTYPE = /<<\s*([^>]+?)\s*>>/

function deploymentEnd(p: ElementParse<DeploymentNode>, text: string): string {
  const named = readNamed(text)
  const id = named?.id ?? idOf(text)
  if (!p.elements.has(id)) {
    const parent = p.stack.at(-1)?.id
    p.elements.set(id, {
      id,
      kind: text.startsWith('[') ? 'component' : 'node',
      ...(named?.label ? { label: named.label } : {}),
      ...(parent ? { parent } : {}),
    })
  }
  return id
}

/** `<<executionEnvironment>>` and `<<device>>` are kinds; any other stereotype is kept. */
function deploymentKind(word: string, stereotype: string | undefined) {
  const kind = DEPLOY_KEYWORDS[word.toLowerCase()] ?? 'node'
  const s = stereotype?.toLowerCase().replace(/\s+/g, '')
  if (s === 'executionenvironment' || s === 'environment') return { kind: 'environment' as const }
  if (s === 'device') return { kind: 'device' as const }
  return { kind, ...(stereotype ? { stereotype } : {}) }
}

/** `node "Web" as web <<Ubuntu>> {`: true when the line declared one. */
function declareDeployment(p: ElementParse<DeploymentNode>, line: SourceLine): boolean {
  const decl = match(DEPLOY_DECL, line.text)
  if (!decl) return false
  const stereotype = STEREOTYPE.exec(decl[2] ?? '')?.[1]
  const named = readNamed((decl[2] ?? '').replace(STEREOTYPE, '').replace(/#\w+/g, '').trim())
  if (!named) {
    p.problems.push(problem(line, 'syntax'))
    return true
  }
  const parent = p.stack.at(-1)?.id
  p.elements.set(named.id, {
    id: named.id,
    ...deploymentKind(decl[1] ?? '', stereotype),
    ...(named.label ? { label: named.label } : {}),
    ...(parent ? { parent } : {}),
  })
  if (decl[3]) p.stack.push({ id: named.id, line })
  return true
}

function readDeploymentLine(
  p: ElementParse<DeploymentNode>,
  relations: DeploymentRelation[],
  line: SourceLine,
) {
  if (commonLine(p, line) || declareDeployment(p, line)) return
  const m = match(LINE, line.text)
  if (!m) return void p.problems.push(problem(line, 'syntax'))
  const from = deploymentEnd(p, m[1] ?? '')
  const to = deploymentEnd(p, m[6] ?? '')
  const said = keyword(m[7], ['deploy'])
  const label = said.label ? { label: said.label } : {}
  if (said.word === 'deploy') relations.push({ from, to, kind: 'deploy', ...label })
  else if (arrowOf(m).dotted) relations.push({ from, to, kind: 'dependency', ...label })
  else relations.push({ from, to, ...label })
}

function parsePlantDeployment(lines: readonly SourceLine[], title?: string) {
  const p: ElementParse<DeploymentNode> = {
    elements: new Map(),
    problems: [],
    notes: [],
    stack: [],
  }
  const relations: DeploymentRelation[] = []
  for (const line of lines) readDeploymentLine(p, relations, line)
  for (const open of p.stack) p.problems.push(problem(open.line, 'unclosed'))
  const diagram: DeploymentDiagram = {
    kind: 'deployment',
    ...((p.title ?? title) ? { title: p.title ?? title } : {}),
    ...(p.direction ? { direction: p.direction } : {}),
    elements: [...p.elements.values()],
    relations,
    ...(p.notes.length ? { notes: p.notes } : {}),
  }
  return { diagram, problems: p.problems }
}

// ── Writing ─────────────────────────────────────────────────────────────────────────────────────

/** A name PlantUML reads in quotes: quotes inside become apostrophes, line breaks `\n`. */
const q = (text: string) => `"${text.replace(/"/g, "'").replace(/\r?\n/g, '\\n')}"`

function declaration(word: string, e: { id: string; label?: string }, extra = ''): string {
  return `${word} ${q(e.label ?? e.id)} as ${e.id}${extra}`
}

function notesText(notes: readonly UmlNote[] | undefined): string[] {
  return (notes ?? []).flatMap((n) =>
    n.for ? [`note right of ${n.for} : ${n.text.replace(/\r?\n/g, '\\n')}`] : [],
  )
}

/**
 * PlantUML lays out top to bottom unless told; `usual` is how we draw the kind when no direction
 * is set, so the text says it whenever the two differ.
 */
function directionLine(direction: UmlDirection | undefined, usual: UmlDirection): string[] {
  const d = direction ?? usual
  if (d === 'LR' || d === 'RL') return ['left to right direction']
  return direction && usual !== 'TB' ? ['top to bottom direction'] : []
}

function usecaseToPlantUml(d: UseCaseDiagram): string {
  const systems = new Set(d.elements.filter((e) => e.kind === 'system').map((e) => e.id))
  // Actors stand outside every system; a use case whose system is missing goes at the top.
  const inScope = (e: UseCaseElement, parent: string | undefined) =>
    parent === undefined
      ? !e.parent || !systems.has(e.parent) || e.kind === 'actor'
      : e.parent === parent && e.kind !== 'actor'
  const scope = (parent: string | undefined, pad: string): string[] =>
    d.elements
      .filter((e) => inScope(e, parent))
      .flatMap((e) => {
        if (e.kind !== 'system') return [`${pad}${declaration(e.kind, e)}`]
        return [`${pad}${declaration('rectangle', e, ' {')}`, ...scope(e.id, `${pad}  `), `${pad}}`]
      })
  const lines = d.relations.map((r) => {
    const label = r.label ? ` : ${r.label.replace(/\r?\n/g, '\\n')}` : ''
    switch (r.kind ?? 'association') {
      case 'include':
      case 'extend':
        return `${r.from} ..> ${r.to} : <<${r.kind ?? ''}>>${r.label ? ` ${r.label}` : ''}`
      case 'generalization':
        return `${r.from} --|> ${r.to}${label}`
      default:
        return `${r.from} -- ${r.to}${label}`
    }
  })
  return wrap(d.title, [
    ...directionLine(d.direction, 'LR'),
    ...scope(undefined, ''),
    ...lines,
    ...notesText(d.notes),
  ])
}

const WORD: Record<DeploymentNodeKind, string> = {
  node: 'node',
  device: 'node',
  environment: 'node',
  artifact: 'artifact',
  component: 'component',
  database: 'database',
  cloud: 'cloud',
}

function deploymentToPlantUml(d: DeploymentDiagram): string {
  const ids = new Set(d.elements.map((e) => e.id))
  const stereo = (n: DeploymentNode) => {
    const s =
      n.stereotype ?? { device: 'device', environment: 'executionEnvironment' }[n.kind as string]
    return s ? ` <<${s}>>` : ''
  }
  const scope = (parent: string | undefined, pad: string): string[] =>
    d.elements
      .filter((e) => (parent === undefined ? !e.parent || !ids.has(e.parent) : e.parent === parent))
      .flatMap((e) => {
        const inner = scope(e.id, `${pad}  `)
        const head = `${pad}${declaration(WORD[e.kind], e, stereo(e))}`
        return inner.length ? [`${head} {`, ...inner, `${pad}}`] : [head]
      })
  const lines = d.relations.map((r) => {
    const label = r.label ? ` ${r.label.replace(/\r?\n/g, '\\n')}` : ''
    if (r.kind === 'deploy') return `${r.from} ..> ${r.to} : <<deploy>>${label}`
    const arrow = r.kind === 'dependency' ? '..>' : '--'
    return `${r.from} ${arrow} ${r.to}${label ? ` :${label}` : ''}`
  })
  return wrap(d.title, [
    ...directionLine(d.direction, 'TB'),
    ...scope(undefined, ''),
    ...lines,
    ...notesText(d.notes),
  ])
}

/** `@startuml`, the title, the lines, `@enduml`. */
function wrap(title: string | undefined, lines: readonly string[]): string {
  return [
    '@startuml',
    ...(title ? [`title ${title.replace(/\r?\n/g, ' ')}`] : []),
    ...lines,
    '@enduml',
  ].join('\n')
}

export {
  arrowOf,
  commonLine,
  declaration,
  deploymentToPlantUml,
  directionLine,
  type ElementParse,
  END,
  idOf,
  keyword,
  LINE,
  notesText,
  parsePlantDeployment,
  parsePlantUseCase,
  readNamed,
  STEREOTYPE,
  usecaseToPlantUml,
  wrap,
}
