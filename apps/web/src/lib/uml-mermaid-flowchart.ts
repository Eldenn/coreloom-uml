import type { UmlDirection, UmlProblem } from '@/lib/uml'
import type {
  ActivityDiagram,
  ActivityFlow,
  ActivityNode,
  ActivityNodeKind,
} from '@/lib/uml-elements'
import {
  type Groups,
  lineBreaks,
  match,
  oneLine,
  problem,
  quote,
  type SourceLine,
  titleBlock,
  unquote,
} from '@/lib/uml-text'

const HEADER = /^(?:flowchart|graph)(?:\s+(TB|TD|BT|LR|RL))?\s*;?$/
const SUBGRAPH = /^subgraph\s+([\w.-]+)(?:\s*\[(.*)\])?\s*$|^subgraph\s+"?([^"]+?)"?\s*$/
const DIRECTION = /^direction\s+(TB|TD|BT|LR|RL)$/
const FLOW_STYLING = /^(classDef|class|style|linkStyle|click|accTitle|accDescr)\b/

/** A node id, then a shape with its text, then a `:::class` that Coreloom ignores. */
const NODE =
  /^([\w.-]+)(?:@\{([^}]*)\}|(\(\(\(.*?\)\)\)|\(\(.*?\)\)|\(\[.*?\]\)|\[\[.*?\]\]|\[\(.*?\)\]|\[[/\\].*?[/\\]\]|\{\{.*?\}\}|\{.*?\}|\(.*?\)|\[.*?\]|>.*?\]))?(?::::[\w-]+)?/

/** `-- text -->`, `== text ==>`, `-. text .->`. */
const LINK_TEXT = /^\s*(?:--|==|-\.)\s+(.+?)\s+(?:-{2,}>|={2,}>|\.+->|-{3,}|={3,}|\.+-)\s*/
/** `-->`, `--->`, `==>`, `-.->`, `---`, `--o`, `--x`, `<-->`, then an optional `|text|`. */
const LINK = /^\s*<?(?:-{2,}>|={2,}>|-\.+->|-{3,}|={3,}|-\.+-|--[ox]|~~~)\s*(?:\|([^|]*)\|)?\s*/

interface FlowParse {
  nodes: Map<string, ActivityNode>
  flows: ActivityFlow[]
  problems: UmlProblem[]
  stack: string[]
  direction?: UmlDirection
}

/** `@{ shape: fork, label: "Pay" }` → its shape and label. */
function shapeData(body: string): { shape?: string; label?: string } {
  const shape = /\bshape\s*:\s*([\w-]+)/.exec(body)?.[1]
  const label = /\blabel\s*:\s*("[^"]*"|[^,}]+)/.exec(body)?.[1]
  return {
    ...(shape ? { shape: shape.toLowerCase() } : {}),
    ...(label ? { label: unquote(label) } : {}),
  }
}

/** Mermaid v11 shape names, by what they are in an activity diagram. */
const SHAPES: Record<string, ActivityNodeKind> = {
  'sm-circ': 'start',
  'small-circle': 'start',
  start: 'start',
  circle: 'start',
  circ: 'start',
  'fr-circ': 'end',
  'framed-circle': 'end',
  stop: 'end',
  'dbl-circ': 'end',
  'double-circle': 'end',
  'cross-circ': 'flowEnd',
  'crossed-circle': 'flowEnd',
  fork: 'fork',
  join: 'join',
  decision: 'decision',
  question: 'decision',
  diam: 'merge',
  diamond: 'merge',
}

