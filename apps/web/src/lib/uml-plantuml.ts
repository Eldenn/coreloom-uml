// Coreloom UI — PlantUML text for UML diagrams. `parsePlantUml` reads `@startuml` text: it tells
// which diagram it is from the lines (class, sequence, state, entity–relationship, C4 with the
// C4-PlantUML macros, use case, activity, deployment, component or package) and reads it into Coreloom's model,
// tolerantly, with problems by line. Class, state, sequence and ER lines are close to Mermaid's,
// so they're turned into Mermaid lines (same line numbers) and read by the Mermaid parsers.
// `toPlantUml` writes any diagram back, positions people dragged in a `' coreloom-layout` comment
// line. No PlantUML dependency, nothing rendered as HTML.
import type { C4Level, UmlParseResult, UmlProblem } from '@/lib/uml'
import { parseC4Diagram } from '@/lib/uml-mermaid-c4'
import { parseClassDiagram } from '@/lib/uml-mermaid-class'
import { parseErDiagram } from '@/lib/uml-mermaid-er'
import { parseSequenceDiagram } from '@/lib/uml-mermaid-sequence'
import { parseStateDiagram } from '@/lib/uml-mermaid-state'
import { ACTIVITY_LINE, parsePlantActivity } from '@/lib/uml-plantuml-activity'
import { parsePlantDeployment, parsePlantUseCase } from '@/lib/uml-plantuml-elements'
import { parsePlantComponent, parsePlantPackage } from '@/lib/uml-plantuml-structure'
import { toPlantUml } from '@/lib/uml-plantuml-write'
import {
  type Groups,
  match,
  problem,
  type SourceLine,
  unquote,
  withLayoutLine,
} from '@/lib/uml-text'

/** The lines worth reading: without `'` comments, `/' … '/` blocks, `@startuml` and `@enduml`. */
function plantLines(input: string): SourceLine[] {
  const out: SourceLine[] = []
  let block = false
  for (const [i, raw] of input.split(/\r?\n/).entries()) {
    let text = raw.trim()
    if (block) {
      if (text.includes("'/")) block = false
      continue
    }
    if (text.startsWith("/'")) {
      block = !text.includes("'/", 2)
      continue
    }
    if (/^@enduml\b/i.test(text)) break
    text = text.startsWith("'") ? '' : text
    if (text && !/^@startuml\b/i.test(text)) out.push({ no: i + 1, text })
  }
  return out
}

type PlantKind =
  | 'class'
  | 'state'
  | 'sequence'
  | 'er'
  | 'c4'
  | 'usecase'
  | 'activity'
  | 'deployment'
  | 'component'
  | 'package'

