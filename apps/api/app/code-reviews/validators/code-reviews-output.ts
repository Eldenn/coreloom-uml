import type {
  CodeReviewDiagram,
  CodeReviewEvidence,
  CodeReviewResolution,
  CodeReviewStatus,
  ConformanceSeverity,
  ConformanceStatus,
} from '#app/code-reviews/constants/code-review'
import type { Paginated } from '#app/shared/pagination/paginate'

/** JSON shape of a review, without its findings. */
export type CodeReviewOutput = {
  id: number
  projectId: number
  /** Null once the map is deleted. */
  codeMapId: number | null
  repositoryUrl: string | null
  branch: string | null
  commitSha: string | null
  providerKind: string | null
  model: string | null
  includeSnippets: boolean
  locale: 'en' | 'fr'
  status: CodeReviewStatus
  diagrams: CodeReviewDiagram[]
  /** Findings still open, all diagrams together. */
  openCount: number
  createdAt: string
  updatedAt: string
}

export type CodeReviewFindingOutput = {
  id: number
  codeReviewId: number
  diagramId: number
  elementId: string | null
  status: ConformanceStatus
  severity: ConformanceSeverity
  comment: string
  evidence: CodeReviewEvidence[]
  resolution: CodeReviewResolution
  createdAt: string
  updatedAt: string
}

/** `GET /code-reviews/:id`, and the answer of each diagram call. */
export type CodeReviewDetailOutput = {
  review: CodeReviewOutput
  findings: CodeReviewFindingOutput[]
}

/** `GET /projects/:id/code-reviews`, newest first. */
export type CodeReviewsListOutput = Paginated<CodeReviewOutput>

/** `PATCH /code-review-findings/:id` */
export type CodeReviewFindingUpdateOutput = { finding: CodeReviewFindingOutput }
