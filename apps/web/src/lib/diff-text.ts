import type { UmlSpec } from '@coreloom-uml/uml'

import { canWrite, type DiagramFormat, writeDiagram } from '@/components/diagram-editor'

/**
 * The text of one side of a diff, in the view's format as the editor writes it (JSON when that
 * format can't hold the kind). A view not created yet has no format: Mermaid, as the server saves it.
 */
export function diffText(spec: UmlSpec | null, format: DiagramFormat | null): string {
  if (!spec) return ''
  const wanted = format ?? 'mermaid'
  return writeDiagram(spec, canWrite(spec.kind, wanted) ? wanted : 'json')
}
