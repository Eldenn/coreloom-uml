import { CodeReviewDiagramStatus, CodeReviewStatus } from '#app/code-reviews/constants/code-review'
import type CodeReview from '#app/code-reviews/models/code-review'
import type CodeReviewFinding from '#app/code-reviews/models/code-review-finding'
import type {
  CodeReviewFindingOutput,
  CodeReviewOutput,
} from '#app/code-reviews/validators/code-reviews-output'

export function serializeCodeReview(review: CodeReview, openCount: number): CodeReviewOutput {
  return {
    id: review.id,
    projectId: review.projectId,
    codeMapId: review.codeMapId,
    repositoryUrl: review.repositoryUrl,
    branch: review.branch,
    commitSha: review.commitSha,
    providerKind: review.providerKind,
    model: review.model,
    includeSnippets: review.includeSnippets,
    locale: review.locale,
    status: review.diagrams.some((diagram) => diagram.status === CodeReviewDiagramStatus.Pending)
      ? CodeReviewStatus.Running
      : CodeReviewStatus.Done,
    // A review stored before the source was read has no `source` on its diagrams.
    diagrams: review.diagrams.map((diagram) => ({ ...diagram, source: diagram.source ?? null })),
    openCount,
    createdAt: review.createdAt.toISO() ?? '',
    updatedAt: review.updatedAt.toISO() ?? '',
  }
}

export function serializeCodeReviewFinding(finding: CodeReviewFinding): CodeReviewFindingOutput {
  return {
    id: finding.id,
    codeReviewId: finding.codeReviewId,
    diagramId: finding.diagramId,
    elementId: finding.elementId,
    status: finding.status,
    severity: finding.severity,
    comment: finding.comment,
    evidence: finding.evidence,
    resolution: finding.resolution,
    createdAt: finding.createdAt.toISO() ?? '',
    updatedAt: finding.updatedAt.toISO() ?? '',
  }
}
