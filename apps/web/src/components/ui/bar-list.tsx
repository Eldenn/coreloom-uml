'use client'

// Coreloom UI — BarList. A ranking: one row per item with its label over a bar, and the value at the
// right — top pages, busiest models, biggest customers. Plain HTML, so it reads as a list to screen
// readers and every label stays selectable. Long lists show the first `limit` rows and a button for
// the rest.
//
//   <BarList data={[{ label: '/pricing', value: 1820, href: '/pages/pricing' }, …]} limit={5} />
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { useCoreloomI18n } from '@/lib/i18n'
import { AppLink } from '@/lib/link'
import { cn } from '@/lib/utils'

interface BarListItem {
  /** Stable id; defaults to the label when it's a string. */
  key?: string
  label: React.ReactNode
  value: number
  /** Makes the label a link (through the app's router for in-app paths). */
  href?: string
  /** An icon or a logo before the label. */
  icon?: React.ReactNode
}

interface BarListProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  data: readonly BarListItem[]
  /** `desc` (default) puts the largest first, `asc` the smallest, `none` keeps your order. */
  sortOrder?: 'desc' | 'asc' | 'none'
  /** Rows shown before "Show all" (default: every row). */
  limit?: number
  /** The value a full bar stands for (default: the largest value). */
  max?: number
  /** A chart token, `var(--chart-1)` by default. */
  color?: string
  /** Formats the values (default: the locale's number format). */
  formatValue?: (value: number) => string
  /** What the list ranks, for screen readers ("Top pages by views"). */
  'aria-label'?: string
}

function sortBarList(data: readonly BarListItem[], order: 'desc' | 'asc' | 'none') {
  if (order === 'none') return [...data]
  return [...data].sort((a, b) => (order === 'desc' ? b.value - a.value : a.value - b.value))
}

function BarList({
  data,
  sortOrder = 'desc',
  limit,
  max,
  color = 'var(--chart-1)',
  formatValue,
  className,
  'aria-label': ariaLabel,
  ...props
}: BarListProps) {
  const { messages, formatNumber } = useCoreloomI18n()
  const t = messages.charts
  const fmt = formatValue ?? formatNumber
  const listId = React.useId()
  const [expanded, setExpanded] = React.useState(false)
  const rows = sortBarList(data, sortOrder)
  const top = max ?? Math.max(0, ...rows.map((r) => (Number.isFinite(r.value) ? r.value : 0)))
  const hidden = limit !== undefined && !expanded ? Math.max(0, rows.length - limit) : 0
  const visible = hidden > 0 ? rows.slice(0, limit) : rows

  return (
    <div
      data-slot="bar-list"
      className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2', className)}
      {...props}
    >
      <ul id={listId} aria-label={ariaLabel} className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
        {visible.map((row, i) => {
          const width = top > 0 && row.value > 0 ? Math.min(100, (row.value / top) * 100) : 0
          const content = (
            <>
              {row.icon != null && (
                <span
                  aria-hidden
                  className="shrink-0 [&_svg]:size-3.5 [&_svg]:text-muted-foreground"
                >
                  {row.icon}
                </span>
              )}
              <span className="min-w-0 truncate">{row.label}</span>
            </>
          )
          return (
            <li
              // eslint-disable-next-line @eslint-react/no-array-index-key -- falls back to the position only when the app gives neither a key nor a text label
              key={row.key ?? (typeof row.label === 'string' ? row.label : i)}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1"
            >
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                {row.href ? (
                  <AppLink
                    href={row.href}
                    className="flex min-w-0 items-center gap-1.5 rounded-sm text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
                  >
                    {content}
                  </AppLink>
                ) : (
                  <span className="flex min-w-0 items-center gap-1.5 text-fg-secondary">
                    {content}
                  </span>
                )}
                <span className="shrink-0 font-mono text-[12px] text-foreground tabular-nums">
                  {fmt(row.value)}
                </span>
              </div>
              <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-inset">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${width}%`, background: color }}
                />
              </div>
            </li>
          )
        })}
      </ul>
      {rows.length === 0 && <p className="text-[13px] text-muted-foreground">{t.empty}</p>}
      {limit !== undefined && rows.length > limit && (
        <Button
          variant="ghost"
          size="sm"
          className="justify-self-start"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => {
            setExpanded((e) => !e)
          }}
        >
          {expanded ? t.showLess : t.showAll(rows.length)}
        </Button>
      )}
    </div>
  )
}

export { BarList, type BarListItem, type BarListProps, sortBarList }
