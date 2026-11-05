/**
 * The UML diagram kinds coreloom-ui reads and draws (`UmlDiagramKind` in its
 * `uml` library). Keep in step with coreloom-ui when it adds kinds.
 */
export const DIAGRAM_KINDS = [
  'class',
  'sequence',
  'state',
  'er',
  'c4',
  'usecase',
  'activity',
  'deployment',
  'component',
  'package',
] as const
export type DiagramKind = (typeof DIAGRAM_KINDS)[number]

/** The text format the editor last showed the diagram in: a preference only. */
export const DiagramFormat = {
  Mermaid: 'mermaid',
  PlantUml: 'plantuml',
  Json: 'json',
} as const
export type DiagramFormat = (typeof DiagramFormat)[keyof typeof DiagramFormat]
export const DIAGRAM_FORMATS = Object.values(DiagramFormat)

export const DIAGRAM_TITLE_MAX_LENGTH = 120
/** Upper bound on a diagram's stored JSON (RM-14). */
export const DIAGRAM_CONTENT_MAX_BYTES = 1_000_000

/** The first diagram of a new architecture, when the request names none. */
export const DEFAULT_DIAGRAM = { title: 'Context', kind: 'c4' } as const satisfies {
  title: string
  kind: DiagramKind
}
