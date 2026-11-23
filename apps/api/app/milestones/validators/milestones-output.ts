import type { MilestoneDiagram } from '#app/milestones/models/milestone'
import type { Paginated } from '#app/shared/pagination/paginate'

/** A row of an architecture's milestones: no view content. */
export type MilestoneOutput = {
  id: number
  architectureId: number
  name: string
  diagramCount: number
  createdAt: string
}

/** A milestone with the views it keeps, in display order. */
export type MilestoneDetailOutput = MilestoneOutput & {
  diagrams: MilestoneDiagram[]
}

/** Shape returned by `GET /architectures/:id/milestones`. */
export type MilestonesListOutput = Paginated<MilestoneOutput>
