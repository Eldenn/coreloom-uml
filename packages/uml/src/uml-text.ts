// Coreloom UML — the line reader the Mermaid parsers share: lines without comments or blanks, with
// their numbers; quoted strings; comma-separated macro arguments; and the problems a parser reports.
import {
  type UmlLayout,
  type UmlParseResult,
  type UmlProblem,
  type UmlSpec,
  umlElementIds,
} from './uml.ts'

interface SourceLine {
  /** 1-based, in the text the user typed. */
  no: number
  text: string
}

/** A match's groups, any of which may be missing (an optional group that didn't take part). */
type Groups = readonly (string | undefined)[]

/** `re.exec(text)` as groups that may each be undefined, which is what they are at run time. */
function match(re: RegExp, text: string): Groups | null {
  const m = re.exec(text)
  return m ? [...m] : null
}

/** The lines worth reading: trimmed, without `%%` comments and blank lines. */
function sourceLines(input: string): SourceLine[] {
  const out: SourceLine[] = []
  input.split(/\r?\n/).forEach((raw, i) => {
    const text = raw.replace(/%%.*$/, '').trim()
    if (text) out.push({ no: i + 1, text })
  })
  return out
}

/** `"Label"` → `Label`; anything else is trimmed and kept. Mermaid's `#quot;` turns back into `"`. */
function unquote(value: string): string {
  const v = value.trim()
  const inner = v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v
  return inner.replaceAll('#quot;', '"')
}

/** A label written inside Mermaid quotes, which have no escape: `"` becomes `#quot;`. */
function quote(value: string): string {
  return `"${value.replaceAll('"', '#quot;')}"`
}

/** Text Mermaid reads to the end of a line: line breaks become `<br/>`. */
function oneLine(value: string): string {
  return value.replace(/\r?\n/g, '<br/>')
}

/** `<br>` and `<br/>` in Mermaid text are line breaks. */
function lineBreaks(value: string): string {
  return value.replace(/<br\s*\/?>/gi, '\n')
}

/** `a, "b, c", d` → `['a', 'b, c', 'd']`. Named arguments (`$tags="x"`) are left out. */
function macroArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let quoted = false
  for (const ch of input) {
    if (ch === '"') quoted = !quoted
    if (ch === ',' && !quoted) {
      args.push(current)
      current = ''
    } else current += ch
  }
  if (current.trim() || args.length) args.push(current)
  return args
    .map((a) => a.trim())
    .filter((a) => !a.startsWith('$'))
    .map(unquote)
}

function problem(
  line: SourceLine,
  code: UmlProblem['code'],
  severity: UmlProblem['severity'] = 'error',
): UmlProblem {
  return { line: line.no, severity, code, text: line.text }
}

/** Lines a parser recognises as styling or interactivity, which Coreloom draws its own way. */
const STYLING = /^(classDef|style|cssClass|linkStyle|click|callback|link|accTitle|accDescr)\b/

/** The `title:` of a `---` front-matter block at the top, and the text after it. */
function frontMatter(input: string): { title?: string; body: string; offset: number } {
  const lines = input.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return { body: input, offset: 0 }
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (end < 0) return { body: input, offset: 0 }
  const titleLine = lines.slice(1, end).find((l) => /^\s*title\s*:/.test(l))
  const title = titleLine ? unquote(titleLine.replace(/^\s*title\s*:/, '')) : undefined
  // The body keeps its blank lines so line numbers still point into the full text.
  const body = [...lines.slice(0, end + 1).map(() => ''), ...lines.slice(end + 1)].join('\n')
  return { ...(title ? { title } : {}), body, offset: end + 1 }
}

/** The front-matter block for a title, or nothing. */
function titleBlock(title: string | undefined): string[] {
  return title ? ['---', `title: ${title.replace(/\r?\n/g, ' ')}`, '---'] : []
}

/**
 * Mermaid and PlantUML have no place for positions, so the ones people dragged go in one comment
 * line, which both skip: `%% coreloom-layout {…}` or `' coreloom-layout {…}`.
 */
const LAYOUT_MARK = 'coreloom-layout'
const LAYOUT_LINE = /^[ \t]*(?:%%|')[ \t]*coreloom-layout[ \t]+(.+?)[ \t]*$/m

/** The comment line for a diagram's positions, or null when it has none to keep. */
function layoutLine(diagram: UmlSpec, comment: '%%' | "'"): string | null {
  if (diagram.kind === 'sequence' || !diagram.layout) return null
  if (!Object.keys(diagram.layout).length) return null
  return `${comment} ${LAYOUT_MARK} ${JSON.stringify(diagram.layout)}`
}

function isPoint(value: unknown): value is { x: number; y: number } {
  if (typeof value !== 'object' || value === null) return false
  const { x, y } = value as Record<string, unknown>
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)
}

/** The positions in a layout line, for the elements the diagram has; anything malformed is skipped. */
function readLayoutLine(input: string, diagram: UmlSpec): UmlLayout | null {
  const json = LAYOUT_LINE.exec(input)?.[1]
  if (!json || diagram.kind === 'sequence') return null
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const points = raw as Record<string, unknown>
  const kept = umlElementIds(diagram).flatMap((id) => {
    const point = Object.hasOwn(points, id) ? points[id] : undefined
    return isPoint(point) ? [[id, { x: point.x, y: point.y }] as const] : []
  })
  return kept.length ? Object.fromEntries(kept) : null
}

/** A parse result with the positions its text's layout line kept. */
function withLayoutLine(result: UmlParseResult, input: string): UmlParseResult {
  const diagram = result.diagram
  if (!diagram || diagram.kind === 'sequence') return result
  const layout = readLayoutLine(input, diagram)
  return layout ? { ...result, diagram: { ...diagram, layout } } : result
}

/**
 * PlantUML's colours (`#red`, `#E0E0E0`) taken out of a line, but not out of quoted names:
 * `node "Order #42" #pink` keeps "Order #42".
 */
function withoutColors(text: string): string {
  return text.replace(/("[^"]*")|\s?#\w+/g, (_all, quoted: string | undefined) => quoted ?? '')
}

export {
  frontMatter,
  type Groups,
  layoutLine,
  lineBreaks,
  macroArgs,
  match,
  oneLine,
  problem,
  quote,
  type SourceLine,
  STYLING,
  sourceLines,
  titleBlock,
  unquote,
  withLayoutLine,
  withoutColors,
}
