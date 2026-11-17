import {
  codeConformance,
  latestReadyCodeMap,
  matchDiagrams,
  projectDiagrams,
  undocumentedProcesses,
} from '#app/code-maps/services/code-conformance'
import { readCodeMapFile } from '#app/code-maps/services/code-map-storage'
import {
  CodeReviewDiagramStatus,
  CodeReviewResolution,
} from '#app/code-reviews/constants/code-review'
import CodeReview from '#app/code-reviews/models/code-review'
import CodeReviewFinding from '#app/code-reviews/models/code-review-finding'
import type Project from '#app/projects/models/project'
import type User from '#app/users/models/user'

const NO_READY_MAP =
  'No code map is ready in this project: send one with `coreloom-uml map push`, or import one in the app.'

/** The open findings of the newest review that reviewed a diagram. */
type ReviewOfDiagram = {
  reviewId: number
  reviewedAt: string | null
  repositoryUrl: string | null
  branch: string | null
  commitSha: string | null
  findings: {
    id: number
    elementId: string | null
    status: string
    severity: string
    comment: string
    evidence: { key: string; path?: string; line?: number }[]
  }[]
}

/**
 * For each diagram of the project (or the one asked for): the open findings of the newest
 * conformance review that reviewed it, and the findings of the deterministic match against the
 * project's newest ready map. Both are read from what is stored: no model is called.
 */
export async function getCodeConformance(project: Project, user: User, diagramId?: number) {
  let diagrams = await projectDiagrams(project.id, user)
  if (diagramId !== undefined) {
    diagrams = diagrams.filter(({ diagram }) => diagram.id === diagramId)
    if (diagrams.length === 0) return null
  }

  const reviews = await CodeReview.query()
    .where('projectId', project.id)
    .where('userId', user.id)
    .orderBy('createdAt', 'desc')
    .orderBy('id', 'desc')
  const latest = new Map<number, CodeReview>()
  for (const { diagram } of diagrams) {
    const review = reviews.find((item) =>
      item.diagrams.some(
        (entry) => entry.diagramId === diagram.id && entry.status === CodeReviewDiagramStatus.Done,
      ),
    )
    if (review) latest.set(diagram.id, review)
  }
  const findings = latest.size
    ? await CodeReviewFinding.query()
        .whereIn(
          'codeReviewId',
          [...new Set(latest.values())].map((review) => review.id),
        )
        .where('resolution', CodeReviewResolution.Open)
        .whereNot('status', 'conforms')
        .orderBy('id', 'asc')
    : []

  const codeMap = await latestReadyCodeMap(project.id)
  const conformance = codeMap
    ? await codeConformance(codeMap, await readCodeMapFile(codeMap.storageKey as string), user)
    : null

  return {
    projectId: project.id,
    codeMap: conformance?.codeMap ?? null,
    undocumentedProcesses: conformance?.undocumentedProcesses ?? null,
    diagrams: diagrams.map(({ diagram, architecture }) => {
      const review = latest.get(diagram.id)
      const reviewed: ReviewOfDiagram | null = review
        ? {
            reviewId: review.id,
            reviewedAt:
              review.diagrams.find((entry) => entry.diagramId === diagram.id)?.reviewedAt ?? null,
            repositoryUrl: review.repositoryUrl,
            branch: review.branch,
            commitSha: review.commitSha,
            findings: findings
              .filter(
                (finding) => finding.codeReviewId === review.id && finding.diagramId === diagram.id,
              )
              .map((finding) => ({
                id: finding.id,
                elementId: finding.elementId,
                status: finding.status,
                severity: finding.severity,
                comment: finding.comment,
                evidence: finding.evidence,
              })),
          }
        : null
      const matched = conformance?.diagrams.find((item) => item.diagramId === diagram.id)
      return {
        diagramId: diagram.id,
        title: diagram.title,
        kind: diagram.kind,
        architectureId: architecture.id,
        architectureTitle: architecture.title,
        review: reviewed,
        codeMatch: matched ? { counts: matched.counts, findings: matched.findings } : null,
      }
    }),
    ...(codeMap ? {} : { note: NO_READY_MAP }),
  }
}

/** The processes no diagram documents, from the project's newest ready map. */
export async function listUndocumentedProcesses(project: Project, user: User) {
  const codeMap = await latestReadyCodeMap(project.id)
  if (!codeMap) return null
  const map = await readCodeMapFile(codeMap.storageKey as string)
  const matches = await matchDiagrams(await projectDiagrams(project.id, user), map)
  return undocumentedProcesses(codeMap, map, matches)
}

export { NO_READY_MAP }
