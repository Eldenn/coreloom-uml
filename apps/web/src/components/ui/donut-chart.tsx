'use client'

// Coreloom UI — DonutChart. How a whole splits into a few parts: a ring with the total in the middle
// and a legend that gives every part's value and share as text. Parts past `maxSlices` fold into
// "Other" (in a neutral grey), so the ring never needs more colors than the palette can tell apart.
// Plain SVG: nothing to measure, nothing animated.
//
//   <DonutChart data={[{ key: 'gpt', label: 'GPT-5', value: 412 }, …]} centerLabel="Requests" />
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface DonutSlice {
  /** Stable id of the part. */
  key: string
  label: React.ReactNode
  value: number
}

interface DonutChartProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  data: readonly DonutSlice[]
  /**
   * How many parts get a color of their own (default 3, at most 5). The rest are summed into "Other".
   * Three is the validated limit for charts where every color touches every other; go to five only
   * when the legend sits right next to the ring.
   */
  maxSlices?: number
  /** Under the number in the middle (default "Total"). */
  centerLabel?: React.ReactNode
  /** The number in the middle (default: the total, formatted). */
  centerValue?: React.ReactNode
  /** Formats values in the middle and in the legend (default: the locale's number format). */
  formatValue?: (value: number) => string
  /** Diameter of the ring in pixels (default 160). */
  size?: number
  /** Where the legend goes: `right` (default, wraps below when it would get under 13rem), `bottom`, or `none`. */
  legend?: 'right' | 'bottom' | 'none'
  /** What the chart shows, for screen readers ("Requests by model, October"). */
  'aria-label'?: string
}

interface DonutPart {
  key: string
  label: React.ReactNode
  value: number
  share: number
  color: string
}

const OTHER_KEY = '__other'

/**
 * Sorts the parts largest first, keeps `maxSlices` of them and sums the rest into one "Other" part.
 * Zero, negative and non-finite values are dropped: they have no place in a whole.
 */
function donutParts(data: readonly DonutSlice[], maxSlices: number, otherLabel: React.ReactNode) {
  const keep = Math.min(5, Math.max(1, Math.floor(maxSlices)))
  const valid = data
    .filter((d) => Number.isFinite(d.value) && d.value > 0)
    .sort((a, b) => b.value - a.value)
  const total = valid.reduce((sum, d) => sum + d.value, 0)
  // Folding a single part into "Other" hides its name for nothing: show it instead.
  const shown = valid.length === keep + 1 ? valid : valid.slice(0, keep)
  const rest = valid.slice(shown.length)
  const parts: DonutPart[] = shown.map((d, i) => ({
    key: d.key,
    label: d.label,
    value: d.value,
    share: total ? d.value / total : 0,
    color: `var(--chart-${i + 1})`,
  }))
  if (rest.length > 0) {
    const value = rest.reduce((sum, d) => sum + d.value, 0)
    parts.push({
      key: OTHER_KEY,
      label: otherLabel,
      value,
      share: total ? value / total : 0,
      color: 'var(--fg-muted)',
    })
  }
  return { parts, total }
}

function DonutChart({
  data,
  maxSlices = 3,
  centerLabel,
  centerValue,
  formatValue,
  size = 160,
  legend = 'right',
  className,
  'aria-label': ariaLabel,
  ...props
}: DonutChartProps) {
  const { messages, locale, formatNumber } = useCoreloomI18n()
  const t = messages.charts
  const fmt = formatValue ?? formatNumber
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 })
  const [active, setActive] = React.useState<string | null>(null)
  const { parts, total } = donutParts(data, maxSlices, t.other)

  // The ring is a set of stroked circles: each part is a dash of the circumference.
  const stroke = 14
  const radius = 50 - stroke / 2
  const circumference = 2 * Math.PI * radius
  const gap = parts.length > 1 ? 1.6 : 0
  const arcs = parts.map((part, i) => {
    const before = parts.slice(0, i).reduce((sum, p) => sum + p.share, 0)
    return {
      part,
      dash: Math.max(part.share * circumference - gap, 0.01),
      offset: before * circumference,
    }
  })

  return (
    <div
      data-slot="donut-chart"
      className={cn(
        'flex flex-wrap items-center gap-x-8 gap-y-4',
        legend === 'bottom' && 'flex-col items-stretch',
        className,
      )}
      {...props}
    >
      <div className="relative mx-auto shrink-0" style={{ width: size, height: size }}>
        <svg
          role="img"
          aria-label={
            ariaLabel ? `${ariaLabel}. ${t.donutSummary(fmt(total))}` : t.donutSummary(fmt(total))
          }
          viewBox="0 0 100 100"
          className="size-full -rotate-90"
        >
          <circle
            cx={50}
            cy={50}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-inset"
          />
          {arcs.map(({ part, dash, offset: start }) => (
            <circle
              key={part.key}
              cx={50}
              cy={50}
              r={radius}
              fill="none"
              stroke={part.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference}`}
              strokeDashoffset={-start}
              className="transition-opacity duration-150 motion-reduce:transition-none"
              opacity={active && active !== part.key ? 0.3 : 1}
              onPointerEnter={() => {
                setActive(part.key)
              }}
              onPointerLeave={() => {
                setActive(null)
              }}
            />
          ))}
        </svg>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
        >
          <span className="font-display text-[22px] leading-tight tracking-[-0.02em] text-foreground tabular-nums">
            {centerValue ?? fmt(total)}
          </span>
          <span className="max-w-[70%] truncate text-[11.5px] text-muted-foreground">
            {centerLabel ?? t.total}
          </span>
        </div>
      </div>
      {legend !== 'none' && (
        <ul
          className={cn(
            'grid min-w-52 flex-1 grid-cols-[minmax(0,1fr)] gap-1.5',
            legend === 'bottom' && 'w-full',
          )}
          aria-label={t.legend}
        >
          {parts.map((part) => (
            <li
              key={part.key}
              className={cn(
                'flex items-center gap-2 rounded-sm px-1.5 py-1 text-[13px] transition-colors motion-reduce:transition-none',
                active === part.key && 'bg-accent',
              )}
              onPointerEnter={() => {
                setActive(part.key)
              }}
              onPointerLeave={() => {
                setActive(null)
              }}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ background: part.color }}
              />
              <span className="min-w-0 flex-1 truncate text-fg-secondary">{part.label}</span>
              <span className="font-mono text-[12px] text-foreground tabular-nums">
                {fmt(part.value)}
              </span>
              <span className="w-12 text-right font-mono text-[12px] text-muted-foreground tabular-nums">
                {percent.format(part.share)}
              </span>
            </li>
          ))}
          {parts.length === 0 && <li className="text-[13px] text-muted-foreground">{t.empty}</li>}
        </ul>
      )}
    </div>
  )
}

export { DonutChart, type DonutChartProps, donutParts, type DonutSlice }
