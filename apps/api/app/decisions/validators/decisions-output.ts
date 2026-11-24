import type {
  CodeReviewResolution,
  ConformanceSeverity,
} from '#app/code-reviews/constants/code-review'
import type {
  DecisionOption,
  DecisionOrigin,
  DecisionPartRef,
  DecisionStatus,
} from '#app/decisions/constants/decision'
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
  /** The parts of views it names, in the order they were given. */
  parts: DecisionPartRef[]
  /** `agent` with `proposed`: a coding agent's proposal waiting for the owner's review. */
  origin: DecisionOrigin
  /** For a coding agent's proposal: the decision it says no longer holds. */
  supersedesId: number | null
  createdAt: string
  updatedAt: string
}

/** Shape returned by `GET /projects/:id/decisions`. */
export type DecisionsListOutput = Paginated<DecisionOutput>

/** A finding of the owner's model about an architecture, with what it names when it still exists. */
export type DesignModelFindingOutput = {
  id: number
  architectureId: number
  requirementId: number | null
  decisionId: number | null
  diagramId: number | null
  severity: ConformanceSeverity
  comment: string
  resolution: CodeReviewResolution
  createdAt: string
}
