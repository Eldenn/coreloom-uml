'use client'

// Coreloom UI — Heatmap. Values on a grid of small squares, darker for more: activity by hour and
// weekday, errors by service and day, or a year of contributions with CalendarHeatmap. The grid is
// one tab stop: arrow keys move from cell to cell, and every cell has a name ("Tue, 14:00: 42").
// Five steps of one chart color, with a Less → More legend.
//
//   <Heatmap data={[{ row: 'Mon', column: '09', value: 12 }, …]} aria-label="Deploys by hour" />
//   <CalendarHeatmap data={[{ date: '2026-10-14', value: 3 }, …]} to="2026-10-31" />
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Share of the color in each of the five steps; step 0 (nothing) is the empty well. */
const STEPS = [0, 28, 48, 72, 100] as const
const LEVELS = [0, 1, 2, 3, 4] as const

/** The step (0–4) of a value: 0 for nothing, then quarters of `max`. */
function heatmapLevel(value: number | null | undefined, max: number) {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0 || max <= 0)
    return 0
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4)))
}

function levelColor(level: number, color: string) {
  return level === 0
    ? 'var(--surface-inset)'
    : `color-mix(in oklab, ${color} ${STEPS[level]}%, var(--surface-inset))`
}

interface GridColumn {
  key: string
  /** Shown above the column; empty for none (the `name` is still read). */
  label?: React.ReactNode
  name: string
}

interface GridRow {
  key: string
  /** Shown before the row. The accessible name of the row is `name`. */
  label?: React.ReactNode
  name: string
}

interface GridProps {
  rows: GridRow[]
  columns: GridColumn[]
  /** The value of a cell; `undefined` for a cell that isn't part of the data (drawn blank). */
  valueAt: (row: number, column: number) => number | null | undefined
  /** The accessible name of a cell. */
  nameAt: (row: number, column: number) => string
  max: number
  color: string
  cellSize: number
  className?: string
  'aria-label'?: string
  /** Starts scrolled to the right end when it doesn't fit (calendars: the latest weeks first). */
  scrollToEnd?: boolean
}

