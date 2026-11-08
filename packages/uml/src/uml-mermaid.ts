// Coreloom UML — Mermaid text for UML diagrams. `parseMermaid` reads the subset of Mermaid that
// covers class, sequence, state, entity–relationship and C4 diagrams, and flowcharts as activity
// diagrams, into Coreloom's UML model, tolerantly: what it can't read becomes a problem on its line
// and the rest still draws. `toMermaid` writes a diagram back (positions people dragged go in a
// `%% coreloom-layout {…}` comment line, read back by `parseMermaid`). Mermaid has no use case or deployment diagrams: `toMermaid` writes them as a
// flowchart any Mermaid renderer draws, which reads back as an activity diagram (PlantUML and JSON
// keep them whole; `isMermaidSpec` says which kinds round-trip).
// No `mermaid` dependency: the parsers are plain functions, and nothing is rendered as HTML.
import type { UmlParseResult, UmlSpec } from './uml.ts'
import type {
  ActivityDiagram,
  ComponentDiagram,
  DeploymentDiagram,
  PackageDiagram,
  UseCaseDiagram,
} from './uml-elements.ts'
import { c4Level, c4ToMermaid, parseC4Diagram } from './uml-mermaid-c4.ts'
import { classToMermaid, parseClassDiagram } from './uml-mermaid-class.ts'
import { erToMermaid, parseErDiagram } from './uml-mermaid-er.ts'
import { activityToMermaid, isFlowchart, parseFlowchart } from './uml-mermaid-flowchart.ts'
import { parseSequenceDiagram, sequenceToMermaid } from './uml-mermaid-sequence.ts'
import { parseStateDiagram, stateToMermaid } from './uml-mermaid-state.ts'
import { frontMatter, layoutLine, sourceLines, withLayoutLine } from './uml-text.ts'

/** Reads Mermaid text whose first line names one of the supported diagram types. */
function parseMermaid(input: string): UmlParseResult {
  return withLayoutLine(readMermaid(input), input)
}

function readMermaid(input: string): UmlParseResult {
  const { title, body } = frontMatter(input)
  const all = sourceLines(body)
  const header = all.at(0)
  const lines = all.slice(1)
  if (!header) return { diagram: null, problems: [{ line: 0, severity: 'error', code: 'empty' }] }
  const word = header.text.split(/\s+/)[0] ?? ''
  switch (word) {
    case 'classDiagram':
    case 'classDiagram-v2':
      return parseClassDiagram(lines, title)
    case 'stateDiagram':
    case 'stateDiagram-v2':
      return parseStateDiagram(lines, title)
    case 'erDiagram':
      return parseErDiagram(lines, title)
    case 'sequenceDiagram':
      return parseSequenceDiagram(lines, title)
  }
  if (isFlowchart(header.text)) return parseFlowchart(header.text, lines, title)
  const level = c4Level(word)
  if (level) return parseC4Diagram(level, lines, title)
  return {
    diagram: null,
    problems: [{ line: header.no, severity: 'error', code: 'header', text: header.text }],
  }
}

/** Kinds Mermaid has no diagram for. */
type FlowchartOnly = UseCaseDiagram | DeploymentDiagram | ComponentDiagram | PackageDiagram

/** The diagrams Mermaid can write: every kind but use case, deployment, component and package. */
type MermaidSpec = Exclude<UmlSpec, FlowchartOnly>

const FLOWCHART_ONLY: ReadonlySet<UmlSpec['kind']> = new Set([
  'usecase',
  'deployment',
  'component',
  'package',
])

function isMermaidSpec(diagram: UmlSpec): diagram is MermaidSpec {
  return !FLOWCHART_ONLY.has(diagram.kind)
}

/** A diagram Mermaid lacks as the flowchart that draws like it: frames, boxes, links. */
function asFlowchart(d: FlowchartOnly): ActivityDiagram {
  const holders = new Set(d.elements.flatMap((e) => (e.parent ? [e.parent] : [])))
  return {
    kind: 'activity',
    ...(d.title ? { title: d.title } : {}),
    direction: d.direction ?? (d.kind === 'usecase' ? 'LR' : 'TB'),
    elements: d.elements.map((e) => ({
      id: e.id,
      kind:
        e.kind === 'system' || e.kind === 'package' || holders.has(e.id) ? 'partition' : 'action',
      label: e.label ?? e.id,
      ...(e.parent ? { parent: e.parent } : {}),
    })),
    relations: d.relations.map((r) => {
      const keyword = r.kind && !['association', 'link'].includes(r.kind) ? `«${r.kind}»` : ''
      const label = [keyword, r.label].filter(Boolean).join(' ')
      return { from: r.from, to: r.to, ...(label ? { label } : {}) }
    }),
  }
}

/**
 * The diagram as Mermaid text. Use case, deployment, component and package diagrams, which Mermaid
 * lacks, come out as a flowchart (see `isMermaidSpec`).
 */
function toMermaid(diagram: UmlSpec): string {
  const text = mermaidText(diagram)
  const line = layoutLine(diagram, '%%')
  return line ? `${text.replace(/\n*$/, '')}\n${line}\n` : text
}

function mermaidText(diagram: UmlSpec): string {
  switch (diagram.kind) {
    case 'class':
      return classToMermaid(diagram)
    case 'state':
      return stateToMermaid(diagram)
    case 'er':
      return erToMermaid(diagram)
    case 'sequence':
      return sequenceToMermaid(diagram)
    case 'c4':
      return c4ToMermaid(diagram)
    case 'activity':
      return activityToMermaid(diagram)
    case 'usecase':
    case 'deployment':
    case 'component':
    case 'package':
      return activityToMermaid(asFlowchart(diagram))
  }
}

export { isMermaidSpec, type MermaidSpec, parseMermaid, toMermaid }
