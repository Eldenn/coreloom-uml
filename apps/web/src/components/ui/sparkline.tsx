'use client'

// Coreloom UI — Sparkline. A word-sized trend with no axes: a line, an area or bars that sit next to a
// number in a StatCard, a table cell or a list row. Plain SVG (no Recharts), so a table can hold
// hundreds of them. The chart is an image with a summary for screen readers: first and last value,
// low and high.
//
//   <Sparkline data={[12, 18, 15, 22, 30]} aria-label="Sign-ups, last 7 days" />
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface SparklineProps extends Omit<React.ComponentProps<'svg'>, 'type' | 'children'> {
  /** The values, oldest first. Non-finite values are skipped. */
  data: readonly number[]
  /** `line` (default), `area` (line with a soft fill) or `bar` (one bar per value). */
  type?: 'line' | 'area' | 'bar'
  /** A chart token, `var(--chart-1)` by default. */
  color?: string
  /** Height in pixels (default 32). The width fills the parent unless `width` is set. */
  height?: number
  width?: number | string
  /** Lower and upper bounds of the scale. Default: the data's own range (bars start at 0). */
  min?: number
  max?: number
  /** Marks the last value with a dot (line and area). Default true. */
  showLast?: boolean
  /** Formats the values in the screen-reader summary (default: the locale's number format). */
  formatValue?: (value: number) => string
  /** What the trend is, for screen readers ("Sign-ups, last 7 days"). The summary is added to it. */
  'aria-label'?: string
}

/** First, last, low and high of the finite values; null when there are none. */
function sparklineSummary(data: readonly number[]) {
  const values = data.filter((v) => Number.isFinite(v))
  if (values.length === 0) return null
  return {
    first: values[0],
    last: values[values.length - 1],
    low: Math.min(...values),
    high: Math.max(...values),
  }
}

/**
 * Points of the line in a 100 × 100 box (y grows downwards). A flat series sits in the middle, a
 * single value is drawn as a flat line so there is still something to see.
 */
function sparklinePoints(data: readonly number[], min?: number, max?: number) {
  const values = data.filter((v) => Number.isFinite(v))
  if (values.length === 0) return []
  const lo = min ?? Math.min(...values)
  const hi = max ?? Math.max(...values)
  const span = hi - lo
  const y = (v: number) =>
    span === 0 ? 50 : 100 - ((Math.min(hi, Math.max(lo, v)) - lo) / span) * 100
  if (values.length === 1)
    return [
      { x: 0, y: y(values[0]) },
      { x: 100, y: y(values[0]) },
    ]
  return values.map((v, i) => ({ x: (i / (values.length - 1)) * 100, y: y(v) }))
}

function Sparkline({
  data,
  type = 'line',
  color = 'var(--chart-1)',
  height = 32,
  width = '100%',
  min,
  max,
  showLast = true,
  formatValue,
  className,
  style,
  'aria-label': ariaLabel,
  ...props
}: SparklineProps) {
  const { messages, formatNumber } = useCoreloomI18n()
  const t = messages.charts
  const fmt = formatValue ?? formatNumber
  const gradientId = React.useId()
  const summary = sparklineSummary(data)
  const description = summary
    ? t.sparkline(fmt(summary.first), fmt(summary.last), fmt(summary.low), fmt(summary.high))
    : t.empty
  const label = ariaLabel ? `${ariaLabel}. ${description}` : description

  let marks: React.ReactNode = null
  if (summary && type === 'bar') {
    const values = data.filter((v) => Number.isFinite(v))
    const lo = Math.min(0, min ?? Math.min(...values))
    const hi = Math.max(0, max ?? Math.max(...values))
    const span = hi - lo || 1
    const slot = 100 / values.length
    const zero = 100 - ((0 - lo) / span) * 100
    marks = values.map((v, i) => {
      const top = 100 - ((Math.min(hi, Math.max(lo, v)) - lo) / span) * 100
      return (
        <rect
          // eslint-disable-next-line @eslint-react/no-array-index-key -- values have no identity; the position is the key
          key={i}
          x={i * slot + slot * 0.15}
          width={slot * 0.7}
          y={Math.min(top, zero)}
          // A zero still shows as a hairline so the gap reads as "nothing", not as missing data.
          height={Math.max(Math.abs(zero - top), 1.5)}
          fill={color}
          rx={0.5}
        />
      )
    })
  } else if (summary) {
    const points = sparklinePoints(data, min, max)
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
    const last = points[points.length - 1]
    marks = (
      <>
        {type === 'area' && (
          <>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={`${line} L100,100 L0,100 Z`} fill={`url(#${gradientId})`} stroke="none" />
          </>
        )}
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {showLast && (
          // A zero-length line with a round cap stays a circle when the box is stretched.
          <path
            d={`M${last.x},${last.y} l0,0`}
            stroke={color}
            strokeWidth={5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </>
    )
  }

  return (
    <svg
      data-slot="sparkline"
      role="img"
      aria-label={label}
      viewBox="-2 -4 104 108"
      preserveAspectRatio="none"
      className={cn('block shrink-0 overflow-visible', className)}
      style={{ height, width, ...style }}
      {...props}
    >
      {marks ?? (
        <line
          x1={0}
          x2={100}
          y1={50}
          y2={50}
          className="stroke-border"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}

export { Sparkline, sparklinePoints, type SparklineProps, sparklineSummary }
