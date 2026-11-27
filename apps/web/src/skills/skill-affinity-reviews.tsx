// The admin's review of computed affinities (`computed-skill-affinities`): the pairs of a skill and
// a ready-made rule the search scored close, to accept, reject or mark as going against. The tab of
// /skills lists the pending ones, those that count most first (the API's order); a skill's sheet
// lists its own, decided or not, so a decision can be undone.
import * as React from 'react'

import { useLocalized } from '@/agent-configs/catalog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { TuyauError } from '@/lib/client'
import { useT } from '@/lib/locale'
import {
  type AffinityDecision,
  type AffinityReview,
  useAffinityReviews,
  useDecideAffinity,
} from '@/lib/skills'

const DECISIONS: AffinityDecision[] = ['accepted', 'rejected', 'against']

const DECIDED_TONES = {
  accepted: 'success',
  rejected: 'secondary',
  against: 'destructive',
} as const satisfies Record<AffinityDecision, string>

/** Enough for one skill's pairs: its 10 best rules, plus the rules it is among the 3 best of. */
const SHEET_PAGE_SIZE = 100

/** The tab of /skills: the pending pairs, a page at a time. */
export function AffinityReviewsTab({ onOpen }: { onOpen: (slug: string) => void }) {
  const t = useT().skills.affinities
  const [page, setPage] = React.useState(1)
  const reviews = useAffinityReviews({ status: 'pending', page })
  const meta = reviews.data?.meta
  return (
    <section className="flex flex-col gap-4">
      <p className="m-0 text-sm text-muted-foreground">{t.help}</p>
      <ReviewRows reviews={reviews} onOpen={onOpen} />
      {meta && meta.lastPage > 1 && (
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{t.page(meta.page, meta.lastPage)}</span>
          <ButtonGroup>
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page <= 1}
              onClick={() => {
                setPage(meta.page - 1)
              }}
            >
              {t.previous}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page >= meta.lastPage}
              onClick={() => {
                setPage(meta.page + 1)
              }}
            >
              {t.next}
            </Button>
          </ButtonGroup>
        </div>
      )}
    </section>
  )
}

/** In a skill's sheet: its pairs, decided or not. */
export function SkillAffinityReviews({ slug }: { slug: string }) {
  const t = useT().skills.affinities
  const reviews = useAffinityReviews({ status: 'all', skill: slug, perPage: SHEET_PAGE_SIZE })
  const hidden = (reviews.data?.meta.total ?? 0) - (reviews.data?.data.length ?? 0)
  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-sm font-medium text-foreground">{t.sheetTitle}</h3>
        <p className="m-0 text-sm text-muted-foreground">{t.sheetHelp}</p>
      </div>
      <ReviewRows reviews={reviews} />
      {hidden > 0 && <p className="m-0 text-sm text-muted-foreground">{t.more(hidden)}</p>}
    </section>
  )
}

function ReviewRows({
  reviews,
  onOpen,
}: {
  reviews: ReturnType<typeof useAffinityReviews>
  onOpen?: (slug: string) => void
}) {
  const t = useT().skills.affinities
  if (reviews.isPending)
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    )
  if (reviews.isError) return <p className="m-0 text-sm text-destructive">{t.loadFailed}</p>
  if (reviews.data.data.length === 0)
    return <p className="m-0 text-sm text-muted-foreground">{t.empty}</p>
  return (
    <ItemGroup className="gap-2" aria-busy={reviews.isPlaceholderData}>
      {reviews.data.data.map((review) => (
        <ReviewRow key={review.id} review={review} onOpen={onOpen} />
      ))}
    </ItemGroup>
  )
}

function ReviewRow({
  review,
  onOpen,
}: {
  review: AffinityReview
  onOpen?: (slug: string) => void
}) {
  const t = useT().skills.affinities
  const localized = useLocalized()
  const decide = useDecideAffinity()
  const send = (decision: AffinityDecision | null) => {
    decide.mutate(
      { id: review.id, decision },
      {
        onError: (error) =>
          error instanceof TuyauError && error.status === 404
            ? toast.info(t.gone)
            : toast.error(t.failed),
      },
    )
  }
  return (
    <Item variant="outline" size="sm">
      <ItemContent>
        <ItemTitle>
          {onOpen ? (
            <button
              type="button"
              className="cursor-pointer text-left underline-offset-4 hover:underline"
              onClick={() => {
                onOpen(review.skill.slug)
              }}
            >
              {review.skill.name}
            </button>
          ) : null}
          {onOpen && <span aria-hidden>·</span>}
          <span>{localized(review.rule)}</span>
        </ItemTitle>
        <ItemDescription>{localized(review.group)}</ItemDescription>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <span>{t.cosine(review.cosine.toFixed(3))}</span>
          {review.shownByItself && <Badge variant="secondary">{t.shownByItself}</Badge>}
          {review.noAutomaticSuggestion && (
            <Badge variant="outline">{t.noAutomaticSuggestion}</Badge>
          )}
        </div>
      </ItemContent>
      <ItemActions>
        {review.decision ? (
          <>
            <Badge variant={DECIDED_TONES[review.decision]}>{t.decided[review.decision]}</Badge>
            <Button
              variant="ghost"
              size="sm"
              disabled={decide.isPending}
              onClick={() => {
                send(null)
              }}
            >
              {t.undo}
            </Button>
          </>
        ) : (
          <ButtonGroup>
            {DECISIONS.map((decision) => (
              <Button
                key={decision}
                variant="outline"
                size="sm"
                disabled={decide.isPending}
                onClick={() => {
                  send(decision)
                }}
              >
                {t.decide[decision]}
              </Button>
            ))}
          </ButtonGroup>
        )}
      </ItemActions>
    </Item>
  )
}
