// Every diagram of a project, read through its architectures, for the code tab's pickers; and the
// names of a diagram's elements, whatever its kind.
import type { UmlSpec } from '@coreloom-uml/uml'
import { useQueries } from '@tanstack/react-query'

import { architectureQueryOptions, useArchitectures } from '@/lib/architectures'

export interface ProjectDiagram {
  id: number
  title: string
  kind: string
  architecture: string
  content: UmlSpec | null
}

/** Every diagram of the project, by architecture, for the picker. */
export function useProjectDiagrams(projectId: number) {
  const architectures = useArchitectures(projectId, '')
  const ids = architectures.data?.data.map((architecture) => architecture.id) ?? []
  const details = useQueries({
    queries: ids.map((id) => architectureQueryOptions(id)),
    combine: (results) => ({
      pending: results.some((result) => result.isPending),
      failed: results.some((result) => result.isError),
      diagrams: results.flatMap((result): ProjectDiagram[] =>
        (result.data?.diagrams ?? []).map((diagram) => ({
          id: diagram.id,
          title: diagram.title,
          kind: diagram.kind,
          architecture: result.data?.title ?? '',
          content: diagram.content,
        })),
      ),
    }),
  })
  return {
    pending: architectures.isPending || details.pending,
    failed: architectures.isError || details.failed,
    diagrams: details.diagrams,
    refetch: () => void architectures.refetch(),
  }
}

/** Element ids to their names, from whatever lists the diagram kind has. */
export function elementNames(spec: UmlSpec | null): Map<string, string> {
  const names = new Map<string, string>()
  if (!spec) return names
  for (const value of Object.values(spec)) {
    if (!Array.isArray(value)) continue
    for (const item of value as unknown[]) {
      if (typeof item !== 'object' || item === null || !('id' in item)) continue
      const { id } = item
      if (typeof id !== 'string') continue
      const label = 'label' in item ? item.label : undefined
      names.set(id, typeof label === 'string' && label ? label : id)
    }
  }
  return names
}
