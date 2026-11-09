import type { ArchitectureVisibility } from '#app/architectures/constants/visibility'
import type { DiagramOutput } from '#app/diagrams/validators/diagrams-output'
import type { Paginated } from '#app/shared/pagination/paginate'

/** JSON shape of an architecture's own fields. */
export type ArchitectureOutput = {
  id: number
  /** The project that holds it, or null when it stands on its own. */
  projectId: number | null
  title: string
  description: string | null
  visibility: ArchitectureVisibility
  createdAt: string
  updatedAt: string
}

/** A row of the gallery: the first diagram stands in as its thumbnail. */
export type ArchitectureSummaryOutput = ArchitectureOutput & {
  diagramCount: number
  cover: Pick<DiagramOutput, 'kind' | 'content'> | null
}

/** An architecture with all its diagrams, in display order. */
export type ArchitectureDetailOutput = ArchitectureOutput & {
  diagrams: DiagramOutput[]
}

/** Shape returned by `GET /architectures`. */
export type ArchitecturesListOutput = Paginated<ArchitectureSummaryOutput>
