import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface FunnelStep {
  key: string
  label: React.ReactNode
  value: number
}

interface FunnelChartProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  steps: readonly FunnelStep[]
  /** A chart token, `var(--chart-1)` by default. */
  color?: string
  /** Formats the counts (default: the locale's number format). */
  formatValue?: (value: number) => string
  /** What the funnel measures, for screen readers ("Sign-up funnel, October"). */
  'aria-label'?: string
}

/** Each step's share of the first step and of the step before it (1 for the first step). */
function funnelRates(steps: readonly { value: number }[]) {
  const start = steps[0]?.value ?? 0
  return steps.map((step, i) => {
    const previous = i === 0 ? step.value : steps[i - 1].value
    return {
      ofStart: start > 0 ? step.value / start : 0,
      ofPrevious: i === 0 ? 1 : previous > 0 ? step.value / previous : 0,
    }
  })
}

function FunnelChart({
  steps,
  color = 'var(--chart-1)',
  formatValue,
  className,
  'aria-label': ariaLabel,
  ...props
}: FunnelChartProps) {
  const { messages, locale, formatNumber } = useCoreloomI18n()
  const t = messages.charts.funnel
  const fmt = formatValue ?? formatNumber
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 })
  const rates = funnelRates(steps)

  if (steps.length === 0)
    return (
      <p className={cn('text-[13px] text-muted-foreground', className)}>{messages.charts.empty}</p>
    )

  return (
    <div data-slot="funnel-chart" className={cn('min-w-0', className)} {...props}>
      <ol aria-label={ariaLabel} className="grid grid-cols-[minmax(0,1fr)]">
        {steps.map((step, i) => {
          const rate = rates[i]
          const width = Math.min(100, Math.max(0, rate.ofStart * 100))
          return (
            <li key={step.key} className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
              {i > 0 && (
                <p className="flex items-center gap-2 py-1.5 pl-3 text-[12px] text-muted-foreground">
                  <span aria-hidden className="h-3 w-px bg-border-strong" />
                  <span>
                    {t.conversion(percent.format(rate.ofPrevious))}
                    <span className="sr-only">
                      {' '}
                      {t.dropped(fmt(Math.max(0, steps[i - 1].value - step.value)))}
                    </span>
                  </span>
                </p>
              )}
              <div className="flex min-w-0 items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-foreground">{step.label}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="font-mono text-[12.5px] text-foreground tabular-nums">
                    {fmt(step.value)}
                  </span>
                  <span className="w-14 text-right font-mono text-[12px] text-muted-foreground tabular-nums">
                    <span className="sr-only">{t.ofStartLabel} </span>
                    {percent.format(rate.ofStart)}
                  </span>
                </span>
              </div>
              <div aria-hidden className="mt-1.5 h-6 overflow-hidden rounded-sm bg-inset">
                <div
                  className="h-full rounded-sm"
                  style={{ width: `${width}%`, background: color }}
                />
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export { FunnelChart, type FunnelChartProps, funnelRates, type FunnelStep }
