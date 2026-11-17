// How the findings of a conformance review show: the status each one takes on a drawing and a
// card, the badge each element gets (its worst finding, and how many are still open), the order
// they are listed in.
import type { FindingStatus } from '@/components/ui/finding-card'
import type { UmlAnnotation } from '@/components/ui/uml-diagram'
import type { CodeReviewFinding, ConformanceStatus } from '@/lib/code-reviews'
import type { useT } from '@/lib/locale'

/** How a finding shows on the drawing and on its card. */
export const FINDING_STATUS: Record<ConformanceStatus, FindingStatus> = {
  conforms: 'ok',
  deviates: 'warning',
  'missing-in-diagram': 'warning',
  'missing-in-code': 'error',
  uncertain: 'unknown',
}
/** The worst status wins an element's badge. */
const RANK: Record<FindingStatus, number> = { error: 3, warning: 2, unknown: 1, ok: 0 }
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const
const RESOLUTION_RANK = { open: 0, done: 1, dismissed: 2 } as const

/** The badge each element gets: its worst finding, and how many are still open. */
export function annotationsOf(
  findings: readonly CodeReviewFinding[],
  t: ReturnType<typeof useT>,
): UmlAnnotation[] {
  const byElement = new Map<string, { status: FindingStatus; open: number }>()
  for (const finding of findings) {
    if (finding.elementId === null || finding.resolution === 'dismissed') continue
    const status = FINDING_STATUS[finding.status]
    const open = finding.resolution === 'open' && status !== 'ok' ? 1 : 0
    const known = byElement.get(finding.elementId)
    byElement.set(finding.elementId, {
      status: known && RANK[known.status] >= RANK[status] ? known.status : status,
      open: (known?.open ?? 0) + open,
    })
  }
  return [...byElement].map(([element, { status, open }]): UmlAnnotation => ({
    element,
    status,
    label: t.code.annotation[status],
    ...(open ? { count: open } : {}),
  }))
}

/** Open findings first, then the worst, then the most severe. */
export function sortFindings(findings: readonly CodeReviewFinding[]) {
  return [...findings].sort(
    (a, b) =>
      RESOLUTION_RANK[a.resolution] - RESOLUTION_RANK[b.resolution] ||
      RANK[FINDING_STATUS[b.status]] - RANK[FINDING_STATUS[a.status]] ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  )
}

/** Findings still to look at: open, and not a plain "matches the code". */
export function openCount(findings: readonly CodeReviewFinding[]) {
  return findings.filter(
    (finding) => finding.resolution === 'open' && FINDING_STATUS[finding.status] !== 'ok',
  ).length
}
