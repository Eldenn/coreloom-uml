// The parts of views a decision names, under the view each belongs to; a part its view no longer
// has is marked, as the design review reports it.
import { Badge } from '@/components/ui/badge'
import { type DecisionPart, partKey, partMissing } from '@/lib/decision-parts'
import { useT } from '@/lib/locale'
import type { ProjectDiagram } from '@/lib/project-diagrams'

export function DecisionParts({
  parts,
  diagrams,
}: {
  parts: readonly DecisionPart[]
  /** The project's diagrams, once loaded: until then no part is marked. */
  diagrams: readonly ProjectDiagram[]
}) {
  const t = useT()
  if (parts.length === 0) return null
  const views = [...new Set(parts.map((part) => part.diagramId))]
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
      {views.map((diagramId) => {
        const diagram = diagrams.find((item) => item.id === diagramId)
        return (
          <li key={diagramId} className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground">{diagram?.title ?? `#${diagramId}`}:</span>
            {parts
              .filter((part) => part.diagramId === diagramId)
              .map((part) => {
                const gone = diagram !== undefined && partMissing(diagram.content, part)
                return (
                  <Badge key={partKey(part)} variant={gone ? 'warning' : 'outline'}>
                    {gone ? t.design.partGone(part.label) : part.label}
                  </Badge>
                )
              })}
          </li>
        )
      })}
    </ul>
  )
}
