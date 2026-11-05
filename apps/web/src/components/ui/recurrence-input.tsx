import * as React from 'react'

import { ChipGroup } from '@/components/ui/chip-group'
import { DatePicker } from '@/components/ui/date-picker'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { NumberInput } from '@/components/ui/number-input'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type RecurrenceFrequency = 'day' | 'week' | 'month' | 'year'

type RecurrenceEnd =
  { type: 'never' } | { type: 'on'; date: string } | { type: 'after'; count: number }

interface Recurrence {
  frequency: RecurrenceFrequency
  /** Every `interval` days, weeks… (1 or more). */
  interval: number
  /** ISO weekdays for a weekly rule: 1 is Monday, 7 is Sunday. */
  weekdays?: number[]
  /** Day of the month for a monthly rule (1–31). */
  monthDay?: number
  end: RecurrenceEnd
}

const FREQUENCIES: RecurrenceFrequency[] = ['day', 'week', 'month', 'year']
const RRULE_FREQ = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' } as const
const RRULE_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const

/** The rule as an iCalendar RRULE value (without the "RRULE:" prefix). */
function toRRule(rule: Recurrence): string {
  const parts = [`FREQ=${RRULE_FREQ[rule.frequency]}`]
  if (rule.interval > 1) parts.push(`INTERVAL=${String(rule.interval)}`)
  if (rule.frequency === 'week' && rule.weekdays?.length)
    parts.push(
      `BYDAY=${[...rule.weekdays]
        .sort((a, b) => a - b)
        .map((d) => RRULE_DAYS[d - 1])
        .join(',')}`,
    )
  if (rule.frequency === 'month' && rule.monthDay) parts.push(`BYMONTHDAY=${String(rule.monthDay)}`)
  if (rule.end.type === 'on') parts.push(`UNTIL=${rule.end.date.replaceAll('-', '')}`)
  if (rule.end.type === 'after') parts.push(`COUNT=${String(rule.end.count)}`)
  return parts.join(';')
}

/** Reads an RRULE ("RRULE:" prefix optional); undefined when it holds something this can't show. */
function parseRRule(text: string): Recurrence | undefined {
  const fields = new Map(
    text
      .replace(/^RRULE:/i, '')
      .split(';')
      .filter(Boolean)
      .map((p) => {
        const [k = '', v = ''] = p.split('=')
        return [k.toUpperCase(), v.toUpperCase()] as const
      }),
  )
  const frequency = FREQUENCIES.find((f) => RRULE_FREQ[f] === fields.get('FREQ'))
  if (!frequency) return undefined
  const known = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'UNTIL', 'COUNT'])
  if ([...fields.keys()].some((k) => !known.has(k))) return undefined
  const interval = Number(fields.get('INTERVAL') ?? '1')
  if (!Number.isInteger(interval) || interval < 1) return undefined
  const rule: Recurrence = { frequency, interval, end: { type: 'never' } }
  const byDay = fields.get('BYDAY')
  if (byDay) {
    const days = byDay
      .split(',')
      .map((d) => RRULE_DAYS.indexOf(d as (typeof RRULE_DAYS)[number]) + 1)
    if (days.some((d) => d === 0)) return undefined
    rule.weekdays = days
  }
  const monthDay = fields.get('BYMONTHDAY')
  if (monthDay) rule.monthDay = Number(monthDay)
  const until = /^(\d{4})(\d{2})(\d{2})/.exec(fields.get('UNTIL') ?? '')
  const count = fields.get('COUNT')
  if (until) rule.end = { type: 'on', date: `${until[1]}-${until[2]}-${until[3]}` }
  else if (count) rule.end = { type: 'after', count: Number(count) }
  return rule
}

