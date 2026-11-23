// The review of a project's design, above its lists: what its requirements and decisions say
// against themselves (read by the API with no model), then what the owner's own model finds in
// the views of each architecture, to mark done or dismiss.
import { Link } from '@tanstack/react-router'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FindingCard } from '@/components/ui/finding-card'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { toast } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import { getErrorMessage } from '@/lib/client'
import {
  type DesignModelFinding,
  useDecisions,
  useDesignReview,
  useModelDesignReview,
  useRequirements,
  useResolveDesignFinding,
} from '@/lib/design-records'
import { providerCallFailure, useStoredProvider } from '@/lib/llm-provider'
import { useLocale, useT } from '@/lib/locale'
import { useProjectDiagrams } from '@/lib/project-diagrams'
import { useProviderFailureText } from '@/llm/provider-failure'

const RESOLUTION_RANK = { open: 0, done: 1, dismissed: 2 } as const
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const

export function DesignReview({ projectId }: { projectId: number }) {
  const t = useT().design
  const review = useDesignReview(projectId).data
  // Nothing is said until it is known: the lists below carry the loading and the errors.
  if (!review) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle id="design-review-title">{t.review}</CardTitle>
        <CardDescription>{t.reviewDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {review.findings.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">{t.reviewClear}</p>
        ) : (
          <ItemGroup aria-labelledby="design-review-title" className="gap-2">
            {review.findings.map((finding) => (
              <Item
                key={`${finding.kind}-${String(finding.requirementId ?? finding.decisionId)}`}
                variant="outline"
                size="sm"
              >
                <ItemContent>
                  <ItemTitle>{finding.subject}</ItemTitle>
                  <ItemDescription>{t.findings[finding.kind]}</ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        )}
        <ModelReview projectId={projectId} findings={review.modelFindings} />
      </CardContent>
    </Card>
  )
}

/** The owner's model on the views: the run, then its findings, open and most severe first. */
function ModelReview({
  projectId,
  findings,
}: {
  projectId: number
  findings: readonly DesignModelFinding[]
}) {
  const t = useT().design
  const { locale } = useLocale()
  const provider = useStoredProvider()
  const failureText = useProviderFailureText()
  const { diagrams } = useProjectDiagrams(projectId)
  const requirements = useRequirements(projectId).data ?? []
  const decisions = useDecisions(projectId).data ?? []
  const run = useModelDesignReview(projectId)
  const resolve = useResolveDesignFinding(projectId)

  // Only an architecture with something drawn can be read.
  const drawn = diagrams.filter((diagram) => diagram.content !== null)
  const architectureIds = [...new Set(drawn.map((diagram) => diagram.architectureId))]
  const titleOf = (architectureId: number) =>
    diagrams.find((diagram) => diagram.architectureId === architectureId)?.architecture ?? ''
  const ready = architectureIds.length > 0 && requirements.length + decisions.length > 0
  const subjectOf = (finding: DesignModelFinding) =>
    decisions.find((decision) => decision.id === finding.decisionId)?.title ??
    requirements.find((requirement) => requirement.id === finding.requirementId)?.statement ??
    t.modelReviewGone
  const sorted = [...findings].sort(
    (a, b) =>
      RESOLUTION_RANK[a.resolution] - RESOLUTION_RANK[b.resolution] ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  )

  return (
    <section aria-labelledby="design-model-review-title" className="flex flex-col gap-3">
      <h3 id="design-model-review-title" className="m-0 text-sm font-medium">
        {t.modelReview}
      </h3>
      <p className="m-0 max-w-prose text-[13px] text-muted-foreground">
        {provider ? t.modelReviewText(provider.model) : t.modelReviewNoProvider}
      </p>
      {provider ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!ready || run.isPending}
            onClick={() => {
              run.mutate({ provider, architectureIds, locale: locale === 'fr' ? 'fr' : 'en' })
            }}
          >
            {run.isPending && <Spinner />}
            {t.modelReviewStart}
          </Button>
          <span role="status" className="text-[13px] text-muted-foreground">
            {run.current !== null && t.modelReviewRunning(titleOf(run.current))}
            {!ready && t.modelReviewNothing}
          </span>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-fit" asChild>
          <Link to="/settings">{t.modelReviewOpenSettings}</Link>
        </Button>
      )}
      {run.isError && (
        <Alert variant="destructive">
          <AlertTitle>{t.modelReviewFailed}</AlertTitle>
          <AlertDescription>{failureText(providerCallFailure(run.error))}</AlertDescription>
        </Alert>
      )}
      {sorted.length === 0 ? (
        <p className="m-0 text-[13px] text-muted-foreground">{t.modelReviewNone}</p>
      ) : (
        sorted.map((finding) => (
          <FindingCard
            key={finding.id}
            title={subjectOf(finding)}
            status={finding.severity === 'high' ? 'error' : 'warning'}
            statusLabel={t.modelReviewWhere(
              titleOf(finding.architectureId),
              diagrams.find((diagram) => diagram.id === finding.diagramId)?.title ?? null,
            )}
            severity={finding.severity}
            comment={finding.comment}
            resolution={finding.resolution}
            onResolutionChange={(resolution) => {
              resolve.mutate(
                { id: finding.id, resolution },
                {
                  onError: (error) => {
                    toast.error(getErrorMessage(error, t.modelReviewResolveFailed))
                  },
                },
              )
            }}
          />
        ))
      )}
    </section>
  )
}
