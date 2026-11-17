// Conformance reviews: the user's own model (set in Settings, kept in this browser) checks
// diagrams of the project against the code map, one call per diagram, and the findings are kept.
// The model reads names, paths and links, never the code. Each diagram shows its findings as
// badges on the drawing and as cards to mark done or dismiss.
import { Link } from '@tanstack/react-router'
import { PlayIcon, PlusIcon, SquareIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'

import { ReviewedDiagram } from '@/code-maps/code-review-findings'
import { AgentPlan } from '@/components/ui/agent-plan'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Popconfirm } from '@/components/ui/popconfirm'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import type { AiPlan, AiPlanStepStatus } from '@/lib/ai'
import { getErrorMessage } from '@/lib/client'
import type { CodeMapDetail } from '@/lib/code-maps'
import {
  type CodeReview,
  type CodeReviewDiagram,
  REVIEWABLE_KINDS,
  type ReviewRunner,
  useCodeReview,
  useCodeReviews,
  useDeleteCodeReview,
  useReviewRunner,
  useStartCodeReview,
} from '@/lib/code-reviews'
import { useCoreloomI18n } from '@/lib/i18n'
import { useStoredProvider } from '@/lib/llm-provider'
import { type StoredProvider } from '@/lib/llm-provider'
import { useLocale, useT } from '@/lib/locale'
import { type ProjectDiagram, useProjectDiagrams } from '@/lib/project-diagrams'
import { useProviderFailureText } from '@/llm/provider-failure'

