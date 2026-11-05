import * as React from 'react'

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import {
  type AiModel,
  type AiUsage,
  contextLevel,
  estimateCost,
  formatCost,
  formatTokens,
  usageDetails,
  usageTotal,
} from '@/lib/ai'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface ContextMeterProps {
  /** Tokens in the conversation: a count, or the AI SDK's usage for a breakdown. */
  used: number | AiUsage
  /** The context window, in tokens. Defaults to `model.contextWindow`. */
  max?: number
  /** What the conversation cost so far. Estimated from `model.pricing` when left out. */
  cost?: number
  /** Gives the window, the price and the currency. */
  model?: AiModel
}

const TONE = {
  ok: { text: 'text-fg-secondary', fill: 'text-primary', bg: 'bg-primary' },
  warning: { text: 'text-warning', fill: 'text-warning', bg: 'bg-warning' },
  critical: { text: 'text-destructive', fill: 'text-destructive', bg: 'bg-destructive' },
} as const

/** Everything the meter and its breakdown show, formatted for the locale. */
function useMeter({ used, max, cost, model }: ContextMeterProps) {
  const { messages, locale, formatNumber } = useCoreloomI18n()
  const t = messages.ai.model.meter
  const usage: AiUsage = typeof used === 'number' ? { totalTokens: used } : used
  const total = usageTotal(usage)
  const window = max ?? model?.contextWindow ?? 0
  const ratio = window > 0 ? Math.min(1, total / window) : 0
  const level = contextLevel(total, window)
  const estimated =
    cost ??
    (typeof used !== 'number' && model?.pricing ? estimateCost(usage, model.pricing) : undefined)
  const percent = new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(ratio)
  const { reasoning, cached } = usageDetails(usage)
  const rows: { label: string; value: string; sub?: boolean }[] = []
  if (usage.inputTokens !== undefined)
    rows.push({ label: t.input, value: formatNumber(usage.inputTokens) })
  if (cached) rows.push({ label: t.cached, value: formatNumber(cached), sub: true })
  if (usage.outputTokens !== undefined)
    rows.push({ label: t.output, value: formatNumber(usage.outputTokens) })
  if (reasoning) rows.push({ label: t.reasoning, value: formatNumber(reasoning), sub: true })
  rows.push({
    label: t.total,
    value: t.of(formatTokens(total, locale), formatTokens(window, locale)),
  })
  if (estimated !== undefined)
    rows.push({ label: t.cost, value: formatCost(estimated, locale, model?.pricing?.currency) })
  return {
    t,
    total,
    window,
    ratio,
    level,
    percent,
    rows,
    valueText: t.valueText(percent, formatTokens(total, locale), formatTokens(window, locale)),
  }
}

/** The breakdown on its own (what the meter's card shows): usable inline, in a usage panel. */
function ContextBreakdown({ className, ...props }: ContextMeterProps & { className?: string }) {
  const { t, ratio, level, percent, rows } = useMeter(props)
  return (
    <div
      data-slot="context-breakdown"
      data-level={level}
      className={cn('flex flex-col gap-3 text-[13px]', className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-0 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {t.title}
        </p>
        <span className={cn('font-mono text-[12.5px] font-semibold', TONE[level].text)}>
          {percent}
        </span>
      </div>
      <span
        aria-hidden
        className="relative block h-1.5 w-full overflow-hidden rounded-pill bg-accent ring-1 ring-border ring-inset"
      >
        <span
          className={cn(
            'absolute inset-y-0 left-0 rounded-pill transition-[width] duration-slow ease-out',
            TONE[level].bg,
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
      <p
        className={cn(
          'm-0 text-[12.5px] leading-[1.45]',
          level === 'ok' ? 'text-muted-foreground' : TONE[level].text,
        )}
      >
        {t.levels[level]}
      </p>
      <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border-t border-border-subtle pt-2.5">
        {rows.map((r) => (
          <React.Fragment key={r.label}>
            <dt className={cn('text-muted-foreground', r.sub && 'pl-3')}>{r.label}</dt>
            <dd className="m-0 text-right font-mono text-[12px] text-foreground">{r.value}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  )
}

function Ring({ ratio, className }: { ratio: number; className?: string }) {
  const r = 6
  const c = 2 * Math.PI * r
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={cn('size-4 shrink-0 -rotate-90', className)}>
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="text-border-strong"
      />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${c * ratio} ${c}`}
        className="transition-[stroke-dasharray] duration-slow ease-out"
        style={{ opacity: ratio > 0 ? 1 : 0 }}
      />
    </svg>
  )
}

function ContextMeter({
  variant = 'ring',
  showValue = true,
  className,
  ...props
}: ContextMeterProps & {
  /** A ring (the default, for a toolbar) or a short bar. */
  variant?: 'ring' | 'bar'
  /** Show the percentage next to the ring. It's always in the accessible value. */
  showValue?: boolean
  className?: string
}) {
  const { t, total, window, ratio, level, percent, rows, valueText } = useMeter(props)
  const [open, setOpen] = React.useState(false)
  const touchStart = React.useRef<{ x: number; y: number; wasOpen: boolean } | null>(null)
  const descriptionId = React.useId()
  if (window <= 0) return null
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={200} closeDelay={120}>
      <HoverCardTrigger asChild>
        <div
          role="meter"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the meter opens its details card on focus, so it must be keyboard-reachable.
          tabIndex={0}
          aria-label={t.label}
          aria-valuemin={0}
          aria-valuemax={window}
          aria-valuenow={Math.min(total, window)}
          aria-valuetext={valueText}
          aria-describedby={descriptionId}
          data-slot="context-meter"
          data-level={level}
          // Touch has no hover: a tap toggles the card. A swipe that starts here (moved, or cancelled by the
          // browser to scroll) doesn't. The state is read on pointerdown: the open card closes itself on a
          // press outside it, before pointerup.
          onPointerDown={(e) => {
            touchStart.current =
              e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY, wasOpen: open } : null
          }}
          onPointerCancel={() => {
            touchStart.current = null
          }}
          onPointerUp={(e) => {
            const start = touchStart.current
            touchStart.current = null
            if (
              e.pointerType === 'touch' &&
              start &&
              Math.hypot(e.clientX - start.x, e.clientY - start.y) < 10
            )
              setOpen(!start.wasOpen)
          }}
          className={cn(
            'inline-flex h-7 shrink-0 cursor-default items-center gap-1.5 rounded-md px-1.5 font-mono text-[11.5px] font-medium outline-none select-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring data-[state=open]:bg-accent',
            className,
          )}
        >
          {variant === 'ring' ? (
            <Ring ratio={ratio} className={TONE[level].fill} />
          ) : (
            <span
              aria-hidden
              className="relative block h-1.5 w-14 overflow-hidden rounded-pill bg-accent ring-1 ring-border ring-inset"
            >
              <span
                className={cn('absolute inset-y-0 left-0 rounded-pill', TONE[level].bg)}
                style={{ width: `${ratio * 100}%` }}
              />
            </span>
          )}
          {showValue && (
            <span aria-hidden className={TONE[level].text}>
              {percent}
            </span>
          )}
        </div>
      </HoverCardTrigger>
      <span id={descriptionId} className="sr-only">
        {t.summary(t.levels[level], rows)}
      </span>
      <HoverCardContent align="end" side="top" className="w-64 p-3.5">
        <ContextBreakdown {...props} />
      </HoverCardContent>
    </HoverCard>
  )
}

export { ContextBreakdown, ContextMeter, type ContextMeterProps }
