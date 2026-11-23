// The parts of views a decision names, each by its view, its type and the one line that names it
// there (`umlParts` of @coreloom-uml/uml, the drawing's own names). An element without a name of
// its own (a start, a fork) goes by its English role word, as the API's design review reads it.
import { hasUmlPart, type UmlPart, umlParts, type UmlSpec } from '@coreloom-uml/uml'

import type { Decision } from '@/lib/design-records'

export type DecisionPart = Decision['parts'][number]

/** One text per part, for a multi-select's value. */
export const partKey = (part: DecisionPart) =>
  JSON.stringify([part.diagramId, part.type, part.label])

export function parsePartKey(key: string): DecisionPart {
  const [diagramId, type, label] = JSON.parse(key) as [number, DecisionPart['type'], string]
  return { diagramId, type, label }
}

/** Every part of a view; none while its content is unknown. */
export const viewParts = (content: UmlSpec | null): UmlPart[] => (content ? umlParts(content) : [])

/** Whether the view no longer has this part (renamed or removed since the decision named it). */
export const partMissing = (content: UmlSpec | null, part: DecisionPart) =>
  !content || !hasUmlPart(content, part)
