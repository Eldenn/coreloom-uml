// One diagram of a conformance review: the drawing with a badge on each element the findings are
// about (its worst finding, and how many are still open), and the findings as cards, to mark done,
// dismiss or open again. Each card cites the places in the code it rests on.
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FindingCard, type FindingStatus } from '@/components/ui/finding-card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'
import { type UmlAnnotation, UmlDiagram } from '@/components/ui/uml-diagram'
import { getErrorMessage } from '@/lib/client'
import { codeHref } from '@/lib/code-maps'
import {
  type CodeReview,
  type CodeReviewDiagram,
  type CodeReviewFinding,
  type ConformanceStatus,
  useResolveFinding,
} from '@/lib/code-reviews'
import { useT } from '@/lib/locale'
import { elementNames, type ProjectDiagram } from '@/lib/project-diagrams'

/** How a finding shows on the drawing and on its card. */
const FINDING_STATUS: Record<ConformanceStatus, FindingStatus> = {
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
function annotationsOf(findings: readonly CodeReviewFinding[], t: ReturnType<typeof useT>) {
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

export function ReviewedDiagram({
  projectId,
  review,
  entry,
  entries,
  diagram,
  findings,
  onDiagramChange,
}: {
  projectId: number
  review: CodeReview
  entry: CodeReviewDiagram
  entries: CodeReviewDiagram[]
  diagram: ProjectDiagram | undefined
  findings: CodeReviewFinding[]
  onDiagramChange: (id: number) => void
}) {
  const t = useT()
  const [focus, setFocus] = React.useState<string | null>(null)
  const resolve = useResolveFinding(projectId, review.id)
  const names = elementNames(diagram?.content ?? null)
  const nameOf = (id: string | null) => (id === null ? t.code.wholeDiagram : (names.get(id) ?? id))
  const sorted = [...findings].sort(
    (a, b) =>
      RESOLUTION_RANK[a.resolution] - RESOLUTION_RANK[b.resolution] ||
      RANK[FINDING_STATUS[b.status]] - RANK[FINDING_STATUS[a.status]] ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  )
  const listed = focus === null ? sorted : sorted.filter((finding) => finding.elementId === focus)
  const pickerId = React.useId()
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card className="min-w-0">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-2 sm:w-96">
            <Label htmlFor={pickerId}>{t.code.diagram}</Label>
            <Select
              value={String(entry.diagramId)}
              onValueChange={(next) => {
                setFocus(null)
                onDiagramChange(Number(next))
              }}
            >
              <SelectTrigger id={pickerId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {entries.map((item) => (
                  <SelectItem key={item.diagramId} value={String(item.diagramId)}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CardDescription>{t.code.reviewFound(entry.findingCount)}</CardDescription>
        </CardHeader>
        <CardContent>
          {diagram?.content ? (
            <UmlDiagram
              diagram={diagram.content}
              label={diagram.title}
              height={460}
              highlighted={focus === null ? [] : [focus]}
              annotations={annotationsOf(findings, t)}
              onAnnotationSelect={setFocus}
            />
          ) : (
            <p className="m-0 text-[13px] text-muted-foreground">{t.code.reviewDiagramGone}</p>
          )}
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t.code.reviewFindings}</CardTitle>
          <CardDescription>{t.code.reviewFindingsHint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {focus !== null && (
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              {t.code.onlyElement(nameOf(focus))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFocus(null)
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
                        setFocus(finding.elementId)
                      },
                    }
                  : {})}
                selected={focus !== null && finding.elementId === focus}
                disabled={resolve.isPending}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
