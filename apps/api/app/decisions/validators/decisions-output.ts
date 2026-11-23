import type { DecisionOption, DecisionStatus } from '#app/decisions/constants/decision'
import type { Paginated } from '#app/shared/pagination/paginate'

/** JSON shape of a decision, with the ids of what it is linked to. */
export type DecisionOutput = {
  id: number
  projectId: number
  title: string
  context: string | null
  options: DecisionOption[]
  chosen: string | null
  consequences: string | null
  status: DecisionStatus
  supersededById: number | null
  requirementIds: number[]
  diagramIds: number[]
  createdAt: string
  updatedAt: string
}

/** Shape returned by `GET /projects/:id/decisions`. */
export type DecisionsListOutput = Paginated<DecisionOutput>
