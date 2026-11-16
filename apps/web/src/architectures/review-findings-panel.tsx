// The findings of the newest code review on the open view, in the architecture editor: a toolbar
// toggle with the number still open, and a panel docked beside the workspace (like the
// simulation) with the findings as cards. Badges on the drawing narrow the panel to one element.
import { parseDiagramText } from '@coreloom-uml/uml'
import { Link } from '@tanstack/react-router'
import { FileSearchIcon, XIcon } from 'lucide-react'
import * as React from 'react'

import { FindingList } from '@/code-maps/finding-list'
import type { DiagramFormat } from '@/components/diagram-editor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { openCount } from '@/lib/code-review-findings'
import type { CodeReview, CodeReviewFinding } from '@/lib/code-reviews'
import { useLocale, useT } from '@/lib/locale'
import { elementNames } from '@/lib/project-diagrams'

/** The "Findings" toggle of the workspace toolbar, with how many are still open. */
export function ReviewFindingsButton({
  findings,
  pressed,
  onPressedChange,
  ref,
}: {
  findings: readonly CodeReviewFinding[]
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  ref?: React.Ref<HTMLButtonElement>
}) {
  const t = useT().editor.findings
  const open = openCount(findings)
  return (
    <Button
      ref={ref}
      size="sm"
      variant="outline"
      aria-pressed={pressed}
      {...(open ? { 'aria-label': t.openCount(open) } : {})}
      onClick={() => {
        onPressedChange(!pressed)
      }}
    >
      <FileSearchIcon />
      {t.open}
      {open > 0 && (
        <Badge variant="warning" aria-hidden>
          {open}
        </Badge>
      )}
    </Button>
  )
}

/**
 * Docked like the simulation: a column beside the workspace on wide screens, a strip at the bottom
 * of the window on narrow ones. Not a dialog: the drawing stays in use.
 */
export function ReviewFindingsPanel({
  projectId,
  review,
  findings,
  value,
  format,
  focus,
  onFocusChange,
  focusRequest,
  height,
  onClose,
}: {
  projectId: number
  review: CodeReview
  findings: readonly CodeReviewFinding[]
  /** The open view's text: the cards name its elements as they are now. */
  value: string
  format: DiagramFormat
  focus: string | null
  onFocusChange: (element: string | null) => void
  /** CSS height of the column on wide screens: the workspace's. */
  height: string
  /** The page closes the panel and puts the focus back on the toggle. */
  onClose: () => void
  /** Changes each time a badge is pressed: the focus comes back to the panel (and on opening). */
  focusRequest: number
}) {
  const t = useT().editor.findings
  const { locale } = useLocale()
  const panel = React.useRef<HTMLElement>(null)
  React.useEffect(() => {
    panel.current?.focus()
  }, [focusRequest])
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(review.createdAt),
  )
  const names = elementNames(parseDiagramText(value, format).diagram ?? null)
  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label={t.title}
      className="sticky bottom-0 z-(--z-sticky) flex max-h-[45svh] min-w-0 flex-col rounded-md border border-border bg-card outline-none focus-visible:ring-[3px] focus-visible:ring-ring lg:static lg:z-auto lg:h-(--review-findings-h) lg:max-h-none lg:w-80 lg:shrink-0"
      style={{ '--review-findings-h': height } as React.CSSProperties}
    >
      <div className="flex items-center justify-between px-3 pt-2">
        <h2 className="m-0 text-[14px] font-semibold text-foreground">{t.title}</h2>
        <Button size="icon-sm" variant="ghost" aria-label={t.close} onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <p className="m-0 px-3 text-[13px] text-muted-foreground">
        {t.description(when, review.model)}
      </p>
      <p className="m-0 px-3 pt-1 pb-3 text-[13px]">
        <Link
          to="/projects/$projectId"
          params={{ projectId }}
          search={{ tab: 'code', view: 'review', review: review.id }}
          className="text-primary-text underline-offset-4 hover:underline"
        >
          {t.openReview}
        </Link>
      </p>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
        <FindingList
          projectId={projectId}
          review={review}
          findings={findings}
          names={names}
          focus={focus}
          onFocusChange={onFocusChange}
        />
      </div>
    </section>
  )
}