/** Lines that only one kind of diagram has, to tell which one the text is. */
const SIGNS: Record<PlantKind, RegExp> = {
  c4: /^(!include.*C4|Person(_Ext)?\s*\(|System(_Ext|Db|Queue)?\s*\(|Container(Db|Queue)?(_Ext)?\s*\(|Component(Db|Queue)?(_Ext)?\s*\(|(Bi)?Rel(_\w+)?\s*\()/,
  class: /^((abstract\s+)?class|interface|enum|annotation)\s|<\|--|--\|>|\*--|--\*|o--|--o|\.\.\|>/,
  er: /^entity\s|[|}o][|o]--|--[|o][|{o]|[|}o][|o]\.\.|\.\.[|o][|{o]/,
  state: /^state\s|\[\*\]/,
  activity: ACTIVITY_LINE,
  usecase: /^(usecase\s|\(.+\)|:.+:)|\s\(.+\)(\s|$)|^rectangle\s.*\{$/,
  component:
    /^(component|interface|port|portin|portout)\s|^\[.+\]|^\(\)|-\(0?\)?-*\s|-0\)-|\s\)-+\s/,
  package: /^package\s|<<\s*(import|merge)\s*>>/,
  deployment:
    /^(node|artifact|cloud|component|database|frame|folder|storage|file|device|queue|stack)\s|^\[.+\]/,
  sequence:
    /^(participant|boundary|control|collections)\s|^(activate|deactivate|autonumber|alt|loop|opt|par)\b|^[\w"]+\s*<?-{1,2}>{1,2}[\w"]+\s*:|^[\w"]+\s+<?-{1,2}>{1,2}\s+[\w"]+\s*:/,
}
const ORDER: readonly PlantKind[] = [
  'c4',
  'er',
  'class',
  'package',
  'state',
  'activity',
  'usecase',
  'component',
  'deployment',
  'sequence',
]

/** Lines only a class diagram has: a class's members in braces, inheritance and its kin. */
const CLASS_ONLY =
  /^((abstract\s+)?class|interface|enum)\s.*\{$|<\|--|--\|>|\*--|--\*|o--|--o|\.\.\|>/
const PACKAGE_ONLY = /<<\s*(import|merge)\s*>>/

/**
 * Packages are in class diagrams too: the text is a package diagram when it imports or merges
 * one, or has packages and nothing that only a class diagram has.
 */
function classOrPackage(lines: readonly SourceLine[]): 'class' | 'package' {
  if (lines.some((l) => PACKAGE_ONLY.test(l.text))) return 'package'
  const packaged = lines.some((l) => /^package\s/i.test(l.text))
  return packaged && !lines.some((l) => CLASS_ONLY.test(l.text)) ? 'package' : 'class'
}

/** The kind with the most lines that are its own; ties go to the first in `ORDER`. */
function detect(lines: readonly SourceLine[]): PlantKind | null {
  let best: PlantKind | null = null
  let most = 0
  for (const kind of ORDER) {
    const n = lines.filter((l) => SIGNS[kind].test(l.text)).length
    if (n > most) {
      best = kind
      most = n
    }
  }
  return best === 'class' || best === 'package' ? classOrPackage(lines) : best
}

const SKIP = /^(skinparam|hide|show|scale|caption|legend|endlegend|footer|header|!|newpage)/i

interface Prepared {
  lines: SourceLine[]
  problems: UmlProblem[]
  title?: string
}

/** Turns PlantUML lines into Mermaid ones with `convert`; styling lines become warnings. */
function prepare(
  lines: readonly SourceLine[],
  convert: (text: string) => string | string[] | null,
): Prepared {
  const out: Prepared = { lines: [], problems: [] }
  for (const line of lines) {
    if (/^title\s+/i.test(line.text)) {
      out.title = unquote(line.text.replace(/^title\s+/i, ''))
      continue
    }
    if (SKIP.test(line.text)) {
      out.problems.push(problem(line, 'unsupported', 'warning'))
      continue
    }
    const next = convert(line.text)
    if (next === null) out.problems.push(problem(line, 'unsupported', 'warning'))
    else for (const text of [next].flat()) out.lines.push({ no: line.no, text })
  }
  return out
}

const ARROW =
  /(\s|[\w\]")])(<\|?|\*|o|<)?([-.]+)(?:\[[^\]]*\])?(?:up|down|left|right|u|d|l|r)?([-.]*)(\|>|\*|o|>)?(?=\s|[\w"[(]|$)/

/** `-up->`, `-[#red]->`, `->`, `.>` → `-->`, `..>`: the arrow Mermaid reads. */
function plainArrow(text: string): string {
  const m = match(ARROW, text)
  if (!m) return text
  const [whole = '', before = '', left = '', body = '', tail = '', right = ''] = m
  const line = (body + tail).includes('.') ? '..' : '--'
  return text.replace(whole, `${before}${left}${line}${right}`)
}

const STEREO_KEYWORDS: Record<string, string> = {
  interface: 'interface',
  enum: 'enumeration',
  'abstract class': 'abstract',
  abstract: 'abstract',
}

const CLASS_DECL =
  /^(abstract\s+class|abstract|class|interface|enum)\s+(?:"([^"]+)"\s+as\s+)?([\w.]+)(?:<([^>]+)>)?\s*(?:<<\s*([^>]+?)\s*>>)?\s*(?:#\w+)?\s*(\{)?\s*(\})?$/

/** `abstract class Shape<T> <<Entity>> {` → Mermaid's class line, after its annotation. */
function classDeclaration(m: Groups): string[] {
  const [, word = '', label, id = '', generic, stereo, open, close] = m
  const annotation = STEREO_KEYWORDS[word.replace(/\s+/g, ' ')] ?? stereo
  const head = [
    `class ${id}`,
    generic ? `~${generic}~` : '',
    label ? `["${label}"]` : '',
    open ? ' {' : '',
    close ? '}' : '',
  ].join('')
  // The annotation goes first: inside the braces it would read as a member.
  return annotation ? [`class ${id}`, `<<${annotation}>> ${id}`, head] : [head]
}

function classLine(text: string): string | string[] | null {
  if (/^(--|\.\.|==|__)/.test(text) && !/\w/.test(text)) return []
  if (/^left to right direction$/i.test(text)) return 'direction LR'
  const pkg = match(/^(?:package|namespace)\s+"?([\w.]+)"?.*\{$/, text)
  if (pkg) return `namespace ${pkg[1] ?? ''} {`
  const decl = match(CLASS_DECL, text)
  if (decl) return classDeclaration(decl)
  const note = match(/^note\s+(?:left|right|top|bottom)\s+of\s+([\w.]+)\s*:\s*(.+)$/i, text)
  if (note) return `note for ${note[1] ?? ''} "${(note[2] ?? '').replace(/"/g, "'")}"`
  if (/^note\b/i.test(text)) return null
  // Members: {static} and {abstract} become Mermaid's $ and *.
  const member = match(/^\{(static|classifier|abstract)\}\s*(.+)$/, text)
  if (member) return `${member[2] ?? ''}${member[1] === 'abstract' ? '*' : '$'}`
  return plainArrow(text)
}

function stateLine(text: string): string | null {
  if (/^left to right direction$/i.test(text)) return 'direction LR'
  if (/^(\|\||--)$/.test(text)) return null
  const desc = match(/^state\s+([\w.]+)\s*(?:#\w+)?\s*:\s*(.+)$/, text)
  if (desc) return `${desc[1] ?? ''} : ${desc[2] ?? ''}`
  const plain = text.replace(/\s#\w+/g, '').replace(/\s*<<\s*(start|end)\s*>>/, '')
  if (/^state\b/.test(plain)) return plain
  // Every arrow is a transition: `->`, `-down->`, `-[#red]->` all become `-->`.
  return plain.replace(/\s*-+(?:\[[^\]]*\])?(?:up|down|left|right|u|d|l|r)?-*>\s*/, ' --> ')
}

const PARTICIPANT =
  /^(participant|actor|boundary|control|entity|database|collections|queue)\s+(?:"([^"]+)"\s+as\s+([\w.]+)|([\w.]+)\s+as\s+"([^"]+)"|([\w.]+))/
const MESSAGE =
  /^([\w.]+|"[^"]+")\s*(<?-{1,2}(?:\[[^\]]*\])?(?:>>|>|\\\\|\/\/|\\|\/|x)?(?:x|o)?)\s*([\w.]+|"[^"]+")\s*(\+\+|--|\*\*|!!)?\s*(?::\s*(.*))?$/

/** A PlantUML arrow as Mermaid's: dotted or not, and the head. */
function sequenceArrow(arrow: string): string {
  const dotted = arrow.replace(/^</, '').startsWith('--') ? '--' : '-'
  if (arrow.endsWith('x')) return `${dotted}x`
  if (/>>|\\|\//.test(arrow)) return `${dotted})`
  return `${dotted}>>`
}

function participantLine(m: Groups): string {
  const [, word, longName, aliasId, plainId, aliasName, bare] = m
  const id = aliasId ?? plainId ?? bare ?? ''
  const name = longName ?? aliasName
  return `${word === 'actor' ? 'actor' : 'participant'} ${id}${name ? ` as ${name}` : ''}`
}

function messageLine(m: Groups): string {
  const [, a = '', arrow = '', b = '', mark, said = ''] = m
  const [from, to] = arrow.startsWith('<') ? [b, a] : [a, b]
  const sign = { '++': '+', '--': '-' }[mark ?? ''] ?? ''
  return `${unquote(from)}${sequenceArrow(arrow)}${sign}${unquote(to)}: ${said}`
}

/** Blocks, their sections and their end; `stack` knows which block an `else` belongs to. */
function blockLine(stack: string[], text: string): string | null {
  const block = match(/^(alt|loop|opt|par|critical|break|group)\b\s*(.*)$/, text)
  if (block) {
    // A group has no Mermaid name: it reads as an optional block with its label.
    const kind = block[1] === 'group' ? 'opt' : (block[1] ?? 'opt')
    stack.push(kind)
    return `${kind} ${block[2] ?? ''}`.trim()
  }
  const section = match(/^else\b\s*(.*)$/, text)
  if (section) {
    const word = { par: 'and', critical: 'option' }[stack.at(-1) ?? ''] ?? 'else'
    return `${word} ${section[1] ?? ''}`.trim()
  }
  if (text !== 'end') return null
  stack.pop()
  return 'end'
}

function sequenceLine(stack: string[]) {
  return (text: string): string | string[] | null => {
    const decl = match(PARTICIPANT, text)
    if (decl) return participantLine(decl)
    const m = match(MESSAGE, text)
    if (m) return messageLine(m)
    const block = blockLine(stack, text)
    if (block !== null) return block
    if (/^autonumber\b/.test(text)) return 'autonumber'
    if (/^[rh]?note\s+(left of|right of|over)\s/i.test(text))
      return text.replace(/^[rh]?note/i, 'note')
    if (/^(activate|deactivate)\s/.test(text)) return text.replace(/\s#\w+$/, '')
    return null
  }
}

/** Entity blocks as Mermaid's: `name : type <<PK>>` becomes `type name PK`. */
function erLine(text: string): string | string[] {
  const entity = match(/^entity\s+(?:"[^"]+"\s+as\s+)?([\w.]+).*\{$/, text)
  if (entity) return `${entity[1] ?? ''} {`
  if (text === '}') return '}'
  if (/^(--|\.\.|==|__)$/.test(text)) return []
  const attr = match(/^\*?\s*([\w.]+)\s*:\s*([\w.()[\]]+)(.*)$/, text)
  if (attr) {
    const [, name = '', type = '', rest = ''] = attr
    const keys = ['PK', 'FK', 'UK'].filter((k) => new RegExp(`<<\\s*${k}\\s*>>`, 'i').test(rest))
    return `${type} ${name} ${keys.join(', ')}`.trim()
  }
  return plainEr(text)
}

/** ER lines: the crow's feet are the same as Mermaid's; only direction hints go. */
function plainEr(text: string): string {
  return text.replace(
    /(-+|\.+)(?:\[[^\]]*\])?(?:up|down|left|right|u|d|l|r)?(-+|\.+)/,
    (_m, a: string) => (a.startsWith('.') ? '..' : '--'),
  )
}

const C4_SKIP = /^(LAYOUT_|SHOW_|HIDE_|UpdateElementStyle|UpdateRelStyle|AddElementTag|AddRelTag)/

function c4Level(lines: readonly SourceLine[]): C4Level {
  const all = lines.map((l) => l.text).join('\n')
  if (/C4_Component|^Component(Db|Queue)?(_Ext)?\s*\(/m.test(all)) return 'component'
  if (/C4_Container|^Container(Db|Queue)?(_Ext)?\s*\(/m.test(all)) return 'container'
  return 'context'
}

function readKind(kind: PlantKind, lines: readonly SourceLine[]): UmlParseResult {
  switch (kind) {
    case 'class': {
      const p = prepare(lines, classLine)
      const r = parseClassDiagram(p.lines, p.title)
      return { diagram: r.diagram, problems: [...p.problems, ...r.problems] }
    }
    case 'state': {
      const p = prepare(lines, stateLine)
      const r = parseStateDiagram(p.lines, p.title)
      return { diagram: r.diagram, problems: [...p.problems, ...r.problems] }
    }
    case 'sequence': {
      const p = prepare(lines, sequenceLine([]))
      const r = parseSequenceDiagram(p.lines, p.title)
      return { diagram: r.diagram, problems: [...p.problems, ...r.problems] }
    }
    case 'er': {
      const p = prepare(lines, erLine)
      const r = parseErDiagram(p.lines, p.title)
      return { diagram: r.diagram, problems: [...p.problems, ...r.problems] }
    }
    case 'c4': {
      const p = prepare(lines, (t) => (C4_SKIP.test(t) ? [] : t))
      return parseC4Diagram(c4Level(lines), p.lines, p.title)
    }
    case 'usecase':
      return parsePlantUseCase(lines)
    case 'activity':
      return parsePlantActivity(lines)
    case 'deployment':
      return parsePlantDeployment(lines)
    case 'component':
      return parsePlantComponent(lines)
    case 'package':
      return parsePlantPackage(lines)
  }
}

/** Reads PlantUML text (with or without `@startuml` and `@enduml`). */
function parsePlantUml(input: string): UmlParseResult {
  const lines = plantLines(input)
  if (!lines.length)
    return { diagram: null, problems: [{ line: 0, severity: 'error', code: 'empty' }] }
  const kind = detect(lines)
  if (!kind) {
    const first = lines.at(0)
    return {
      diagram: null,
      problems: [first ? problem(first, 'header') : { line: 0, severity: 'error', code: 'header' }],
    }
  }
  return withLayoutLine(readKind(kind, lines), input)
}

/** True when the text looks like PlantUML rather than Mermaid: `@startuml`, after any `'` comments. */
function isPlantUml(input: string): boolean {
  return /^(?:\s*'[^\n]*\n)*\s*@start(uml|mindmap)?\b/i.test(input)
}

export { isPlantUml, parsePlantUml, toPlantUml }
