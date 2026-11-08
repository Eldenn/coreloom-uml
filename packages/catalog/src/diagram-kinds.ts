/**
 * The kinds of diagram a project can hold, as `packages/uml` and the API's `DIAGRAM_KINDS` name
 * them (an API test keeps the two lists equal). A skill may fit projects that hold one of them.
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
