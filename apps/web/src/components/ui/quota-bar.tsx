import * as React from 'react'

import { type FormatOptions, formatValue } from '@/components/ui/format'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface QuotaSegment {
  label: string
  value: number
  /** A colour class for the segment and its legend dot; the chart palette by default. */
  className?: string
}

const palette = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5']

function QuotaBar({
  label,
  segments,
  value,
  max,
  warnAt = 0.8,
  dangerAt = 0.95,
  legend = true,
  description,
  className,
  format,
  currency,
  unit,
  maximumFractionDigits,
  base,
  ...props
}: {
  /** What is measured: "Storage", "AI credits". */
  label: React.ReactNode
  /** The parts of the usage. Give `value` instead for a single bar. */
  segments?: QuotaSegment[]
  /** The total used, when there are no segments. */
  value?: number
  /** The limit. */
  max: number
  /** Share of `max` (0 to 1) from which the figure turns amber. 0.8 by default. */
  warnAt?: number
  /** Share from which it turns red. 0.95 by default. */
  dangerAt?: number
  /** Shows the segments' legend. */
  legend?: boolean
  /** A line under the bar, such as "Resets on Nov 1" or an upgrade link. */
  description?: React.ReactNode
} & Pick<FormatOptions, 'format' | 'currency' | 'unit' | 'maximumFractionDigits' | 'base'> &
  Omit<React.ComponentProps<'div'>, 'children'>) {
  const { locale, messages } = useCoreloomI18n()
  const t = messages.utility.quota
  const id = React.useId()
  const fmt = (n: number) =>
    formatValue(n, locale, { format, currency, unit, maximumFractionDigits, base })
  const parts = segments ?? [{ label: typeof label === 'string' ? label : '', value: value ?? 0 }]
  const used = parts.reduce((sum, s) => sum + Math.max(0, s.value), 0)
  const ratio = max > 0 ? used / max : 0
  const level = ratio >= dangerAt ? 'danger' : ratio >= warnAt ? 'warning' : 'ok'
  const usedText = t.of(fmt(used), fmt(max))

  return (
    <div
      data-slot="quota-bar"
      data-level={level}
      className={cn('flex flex-col gap-2 font-sans text-[13.5px]', className)}
      {...props}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span id={id} className="font-medium text-foreground">
          {label}
        </span>
        <span
          className={cn(
            'text-[13px] tabular-nums',
            level === 'danger'
              ? 'font-medium text-destructive'
              : level === 'warning'
                ? 'font-medium text-warning'
                : 'text-fg-secondary',
          )}
        >
          {usedText}
        </span>
      </div>
      <div
        role="meter"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(used, max)}
        aria-valuetext={t.spoken(usedText, Math.round(ratio * 100))}
        className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-secondary"
      >
        {parts.map((s, i) => {
          const width = max > 0 ? (Math.max(0, s.value) / max) * 100 : 0
          return width > 0 ? (
            <div
              // eslint-disable-next-line @eslint-react/no-array-index-key -- labels may repeat; the order is fixed
              key={i}
              className={cn(
                'h-full shrink-0 first:rounded-l-full',
                segments
                  ? (s.className ?? palette[i % palette.length])
                  : level === 'danger'
                    ? 'bg-destructive'
                    : level === 'warning'
                      ? 'bg-warning'
                      : 'bg-primary',
              )}
              style={{ width: `${Math.min(width, 100)}%` }}
            />
          ) : null
        })}
      </div>
      {segments && legend ? (
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12.5px] text-fg-secondary">
          {segments.map((s, i) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- labels may repeat; the order is fixed
            <li key={i} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn('size-2 rounded-full', s.className ?? palette[i % palette.length])}
              />
              {s.label}
              <span className="text-muted-foreground tabular-nums">{fmt(s.value)}</span>
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-secondary ring-1 ring-border" />
            {t.free}
            <span className="text-muted-foreground tabular-nums">
              {fmt(Math.max(0, max - used))}
            </span>
          </li>
        </ul>
      ) : null}
      {description ? (
        <p className="m-0 text-[12.5px] text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

export { QuotaBar, type QuotaSegment }