/** What a bracketed shape stands for, with its text. */
function bracketShape(shape: string): { kind: ActivityNodeKind; label: string } {
  const inner = (open: number) => unquote(shape.slice(open, shape.length - open))
  if (shape.startsWith('(((')) return { kind: 'end', label: inner(3) }
  if (shape.startsWith('((')) return { kind: 'start', label: inner(2) }
  if (shape.startsWith('{{')) return { kind: 'action', label: inner(2) }
  if (shape.startsWith('{')) {
    const label = inner(1)
    return { kind: label ? 'decision' : 'merge', label }
  }
  if (/^(\(\[|\[\[|\[\(|\[[/\\])/.test(shape)) return { kind: 'action', label: inner(2) }
  return { kind: 'action', label: inner(1) }
}

/** What a node's written shape says: its kind and text, either may be missing. */
function shapeOf(data: string | undefined, shape: string | undefined) {
  if (data !== undefined) {
    const d = shapeData(data)
    const kind = d.shape ? (SHAPES[d.shape] ?? 'action') : 'action'
    // A diamond that asks something is a decision; an empty one merges.
    return { kind: d.label && kind === 'merge' ? 'decision' : kind, label: d.label ?? '' }
  }
  if (shape) return bracketShape(shape)
  return { label: '' }
}

function readNode(p: FlowParse, m: Groups): string {
  const [, id = '', data, shape] = m
  const parent = p.stack.at(-1)
  const node = p.nodes.get(id) ?? { id, kind: 'action' }
  p.nodes.set(id, node)
  // As in Mermaid, a node mentioned inside a subgraph belongs to it, wherever it was first written.
  if (parent && node.kind !== 'partition') node.parent = parent
  const read: { kind?: ActivityNodeKind; label: string } = shapeOf(data, shape)
  if (read.kind) node.kind = read.kind
  const label = lineBreaks(read.label).trim()
  // Starts and ends say nothing in the drawing; their text is their name only when it isn't one.
  if (label && label !== id) node.label = label
  return id
}

/** The nodes at the start of `rest` (one, or a `&` list), and what follows them. */
function readGroup(p: FlowParse, text: string): { ids: string[]; rest: string } | null {
  const ids: string[] = []
  let rest = text
  for (let n = 0; n < 100; n++) {
    const m = match(NODE, rest)
    if (!m?.[1]) return null
    ids.push(readNode(p, m))
    rest = rest.slice(m[0]?.length ?? 0)
    const amp = /^\s*&\s*/.exec(rest)
    if (!amp) break
    rest = rest.slice(amp[0].length)
  }
  return { ids, rest }
}

/** One statement: nodes joined by links, each side possibly a `&` list. False when it isn't. */
function readChain(p: FlowParse, text: string): boolean {
  let rest = text.replace(/;\s*$/, '')
  let previous: string[] = []
  let guard: string | undefined
  for (let step = 0; step < 100; step++) {
    const group = readGroup(p, rest)
    if (!group) return false
    const label = guard?.trim() ? { label: lineBreaks(unquote(guard)) } : {}
    for (const from of previous) for (const to of group.ids) p.flows.push({ from, to, ...label })
    previous = group.ids
    rest = group.rest
    if (!rest.trim()) return true
    const link = match(LINK_TEXT, rest) ?? match(LINK, rest)
    if (!link) return false
    guard = link[1]
    rest = rest.slice(link[0]?.length ?? 0)
  }
  return false
}

function readLine(p: FlowParse, line: SourceLine) {
  const { text } = line
  const sub = match(SUBGRAPH, text)
  if (sub) {
    const id = sub[1] ?? (sub[3] ?? 'partition').replace(/\W+/g, '_')
    const label = sub[2] ? lineBreaks(unquote(sub[2])) : sub[3]
    const parent = p.stack.at(-1)
    p.nodes.set(id, {
      id,
      kind: 'partition',
      ...(label && label !== id ? { label } : {}),
      ...(parent ? { parent } : {}),
    })
    p.stack.push(id)
    return
  }
  if (text === 'end') {
    if (!p.stack.pop()) p.problems.push(problem(line, 'unexpected'))
    return
  }
  const dir = match(DIRECTION, text)
  if (dir) {
    // A partition's own direction isn't kept; the diagram has one flow.
    if (!p.stack.length) p.direction = dir[1] === 'TD' ? 'TB' : (dir[1] as UmlDirection)
    return
  }
  if (FLOW_STYLING.test(text)) {
    p.problems.push(problem(line, 'unsupported', 'warning'))
    return
  }
  if (!readChain(p, text)) p.problems.push(problem(line, 'syntax'))
}

/** Reads the lines after a `flowchart` header; `header` is that line, for its direction. */
function parseFlowchart(
  header: string,
  lines: readonly SourceLine[],
  title: string | undefined,
): { diagram: ActivityDiagram; problems: UmlProblem[] } {
  const p: FlowParse = { nodes: new Map(), flows: [], problems: [], stack: [] }
  const dir = HEADER.exec(header)?.[1]
  if (dir) p.direction = dir === 'TD' ? 'TB' : (dir as UmlDirection)
  for (const line of lines) readLine(p, line)
  const last = lines.at(-1)
  if (p.stack.length && last) p.problems.push({ ...problem(last, 'unclosed'), text: p.stack[0] })
  return {
    diagram: {
      kind: 'activity',
      ...(title ? { title } : {}),
      ...(p.direction ? { direction: p.direction } : {}),
      elements: [...p.nodes.values()],
      relations: p.flows,
    },
    problems: p.problems,
  }
}

/** True when a header line starts a flowchart. */
function isFlowchart(header: string): boolean {
  return HEADER.test(header)
}

// ── Writing ─────────────────────────────────────────────────────────────────────────────────────

/** A node's definition: `id(Text)`, `id{Question?}`, or `id@{ shape: fork }`. */
function nodeText(n: ActivityNode): string {
  const label = oneLine(n.label ?? '')
  const shaped = (shape: string) =>
    `${n.id}@{ shape: ${shape}${label ? `, label: ${quote(label)}` : ''} }`
  switch (n.kind) {
    case 'action':
      return `${n.id}(${quote(label || n.id)})`
    case 'decision':
      return label ? `${n.id}{${quote(label)}}` : shaped('decision')
    case 'merge':
      return label ? `${n.id}{${quote(label)}}` : shaped('diam')
    case 'start':
      return shaped('sm-circ')
    case 'end':
      return shaped('fr-circ')
    case 'flowEnd':
      return shaped('cross-circ')
    case 'fork':
    case 'join':
      return shaped(n.kind)
    case 'partition':
      return `subgraph ${n.id}[${quote(label || n.id)}]`
  }
}

/** The nodes in `parent` (at the top: those without one, or whose partition is missing). */
function writeScope(
  d: ActivityDiagram,
  parent: string | undefined,
  depth: number,
  known: ReadonlySet<string>,
): string[] {
  const pad = '  '.repeat(depth)
  const inScope = (e: ActivityNode) =>
    parent === undefined ? !e.parent || !known.has(e.parent) : e.parent === parent
  const out: string[] = []
  for (const n of d.elements.filter(inScope)) {
    out.push(`${pad}${nodeText(n)}`)
    if (n.kind === 'partition') out.push(...writeScope(d, n.id, depth + 1, known), `${pad}end`)
  }
  return out
}

/** The activity diagram as a Mermaid flowchart. */
function activityToMermaid(d: ActivityDiagram): string {
  const known = new Set(d.elements.filter((e) => e.kind === 'partition').map((e) => e.id))
  const flows = d.relations.map((r) => {
    const label = r.label ? `|${quote(oneLine(r.label.replace(/^\[(.*)\]$/, '$1')))}|` : ''
    return `  ${r.from} -->${label} ${r.to}`
  })
  return [
    ...titleBlock(d.title),
    `flowchart ${d.direction ?? 'TB'}`,
    ...writeScope(d, undefined, 1, known),
    ...flows,
  ].join('\n')
}

export { activityToMermaid, isFlowchart, parseFlowchart }
