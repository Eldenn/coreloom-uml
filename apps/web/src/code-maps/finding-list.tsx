// The findings of one diagram in a conformance review, shared by the Code tab and the architecture
// editor: cards (open and worst first) to mark done, dismiss or open again, narrowed to one element
// when its badge was pressed.
import { Button } from '@/components/ui/button'
import { FindingCard } from '@/components/ui/finding-card'
import { toast } from '@/components/ui/sonner'
import { getErrorMessage } from '@/lib/client'
import { codeHref } from '@/lib/code-maps'
import { FINDING_STATUS, sortFindings } from '@/lib/code-review-findings'
import { type CodeReview, type CodeReviewFinding, useResolveFinding } from '@/lib/code-reviews'
import { useT } from '@/lib/locale'

export function FindingList({
  projectId,
  review,
  findings,
  names,
  focus,
  onFocusChange,
}: {
  projectId: number
  review: CodeReview
  /** The findings of one diagram. */
  findings: readonly CodeReviewFinding[]
  /** Element ids to the names shown on the cards. */
  names: ReadonlyMap<string, string>
  /** The element whose findings alone are listed; all of them when null. */
  focus: string | null
  onFocusChange: (element: string | null) => void
}) {
  const t = useT()
  const resolve = useResolveFinding(projectId, review.id)
  const nameOf = (id: string | null) => (id === null ? t.code.wholeDiagram : (names.get(id) ?? id))
  const sorted = sortFindings(findings)
  const listed = focus === null ? sorted : sorted.filter((finding) => finding.elementId === focus)
  return (
    <>
      {focus !== null && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          {t.code.onlyElement(nameOf(focus))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onFocusChange(null)
            }}
          >
            {t.code.showAll}
          </Button>
        </div>
      )}
      {listed.length === 0 ? (
        <p className="m-0 text-[13px] text-muted-foreground">{t.code.reviewNoFindings}</p>
      ) : (
        listed.map((finding) => (
          <FindingCard
            key={finding.id}
            title={nameOf(finding.elementId)}
            status={FINDING_STATUS[finding.status]}
            statusLabel={t.code.conformance[finding.status]}
            severity={finding.severity}
            comment={finding.comment}
            evidence={finding.evidence.map((place) => {
              const href = codeHref(review, place.key, place.line)
              return {
                path: place.path && !place.key.endsWith('/') ? place.path : place.key,
                ...(place.line !== undefined ? { line: place.line } : {}),
                ...(href ? { href } : {}),
              }
            })}
            resolution={finding.resolution}
            onResolutionChange={(resolution) => {
              resolve.mutate(
                { id: finding.id, resolution },
                {
                  onError: (error) => {
                    toast.error(getErrorMessage(error, t.code.reviewResolveFailed))
                  },
                },
              )
            }}
            {...(finding.elementId !== null
              ? {
                  onSelect: () => {
                    onFocusChange(finding.elementId)
                  },
                }
              : {})}
            selected={focus !== null && finding.elementId === focus}
            disabled={resolve.isPending}
          />
        ))
      )}
    </>
  )
}
