import type { LlmFailureReason } from '@coreloom-uml/llm'
import type { SourceAbsence } from '#app/code-maps/services/code-source'

export {
  CONFORMANCE_SEVERITIES,
  CONFORMANCE_STATUSES,
  type ConformanceSeverity,
  type ConformanceStatus,
} from '@coreloom-uml/llm'

/** What the owner did with a finding: `open` until marked done or dismissed. */
export const CodeReviewResolution = {
  Open: 'open',
  Done: 'done',
  Dismissed: 'dismissed',
} as const
export type CodeReviewResolution = (typeof CodeReviewResolution)[keyof typeof CodeReviewResolution]
export const CODE_REVIEW_RESOLUTIONS = Object.values(CodeReviewResolution)

/** Where one diagram of a review stands: each one is a call the browser makes in turn. */
export const CodeReviewDiagramStatus = {
  Pending: 'pending',
  Done: 'done',
  Failed: 'failed',
} as const
export type CodeReviewDiagramStatus =
  (typeof CodeReviewDiagramStatus)[keyof typeof CodeReviewDiagramStatus]

/** A review is `running` while one of its diagrams is pending, `done` after. */
export const CodeReviewStatus = { Running: 'running', Done: 'done' } as const
export type CodeReviewStatus = (typeof CodeReviewStatus)[keyof typeof CodeReviewStatus]

/** One diagram of a review, as stored in `code_reviews.diagrams`. */
export type CodeReviewDiagram = {
  diagramId: number
  title: string
  kind: string
  status: CodeReviewDiagramStatus
  /** Why the last call failed. */
  reason: LlmFailureReason | null
  findingCount: number
  /** Findings dropped because they cited places they were not given. */
  dropped: number
  /** Part of the code was left out to fit the model's budget. */
  truncated: boolean
  /**
   * What was read of the source for the last call: the files sent, those left out, or why none
   * was read. Null when the review does not read the source, or the diagram's kind needs none.
   */
  source: { files: number; omitted: number; absence: SourceAbsence | null } | null
  reviewedAt: string | null
}

/** A place cited by a finding: the code key, and where it is when the map said. */
export type CodeReviewEvidence = { key: string; path?: string; line?: number }

/** The diagram kinds the code map has a counterpart for (see `matchDiagram`). */
export const REVIEWABLE_DIAGRAM_KINDS = ['package', 'component', 'class', 'sequence', 'c4'] as const

/**
 * The kinds reviewed with the source of their files, in a review started with `includeSnippets`:
 * those that draw what only the code shows (order, conditions, loops, attributes and types).
 */
export const SOURCE_REVIEW_KINDS: readonly string[] = ['class', 'sequence']

export const CODE_REVIEW_LOCALES = ['en', 'fr'] as const

export const CODE_REVIEW_LIMITS = {
  /** Reviews kept per project: starting an eleventh deletes the oldest, with its findings. */
  perProject: 10,
  diagramsPerReview: 50,
} as const