const toDateValue = (d: Date) =>
  `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fromDateValue = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : undefined
}

/** Short weekday names in the locale, Monday first. */
function weekdayNames(locale: string, width: 'short' | 'long') {
  const format = new Intl.DateTimeFormat(locale, { weekday: width })
  // 2026-01-05 is a Monday.
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(2026, 0, 5 + i)))
}

function RecurrenceInput({
  value,
  defaultValue = { frequency: 'week', interval: 1, weekdays: [1], end: { type: 'never' } },
  onValueChange,
  frequencies = FREQUENCIES,
  disabled,
  id,
  className,
  onBlur,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  value?: Recurrence
  defaultValue?: Recurrence
  onValueChange?: (rule: Recurrence) => void
  /** The frequencies offered (all four by default). */
  frequencies?: RecurrenceFrequency[]
  disabled?: boolean
  /** Goes on the interval field, so a FieldLabel names the rule from there. */
  id?: string
  className?: string
  onBlur?: () => void
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const { messages, locale } = useCoreloomI18n()
  const t = messages.inputs.recurrence
  const [inner, setInner] = React.useState(defaultValue)
  const rule = value ?? inner
  const set = (patch: Partial<Recurrence>) => {
    const next = { ...rule, ...patch }
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }
  const summaryId = React.useId()
  const errorId = React.useId()
  const unitId = React.useId()
  const groupId = React.useId()
  const endsId = React.useId()

  const short = weekdayNames(locale, 'short')
  const long = weekdayNames(locale, 'long')
  const weekdays = rule.weekdays ?? []
  const noDays = rule.frequency === 'week' && weekdays.length === 0
  const unit = t.units[rule.frequency](rule.interval)
  const list = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' })
  const when = [
    t.every(rule.interval, unit),
    rule.frequency === 'week' && weekdays.length
      ? t.onDays(list.format([...weekdays].sort((a, b) => a - b).map((d) => short[d - 1] ?? '')))
      : undefined,
    rule.frequency === 'month' && rule.monthDay ? t.onMonthDay(rule.monthDay) : undefined,
  ]
    .filter(Boolean)
    .join(' ')
  const endDate = rule.end.type === 'on' ? fromDateValue(rule.end.date) : undefined
  const summary = [
    when,
    endDate
      ? t.until(new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(endDate))
      : undefined,
    rule.end.type === 'after' ? t.times(rule.end.count) : undefined,
  ]
    .filter(Boolean)
    .join(', ')
  const describedBy = [summaryId, noDays ? errorId : undefined, ariaDescribedBy]
    .filter(Boolean)
    .join(' ')
  const invalid = ariaInvalid === true || ariaInvalid === 'true'

  const endRadio = (type: RecurrenceEnd['type'], label: string, control?: React.ReactNode) => (
    <div className="flex min-h-[42px] flex-wrap items-center gap-2.5">
      <label className="flex cursor-pointer items-center gap-2 text-[14px] text-foreground has-disabled:cursor-not-allowed">
        <input
          type="radio"
          name={endsId}
          checked={rule.end.type === type}
          disabled={disabled}
          className="size-4 cursor-[inherit] accent-primary"
          onChange={() => {
            set({
              end:
                type === 'never'
                  ? { type }
                  : type === 'on'
                    ? { type, date: toDateValue(new Date()) }
                    : { type, count: 10 },
            })
          }}
        />
        {label}
      </label>
      {control}
    </div>
  )

  return (
    <div
      data-slot="recurrence-input"
      className={cn('flex flex-col gap-3', className)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onBlur?.()
      }}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span id={groupId} className="text-[14px] text-foreground">
          {t.repeat}
        </span>
        <NumberInput
          id={id}
          value={rule.interval}
          min={1}
          max={999}
          stepper="none"
          disabled={disabled}
          aria-label={id ? undefined : t.interval}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="w-20"
          onValueChange={(n) => {
            set({ interval: Math.max(1, n ?? 1) })
          }}
        />
        <div className="w-36">
          <NativeSelect
            id={unitId}
            aria-label={t.frequency}
            value={rule.frequency}
            disabled={disabled}
            onChange={(e) => {
              const frequency = e.target.value as RecurrenceFrequency
              set({
                frequency,
                weekdays: frequency === 'week' ? (rule.weekdays ?? [1]) : undefined,
                monthDay: frequency === 'month' ? (rule.monthDay ?? 1) : undefined,
              })
            }}
          >
            {frequencies.map((f) => (
              <NativeSelectOption key={f} value={f}>
                {t.units[f](rule.interval)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      {rule.frequency === 'week' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[14px] text-foreground" aria-hidden>
              {t.on}
            </span>
            <ChipGroup
              size="sm"
              aria-label={t.on}
              disabled={disabled}
              value={weekdays.map(String)}
              onValueChange={(days) => {
                set({ weekdays: days.map(Number) })
              }}
              options={short.map((name, i) => ({
                value: String(i + 1),
                label: <span title={long[i]}>{name}</span>,
              }))}
            />
          </div>
          {noDays ? (
            <p id={errorId} className="m-0 text-[12px] text-destructive">
              {t.noDays}
            </p>
          ) : null}
        </div>
      )}

      {rule.frequency === 'month' && (
        <div className="flex items-center gap-2.5">
          <span className="text-[14px] text-foreground">{t.monthDay}</span>
          <NumberInput
            value={rule.monthDay ?? 1}
            min={1}
            max={31}
            stepper="none"
            disabled={disabled}
            aria-label={t.monthDay}
            className="w-20"
            onValueChange={(n) => {
              set({ monthDay: Math.min(31, Math.max(1, n ?? 1)) })
            }}
          />
        </div>
      )}

      <div
        role="radiogroup"
        aria-labelledby={`${groupId} ${endsId}-label`}
        className="flex flex-col"
      >
        <span id={`${endsId}-label`} className="text-[14px] font-medium text-foreground">
          {t.ends}
        </span>
        {endRadio('never', t.never)}
        {endRadio(
          'on',
          t.onDate,
          rule.end.type === 'on' ? (
            <div className="w-56">
              <DatePicker
                aria-label={t.endDate}
                disabled={disabled}
                value={fromDateValue(rule.end.date)}
                onValueChange={(d) => {
                  if (d) set({ end: { type: 'on', date: toDateValue(d) } })
                }}
              />
            </div>
          ) : null,
        )}
        {endRadio(
          'after',
          t.after,
          rule.end.type === 'after' ? (
            <span className="flex items-center gap-2 text-[14px] text-foreground">
              <NumberInput
                value={rule.end.count}
                min={1}
                max={999}
                stepper="none"
                disabled={disabled}
                aria-label={t.count}
                className="w-20"
                onValueChange={(n) => {
                  set({ end: { type: 'after', count: Math.max(1, n ?? 1) } })
                }}
              />
              {t.occurrences(rule.end.count)}
            </span>
          ) : null,
        )}
      </div>

      <p
        id={summaryId}
        data-slot="recurrence-summary"
        aria-live="polite"
        className="m-0 rounded-md bg-muted px-3 py-2 text-[13px] text-fg-secondary"
      >
        {summary}
      </p>
    </div>
  )
}

export {
  parseRRule,
  type Recurrence,
  type RecurrenceEnd,
  type RecurrenceFrequency,
  RecurrenceInput,
  toRRule,
}
