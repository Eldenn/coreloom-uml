'use client'

// Coreloom UI — FindingCard. One finding of a review: what it is about, its status and severity,
// a comment, and the evidence as file:line places (links when the app has a URL for them). People
// mark it done or ignore it, and reopen it. The app owns the resolution (save it, then hand it
// back) and can show the element in a diagram (`onSelect`). Pair it with UmlDiagram annotations.
import {
  CheckIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  CircleXIcon,
  EyeOffIcon,
  LocateFixedIcon,
  type LucideIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCoreloomI18n } from '@/lib/i18n'
import { useControllableState } from '@/lib/use-controllable-state'
import { cn } from '@/lib/utils'

/** `ok`: nothing to report; `warning`: a gap; `error`: wrong or missing; `unknown`: not checked. */
type FindingStatus = 'ok' | 'warning' | 'error' | 'unknown'
type FindingSeverity = 'low' | 'medium' | 'high'
/** `open` until someone marks it `done` or ignores it (`dismissed`). */
type FindingResolution = 'open' | 'done' | 'dismissed'

/** A place in the code: `path`, and `line` when known. */
interface FindingEvidence {
  path: string
  line?: number
  /** Where the place opens (the file on GitHub, say). Only http and https links are followed. */
  href?: string
}

interface FindingCardProps {
  /** What the finding is about: an element's name ("OrderService"). */
  title: string
  status: FindingStatus
  /** A few words on the status ("Missing from the code"). Default: the status's name. */
  statusLabel?: string
  severity?: FindingSeverity
  /** The reviewer's comment, as plain text. */
  comment?: string
  evidence?: readonly FindingEvidence[]
  /** Controlled resolution. */
  resolution?: FindingResolution
  /** Default: open. */
  defaultResolution?: FindingResolution
  onResolutionChange?: (resolution: FindingResolution) => void
  /** Shows "Show in diagram"; the app selects the element (and scrolls it into view). */
  onSelect?: () => void
  /** The finding of the element selected in the diagram: drawn with the selection's outline. */
  selected?: boolean
  /** Turns the buttons off, while the app saves a resolution say. Default: false. */
  disabled?: boolean
  className?: string
}

const ICON: Record<FindingStatus, LucideIcon> = {
  ok: CircleCheckIcon,
  warning: TriangleAlertIcon,
  error: CircleXIcon,
  unknown: CircleHelpIcon,
}

const VARIANT = {
  ok: 'success',
  warning: 'warning',
  error: 'destructive',
  unknown: 'secondary',
} as const

/** "src/orders/service.ts:42". */
function evidencePlace(evidence: FindingEvidence): string {
  return evidence.line === undefined ? evidence.path : `${evidence.path}:${String(evidence.line)}`
}

/** The link to follow, or null: only http and https, so content can't run a script. */
function safeHref(href: string | undefined): string | null {
  if (!href) return null
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function EvidenceList({ evidence }: { evidence: readonly FindingEvidence[] }) {
  const t = useCoreloomI18n().messages.findingCard
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {t.evidence}
      </p>
      <ul className="flex flex-col gap-1">
        {evidence.map((item, i) => {
          const place = evidencePlace(item)
          const href = safeHref(item.href)
          return (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- the same place may be cited twice
            <li key={i} className="min-w-0 font-mono text-[12px] leading-5 break-all">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="rounded-sm text-primary-text underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
                >
                  {place}
                  <span className="sr-only"> {t.newTab}</span>
                </a>
              ) : (
                <span className="text-fg-secondary">{place}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * The buttons. When one hides itself (Mark as done swaps for Reopen), focus moves to the button
 * that takes its place instead of falling back to the page.
 */
function ResolutionBar({
  resolution,
  onChange,
  onSelect,
  disabled,
}: {
  resolution: FindingResolution
  onChange: (next: FindingResolution) => void
  onSelect: (() => void) | undefined
  disabled: boolean
}) {
  const t = useCoreloomI18n().messages.findingCard
  const swapped = React.useRef(false)
  const reopen = React.useRef<HTMLButtonElement>(null)
  const done = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (!swapped.current) return
    swapped.current = false
    ;(resolution === 'open' ? done : reopen).current?.focus()
  }, [resolution])
  const change = (next: FindingResolution) => {
    swapped.current = true
    onChange(next)
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onSelect && (
        <Button type="button" variant="ghost" size="sm" onClick={onSelect} disabled={disabled}>
          <LocateFixedIcon aria-hidden />
          {t.show}
        </Button>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {resolution === 'open' ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                change('dismissed')
              }}
            >
              <EyeOffIcon aria-hidden />
              {t.dismiss}
            </Button>
            <Button
              ref={done}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => {
                change('done')
              }}
            >
              <CheckIcon aria-hidden />
              {t.done}
            </Button>
          </>
        ) : (
          <Button
            ref={reopen}
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              change('open')
            }}
          >
            <RotateCcwIcon aria-hidden />
            {t.reopen}
          </Button>
        )}
      </div>
    </div>
  )
}

function FindingCard({
  title,
  status,
  statusLabel,
  severity,
  comment,
  evidence = [],
  resolution: resolutionProp,
  defaultResolution = 'open',
  onResolutionChange,
  onSelect,
  selected = false,
  disabled = false,
  className,
}: FindingCardProps) {
  const { messages } = useCoreloomI18n()
  const t = messages.findingCard
  const [resolution, setResolution] = useControllableState({
    value: resolutionProp,
    defaultValue: defaultResolution,
    onChange: onResolutionChange,
  })
  const Icon = ICON[status]
  const titleId = React.useId()
  const resolved = resolution !== 'open'
  return (
    <article
      data-slot="finding-card"
      data-status={status}
      data-resolution={resolution}
      aria-labelledby={titleId}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors duration-fast',
        selected && 'border-primary ring-1 ring-primary',
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge variant={VARIANT[status]}>
          <Icon aria-hidden />
          {statusLabel ?? messages.diagramAnnotations.status[status]}
        </Badge>
        {severity && <Badge variant="outline">{t.severityLabel(t.severity[severity])}</Badge>}
        {/* One live region for the card: says the new resolution after a button press. */}
        <p role="status" className="ml-auto text-[12px] text-muted-foreground">
          {resolved ? t.resolved[resolution] : ''}
        </p>
      </div>
      <p
        id={titleId}
        className={cn(
          'text-[13px] font-semibold break-words text-foreground',
          resolved && 'line-through decoration-muted-foreground',
        )}
      >
        {title}
      </p>
      {comment && (
        <p className="text-[13px] leading-5 break-words whitespace-pre-line text-fg-secondary">
          {comment}
        </p>
      )}
      {evidence.length > 0 && <EvidenceList evidence={evidence} />}
      <ResolutionBar
        resolution={resolution}
        onChange={setResolution}
        onSelect={onSelect}
        disabled={disabled}
      />
    </article>
  )
}

export {
  FindingCard,
  type FindingCardProps,
  type FindingEvidence,
  type FindingResolution,
  type FindingSeverity,
  type FindingStatus,
}