export function CodeReviews({
  projectId,
  map,
  reviewId,
  diagramId,
  onChange,
}: {
  projectId: number
  map: CodeMapDetail
  reviewId: number | undefined
  diagramId: number | undefined
  onChange: (next: { review?: number | undefined; diagram?: number | undefined }) => void
}) {
  const t = useT()
  const reviews = useCodeReviews(projectId)
  const diagrams = useProjectDiagrams(projectId)
  const [starting, setStarting] = React.useState(false)
  /** The review started from this page: it runs at once; an older one waits for Resume. */
  const [started, setStarted] = React.useState<number | null>(null)
  if (reviews.isPending || diagrams.pending) return <Skeleton className="h-64 w-full" />
  if (reviews.isError || diagrams.failed)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.code.reviewsFailed}</AlertTitle>
        <AlertDescription>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void reviews.refetch()
              diagrams.refetch()
            }}
          >
            {t.code.retry}
          </Button>
        </AlertDescription>
      </Alert>
    )
  const shown = reviews.data.find((review) => review.id === reviewId) ?? reviews.data.at(0)
  const reviewable = diagrams.diagrams.filter(
    (diagram) => diagram.content !== null && REVIEWABLE_KINDS.includes(diagram.kind),
  )
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.code.reviewTitle}</CardTitle>
          <CardDescription>{t.code.reviewHint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          {reviews.data.length > 0 && (
            <ReviewPicker
              reviews={reviews.data}
              value={shown?.id}
              onChange={(id) => {
                onChange({ review: id, diagram: undefined })
              }}
            />
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            {shown && (
              <DeleteReview
                projectId={projectId}
                reviewId={shown.id}
                onDeleted={() => {
                  onChange({ review: undefined, diagram: undefined })
                }}
              />
            )}
            <Button
              disabled={reviewable.length === 0}
              onClick={() => {
                setStarting(true)
              }}
            >
              <PlusIcon /> {t.code.reviewStart}
            </Button>
          </div>
          {reviewable.length === 0 && (
            <p className="m-0 w-full text-[13px] text-muted-foreground">{t.code.reviewNothing}</p>
          )}
        </CardContent>
      </Card>
      {shown ? (
        <ReviewView
          key={shown.id}
          projectId={projectId}
          reviewId={shown.id}
          autoRun={started === shown.id}
          diagrams={diagrams.diagrams}
          diagramId={diagramId}
          onDiagramChange={(id) => {
            onChange({ review: shown.id, diagram: id })
          }}
        />
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t.code.reviewEmpty}</EmptyTitle>
            <EmptyDescription>{t.code.reviewEmptyText}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <StartReviewDialog
        open={starting}
        onOpenChange={setStarting}
        projectId={projectId}
        map={map}
        diagrams={reviewable}
        onStarted={(id) => {
          setStarting(false)
          setStarted(id)
          onChange({ review: id, diagram: undefined })
        }}
      />
    </div>
  )
}

function ReviewPicker({
  reviews,
  value,
  onChange,
}: {
  reviews: CodeReview[]
  value: number | undefined
  onChange: (id: number) => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const id = React.useId()
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{t.code.reviewPick}</Label>
      <Select
        value={value === undefined ? '' : String(value)}
        onValueChange={(next) => {
          onChange(Number(next))
        }}
      >
        <SelectTrigger id={id} className="w-[28rem] max-w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {reviews.map((review) => (
            <SelectItem key={review.id} value={String(review.id)}>
              {t.code.reviewLabel(
                date.format(new Date(review.createdAt)),
                review.diagrams.length,
                review.openCount,
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function DeleteReview({
  projectId,
  reviewId,
  onDeleted,
}: {
  projectId: number
  reviewId: number
  onDeleted: () => void
}) {
  const t = useT()
  const remove = useDeleteCodeReview(projectId)
  return (
    <Popconfirm
      title={t.code.reviewDeleteTitle}
      description={t.code.reviewDeleteText}
      confirmLabel={t.code.deleteConfirm}
      destructive
      onConfirm={async () => {
        try {
          await remove.mutateAsync(reviewId)
          onDeleted()
        } catch (error) {
          toast.error(getErrorMessage(error, t.code.reviewFailed))
        }
      }}
    >
      <Button variant="outline">
        <Trash2Icon /> {t.code.reviewDelete}
      </Button>
    </Popconfirm>
  )
}

/** Picks the diagrams to review (all by default), then starts the review and its calls. */
function StartReviewDialog({
  open,
  onOpenChange,
  projectId,
  map,
  diagrams,
  onStarted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  map: CodeMapDetail
  diagrams: ProjectDiagram[]
  onStarted: (id: number) => void
}) {
  const t = useT()
  const kinds = useCoreloomI18n().messages.diagram.kinds
  const { locale } = useLocale()
  const provider = useStoredProvider()
  const start = useStartCodeReview(projectId)
  /** `null` until a diagram is unchecked: every diagram. */
  const [checked, setChecked] = React.useState<number[] | null>(null)
  const picked = diagrams
    .filter((diagram) => checked === null || checked.includes(diagram.id))
    .map((diagram) => diagram.id)
  const submit = async () => {
    try {
      const { review } = await start.mutateAsync({
        codeMapId: map.id,
        diagramIds: picked,
        locale: locale === 'fr' ? 'fr' : 'en',
      })
      setChecked(null)
      onStarted(review.id)
    } catch (error) {
      toast.error(getErrorMessage(error, t.code.reviewFailed))
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.code.reviewStartTitle}</DialogTitle>
          <DialogDescription>
            {provider ? t.code.reviewStartText(provider.model) : t.code.reviewNoProvider}
          </DialogDescription>
        </DialogHeader>
        {provider ? (
          <fieldset className="flex max-h-80 flex-col gap-3 overflow-y-auto">
            <legend className="mb-2 text-sm font-medium">{t.code.reviewDiagrams}</legend>
            {diagrams.map((diagram) => {
              const id = `review-diagram-${String(diagram.id)}`
              return (
                <Field key={diagram.id} orientation="horizontal">
                  <Checkbox
                    id={id}
                    checked={picked.includes(diagram.id)}
                    onCheckedChange={(value) => {
                      setChecked(
                        value === true
                          ? [...picked, diagram.id]
                          : picked.filter((other) => other !== diagram.id),
                      )
                    }}
                  />
                  <FieldLabel htmlFor={id} className="font-normal">
                    {diagram.title}
                    <span className="text-muted-foreground">
                      {' '}
                      · {diagram.architecture} · {kinds[diagram.kind as keyof typeof kinds]}
                    </span>
                  </FieldLabel>
                </Field>
              )
            })}
          </fieldset>
        ) : (
          <Button variant="outline" asChild className="self-start">
            <Link to="/settings">{t.code.reviewOpenSettings}</Link>
          </Button>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t.code.cancel}
          </Button>
          <Button
            disabled={!provider || picked.length === 0 || start.isPending}
            onClick={() => void submit()}
          >
            <PlayIcon /> {t.code.reviewRun(picked.length)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function stepStatus(entry: CodeReviewDiagram, current: number | null): AiPlanStepStatus {
  if (entry.diagramId === current) return 'running'
  return entry.status
}

function stepDetail(
  entry: CodeReviewDiagram,
  t: ReturnType<typeof useT>,
  reasonText: (reason: NonNullable<CodeReviewDiagram['reason']>) => string,
): string | undefined {
  if (entry.status !== 'done') return entry.reason ? reasonText(entry.reason) : undefined
  return [
    t.code.reviewFound(entry.findingCount),
    ...(entry.truncated ? [t.code.reviewTruncated] : []),
    ...(entry.dropped ? [t.code.reviewDropped(entry.dropped)] : []),
  ].join(' · ')
}

function planOf(
  review: CodeReview,
  current: number | null,
  t: ReturnType<typeof useT>,
  reasonText: (reason: NonNullable<CodeReviewDiagram['reason']>) => string,
): AiPlan {
  return {
    steps: review.diagrams.map((entry) => {
      const detail = stepDetail(entry, t, reasonText)
      return {
        id: String(entry.diagramId),
        title: entry.title,
        status: stepStatus(entry, current),
        ...(detail ? { detail } : {}),
      }
    }),
  }
}

/** Stop while it runs; otherwise review what is left, or the shown diagram again. */
function RunControls({
  review,
  runner,
  provider,
  shown,
}: {
  review: CodeReview
  runner: ReviewRunner
  provider: StoredProvider | null
  shown: CodeReviewDiagram | undefined
}) {
  const t = useT()
  if (runner.running)
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={runner.stop}>
          <SquareIcon /> {t.code.reviewStop}
        </Button>
      </div>
    )
  if (!provider || review.codeMapId === null) return null
  const left = review.diagrams.filter((entry) => entry.status !== 'done').length
  return (
    <div className="flex flex-wrap gap-2">
      {left > 0 && (
        <Button onClick={() => void runner.run(provider)}>
          <PlayIcon /> {t.code.reviewResume(left)}
        </Button>
      )}
      {shown && (
        <Button variant="outline" onClick={() => void runner.run(provider, shown.diagramId)}>
          {t.code.reviewAgain(shown.title)}
        </Button>
      )}
    </div>
  )
}

function ReviewView({
  projectId,
  reviewId,
  autoRun,
  diagrams,
  diagramId,
  onDiagramChange,
}: {
  projectId: number
  reviewId: number
  autoRun: boolean
  diagrams: ProjectDiagram[]
  diagramId: number | undefined
  onDiagramChange: (id: number) => void
}) {
  const t = useT()
  const detail = useCodeReview(reviewId)
  const provider = useStoredProvider()
  const runner = useReviewRunner(projectId, detail.data?.review)
  const failureText = useProviderFailureText()
  const startedRef = React.useRef(false)
  const review = detail.data?.review

  // A review just started here runs at once, if a provider is set.
  React.useEffect(() => {
    if (!autoRun || startedRef.current || !review || !provider) return
    startedRef.current = true
    void runner.run(provider)
  }, [autoRun, review, provider, runner])

  if (detail.isPending) return <Skeleton className="h-96 w-full" />
  if (detail.isError || !review)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.code.reviewFailed}</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
            {t.code.retry}
          </Button>
        </AlertDescription>
      </Alert>
    )
  const left = review.diagrams.filter((entry) => entry.status !== 'done').length
  const reviewed = review.diagrams.filter((entry) => entry.status === 'done')
  const shown = reviewed.find((entry) => entry.diagramId === diagramId) ?? reviewed.at(0)
  const reasonText = (reason: NonNullable<CodeReviewDiagram['reason']>) =>
    failureText({ kind: 'provider', reason })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <AgentPlan
          plan={planOf(review, runner.current, t, reasonText)}
          label={t.code.reviewPlan(review.model)}
          active={runner.running}
          announce
          defaultOpen={left > 0}
        />
        {runner.failure && (
          <Alert variant="destructive">
            <AlertDescription>{failureText(runner.failure)}</AlertDescription>
          </Alert>
        )}
        {review.codeMapId === null && left > 0 && (
          <Alert>
            <AlertDescription>{t.code.reviewMapGone}</AlertDescription>
          </Alert>
        )}
        <RunControls review={review} runner={runner} provider={provider} shown={shown} />
      </div>
      {shown && (
        <ReviewedDiagram
          key={shown.diagramId}
          projectId={projectId}
          review={review}
          entry={shown}
          entries={reviewed}
          diagram={diagrams.find((diagram) => diagram.id === shown.diagramId)}
          findings={detail.data.findings.filter((finding) => finding.diagramId === shown.diagramId)}
          onDiagramChange={onDiagramChange}
        />
      )}
    </div>
  )
}