/** The grid both heatmaps draw: a table with row and column headers, one roving tab stop. */
function HeatmapGrid({
  rows,
  columns,
  valueAt,
  nameAt,
  max,
  color,
  cellSize,
  className,
  'aria-label': ariaLabel,
  scrollToEnd = false,
}: GridProps) {
  const t = useCoreloomI18n().messages.charts
  const scroller = React.useRef<HTMLDivElement>(null)
  const [focus, setFocus] = React.useState<[number, number]>([0, 0])
  const [active, setActive] = React.useState<[number, number] | null>(null)

  function move(row: number, column: number) {
    const r = Math.min(rows.length - 1, Math.max(0, row))
    const c = Math.min(columns.length - 1, Math.max(0, column))
    setFocus([r, c])
    setActive([r, c])
    scroller.current?.querySelector<HTMLElement>(`[data-cell="${r}-${c}"]`)?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const [r, c] = focus
    const next: Record<string, [number, number]> = {
      ArrowUp: [r - 1, c],
      ArrowDown: [r + 1, c],
      ArrowLeft: [r, c - 1],
      ArrowRight: [r, c + 1],
      Home: event.ctrlKey ? [0, 0] : [r, 0],
      End: event.ctrlKey ? [rows.length - 1, columns.length - 1] : [r, columns.length - 1],
    }
    const target = next[event.key] as [number, number] | undefined
    if (!target) return
    event.preventDefault()
    move(target[0], target[1])
  }

  const readout = active ? nameAt(active[0], active[1]) : null

  return (
    <div data-slot="heatmap" className={cn('grid w-fit max-w-full min-w-0 gap-2', className)}>
      {/* A right-to-left scroller starts at its right end with no script, so it never depends on
          when fonts finish loading; the table inside stays left to right. The table's right margin
          leaves room for the last month's name, which is wider than its column. */}
      <div
        ref={scroller}
        dir={scrollToEnd ? 'rtl' : undefined}
        className="min-w-0 overflow-x-auto pb-1"
      >
        <table
          dir="ltr"
          role="grid"
          aria-label={ariaLabel}
          className="mr-4 border-separate"
          style={{ borderSpacing: Math.max(2, Math.round(cellSize / 6)) }}
          onKeyDown={onKeyDown}
        >
          <thead>
            <tr>
              <td aria-hidden />
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className="h-4 p-0 text-left align-bottom font-mono text-[10.5px] font-normal whitespace-nowrap text-muted-foreground"
                  style={{ width: cellSize, maxWidth: cellSize }}
                >
                  {col.label != null ? (
                    <span className="block overflow-visible">
                      <span aria-hidden>{col.label}</span>
                      <span className="sr-only">{col.name}</span>
                    </span>
                  ) : (
                    <span className="sr-only">{col.name}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={row.key}>
                <th
                  scope="row"
                  className="pr-1.5 text-right font-mono text-[10.5px] font-normal whitespace-nowrap text-muted-foreground"
                >
                  <span aria-hidden>{row.label}</span>
                  <span className="sr-only">{row.name}</span>
                </th>
                {columns.map((col, c) => {
                  const value = valueAt(r, c)
                  const level = heatmapLevel(value, max)
                  const isFocus = focus[0] === r && focus[1] === c
                  const isActive = active?.[0] === r && active[1] === c
                  return (
                    <td
                      key={col.key}
                      role="gridcell"
                      data-cell={`${r}-${c}`}
                      tabIndex={isFocus ? 0 : -1}
                      aria-label={nameAt(r, c)}
                      className="rounded-[3px] p-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                      onPointerEnter={() => {
                        setActive([r, c])
                      }}
                      onPointerLeave={() => {
                        setActive(null)
                      }}
                      onFocus={() => {
                        setFocus([r, c])
                        setActive([r, c])
                      }}
                      onClick={() => {
                        setFocus([r, c])
                        setActive([r, c])
                      }}
                    >
                      <div
                        className={cn(
                          'rounded-[3px]',
                          value === undefined && 'opacity-0',
                          isActive && 'ring-1 ring-foreground',
                        )}
                        style={{
                          width: cellSize,
                          height: cellSize,
                          background: levelColor(level, color),
                        }}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        aria-hidden
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-muted-foreground"
      >
        <span className="min-h-4 font-mono text-[11.5px] text-fg-secondary tabular-nums">
          {readout}
        </span>
        <span className="flex items-center gap-1">
          {t.less}
          {LEVELS.map((level) => (
            <span
              key={level}
              className="size-2.5 rounded-[2px]"
              style={{ background: levelColor(level, color) }}
            />
          ))}
          {t.more}
        </span>
      </div>
    </div>
  )
}

interface HeatmapCell {
  row: string
  column: string
  /** `null` when there is no data for this cell (said as "No data"). */
  value: number | null
}

interface HeatmapProps {
  data: readonly HeatmapCell[]
  /** Row order (default: as they first appear in `data`). */
  rows?: readonly string[]
  /** Column order (default: as they first appear in `data`). */
  columns?: readonly string[]
  /** Labels every nth column only (default 1: all), for dense axes like 24 hours. */
  columnLabelEvery?: number
  /** The value of the darkest step (default: the largest value). */
  max?: number
  /** A chart token, `var(--chart-1)` by default. */
  color?: string
  /** Side of a cell in pixels (default 20). */
  cellSize?: number
  /** Formats values in cell names and the readout (default: the locale's number format). */
  formatValue?: (value: number) => string
  className?: string
  /** What the grid shows ("Deploys by weekday and hour"). */
  'aria-label'?: string
}

function uniq(values: Iterable<string>) {
  return [...new Set(values)]
}

function Heatmap({
  data,
  rows,
  columns,
  columnLabelEvery = 1,
  max,
  color = 'var(--chart-1)',
  cellSize = 20,
  formatValue,
  className,
  'aria-label': ariaLabel,
}: HeatmapProps) {
  const { messages, formatNumber } = useCoreloomI18n()
  const t = messages.charts
  const fmt = formatValue ?? formatNumber
  const rowKeys = rows ? [...rows] : uniq(data.map((d) => d.row))
  const colKeys = columns ? [...columns] : uniq(data.map((d) => d.column))
  const values = new Map(data.map((d) => [`${d.row}\u0000${d.column}`, d.value]))
  const top = max ?? Math.max(0, ...data.map((d) => d.value ?? 0))
  const every = Math.max(1, Math.floor(columnLabelEvery))
  const valueAt = (r: number, c: number) => values.get(`${rowKeys[r]}\u0000${colKeys[c]}`) ?? null

  if (rowKeys.length === 0 || colKeys.length === 0)
    return <p className={cn('text-[13px] text-muted-foreground', className)}>{t.empty}</p>

  return (
    <HeatmapGrid
      rows={rowKeys.map((key) => ({ key, label: key, name: key }))}
      columns={colKeys.map((key, i) => ({ key, label: i % every === 0 ? key : null, name: key }))}
      valueAt={valueAt}
      nameAt={(r, c) => {
        const v = valueAt(r, c)
        return t.cell(`${rowKeys[r]}, ${colKeys[c]}`, v === null ? t.noData : fmt(v))
      }}
      max={top}
      color={color}
      cellSize={cellSize}
      className={className}
      aria-label={ariaLabel}
    />
  )
}

interface CalendarHeatmapDay {
  /** `YYYY-MM-DD`. */
  date: string
  value: number
}

interface CalendarHeatmapProps {
  data: readonly CalendarHeatmapDay[]
  /** Last day shown, `YYYY-MM-DD` (default: the latest date in `data`). */
  to?: string
  /** How many weeks end at `to` (default 53, a year). */
  weeks?: number
  max?: number
  color?: string
  /** Side of a cell in pixels (default 12). */
  cellSize?: number
  /** Says a day's value in cell names and the readout ("3 deploys"). Default: the number. */
  formatValue?: (value: number) => string
  className?: string
  'aria-label'?: string
}

const DAY = 86_400_000

/** Midnight UTC of a `YYYY-MM-DD` date, or NaN. Dates stay in UTC so no time zone shifts a day. */
function parseDay(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.NaN
}

/**
 * The weeks (Monday first) that end with the week of `to`: `weeks` columns of 7 days each, as UTC
 * timestamps. Days after `to` are left out of the data (they're drawn blank).
 */
function calendarWeeks(to: number, weeks: number) {
  const weekday = (new Date(to).getUTCDay() + 6) % 7 // Monday = 0
  const start = to - weekday * DAY - (Math.max(1, weeks) - 1) * 7 * DAY
  return Array.from({ length: Math.max(1, weeks) }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => start + (w * 7 + d) * DAY),
  )
}

function CalendarHeatmap({
  data,
  to,
  weeks = 53,
  max,
  color = 'var(--chart-1)',
  cellSize = 12,
  formatValue,
  className,
  'aria-label': ariaLabel,
}: CalendarHeatmapProps) {
  const { messages, locale, formatNumber } = useCoreloomI18n()
  const t = messages.charts
  const fmt = formatValue ?? formatNumber
  const byDay = new Map<number, number>()
  for (const d of data) {
    const day = parseDay(d.date)
    if (Number.isFinite(day) && Number.isFinite(d.value))
      byDay.set(day, (byDay.get(day) ?? 0) + d.value)
  }
  const end = to ? parseDay(to) : Math.max(...byDay.keys())
  if (!Number.isFinite(end))
    return <p className={cn('text-[13px] text-muted-foreground', className)}>{t.empty}</p>

  const grid = calendarWeeks(end, weeks)
  const first = grid[0][0]
  const top =
    max ?? Math.max(0, ...[...byDay].filter(([d]) => d >= first && d <= end).map(([, v]) => v))
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
  const weekdayLong = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' })
  const full = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' })

  const columns = grid.map((week, w) => {
    // A month is named above the first week that starts in it (and above the first column).
    const firstOfMonth = week.find((d) => new Date(d).getUTCDate() === 1)
    const label =
      w === 0
        ? month.format(week[6])
        : firstOfMonth !== undefined
          ? month.format(firstOfMonth)
          : null
    return { key: String(week[0]), label, name: t.weekOf(full.format(week[0])) }
  })
  // Labels on Monday, Wednesday and Friday only, like most calendars: the rows are too thin for all.
  const rows = grid[0].map((d, i) => ({
    key: String(i),
    label: i % 2 === 0 && i < 6 ? weekdayFmt.format(d) : null,
    name: weekdayLong.format(d),
  }))
  const valueAt = (r: number, c: number) => {
    const day = grid[c][r]
    if (day > end) return undefined
    return byDay.get(day) ?? 0
  }

  return (
    <HeatmapGrid
      rows={rows}
      columns={columns}
      valueAt={valueAt}
      nameAt={(r, c) => {
        const v = valueAt(r, c)
        return t.cell(full.format(grid[c][r]), v === undefined ? t.noData : fmt(v))
      }}
      max={top}
      color={color}
      cellSize={cellSize}
      className={className}
      aria-label={ariaLabel}
      scrollToEnd
    />
  )
}

export {
  CalendarHeatmap,
  type CalendarHeatmapDay,
  type CalendarHeatmapProps,
  calendarWeeks,
  Heatmap,
  type HeatmapCell,
  heatmapLevel,
  type HeatmapProps,
  parseDay,
}
