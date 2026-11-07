import {
  type DiagramTextFormat,
  detectDiagramTextFormat,
  parseDiagramText,
  type UmlProblem,
  type UmlSpec,
  validateDiagram,
} from '@coreloom-uml/uml'
import { DIAGRAM_CONTENT_MAX_BYTES } from '#app/diagrams/constants/diagram'

/** What a diagram's content was checked into: the diagram to store, or why it can't be. */
export type DiagramCheck =
  | { diagram: UmlSpec; format: DiagramTextFormat; problems: UmlProblem[] }
  | { diagram: null; format: DiagramTextFormat | null; problems: UmlProblem[] }

/** The body of a 422 for content that isn't a diagram: one entry per problem found. */
export function invalidDiagram(problems: UmlProblem[]) {
  return { error: { message: 'This diagram is not valid.', problems } }
}

const TOO_LARGE: UmlProblem = {
  line: 0,
  severity: 'error',
  code: 'unsupported',
  text: `The diagram is larger than ${DIAGRAM_CONTENT_MAX_BYTES} bytes as JSON.`,
}

const UNKNOWN_FORMAT: UmlProblem = {
  line: 0,
  severity: 'error',
  code: 'header',
  text: 'The format could not be told from the text: pass `format` (json, mermaid or plantuml).',
}

/** A stored diagram stays under DIAGRAM_CONTENT_MAX_BYTES as JSON (RM-14). */
function sizeProblems(diagram: UmlSpec): UmlProblem[] {
  return Buffer.byteLength(JSON.stringify(diagram)) > DIAGRAM_CONTENT_MAX_BYTES ? [TOO_LARGE] : []
}

/**
 * Checks a diagram sent as JSON against the shared UML schema and the size limit. Every save of
 * content goes through here, so nothing the editors and the conversions can't read is stored.
 */
export function checkDiagramValue(value: unknown): DiagramCheck {
  const { diagram, problems } = validateDiagram(value)
  if (!diagram) return { diagram: null, format: 'json', problems }
  const tooLarge = sizeProblems(diagram)
  if (tooLarge.length) return { diagram: null, format: 'json', problems: tooLarge }
  return { diagram, format: 'json', problems }
}

/**
 * Reads a diagram from its text, in the given format or the one the text announces. A line the
 * parser couldn't read is an error, not something to drop silently: the diagram is only returned
 * when every problem is a warning.
 */
export function checkDiagramText(text: string, format?: DiagramTextFormat): DiagramCheck {
  const resolved = format ?? detectDiagramTextFormat(text)
  if (!resolved) return { diagram: null, format: null, problems: [UNKNOWN_FORMAT] }

  const { diagram, problems } = parseDiagramText(text, resolved)
  if (!diagram || problems.some((p) => p.severity === 'error')) {
    return { diagram: null, format: resolved, problems }
  }
  // The parsers build the model by hand: check it like a JSON body before it is stored.
  const checked = checkDiagramValue(diagram)
  if (!checked.diagram) return { ...checked, format: resolved }
  return { diagram: checked.diagram, format: resolved, problems }
}
