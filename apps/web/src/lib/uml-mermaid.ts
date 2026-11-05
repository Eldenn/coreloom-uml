import type { UmlParseResult, UmlSpec } from '@/lib/uml'
import type { ActivityDiagram, DeploymentDiagram, UseCaseDiagram } from '@/lib/uml-elements'
import { c4Level, c4ToMermaid, parseC4Diagram } from '@/lib/uml-mermaid-c4'
import { classToMermaid, parseClassDiagram } from '@/lib/uml-mermaid-class'
import { erToMermaid, parseErDiagram } from '@/lib/uml-mermaid-er'
import { activityToMermaid, isFlowchart, parseFlowchart } from '@/lib/uml-mermaid-flowchart'
import { parseSequenceDiagram, sequenceToMermaid } from '@/lib/uml-mermaid-sequence'
import { parseStateDiagram, stateToMermaid } from '@/lib/uml-mermaid-state'
import { frontMatter, sourceLines } from '@/lib/uml-text'

/** Reads Mermaid text whose first line names one of the supported diagram types. */
function parseMermaid(input: string): UmlParseResult {
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

/** The diagrams Mermaid can write: every kind but use case and deployment. */
type MermaidSpec = Exclude<UmlSpec, UseCaseDiagram | DeploymentDiagram>

function isMermaidSpec(diagram: UmlSpec): diagram is MermaidSpec {
  return diagram.kind !== 'usecase' && diagram.kind !== 'deployment'
}

/** A use case or deployment diagram as the flowchart that draws like it: frames, boxes, links. */
function asFlowchart(d: UseCaseDiagram | DeploymentDiagram): ActivityDiagram {
  const holders = new Set(d.elements.flatMap((e) => (e.parent ? [e.parent] : [])))
  return {
    kind: 'activity',
    ...(d.title ? { title: d.title } : {}),
    direction: d.direction ?? (d.kind === 'usecase' ? 'LR' : 'TB'),
    elements: d.elements.map((e) => ({
      id: e.id,
      kind: e.kind === 'system' || holders.has(e.id) ? 'partition' : 'action',
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
 * The diagram as Mermaid text. Use case and deployment diagrams, which Mermaid lacks, come out as
 * a flowchart (see `isMermaidSpec`).
 */
function toMermaid(diagram: UmlSpec): string {
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
      return activityToMermaid(asFlowchart(diagram))
  }
}

export { isMermaidSpec, type MermaidSpec, parseMermaid, toMermaid }
