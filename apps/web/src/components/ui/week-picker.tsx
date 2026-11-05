import {
  endOfISOWeek,
  format,
  getISOWeek,
  getISOWeekYear,
  type Locale,
  setISOWeek,
  startOfISOWeek,
} from 'date-fns'
import { CalendarRangeIcon } from 'lucide-react'
import * as React from 'react'

import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** The ISO week of a date: "2026-W44". */
function toWeekValue(date: Date) {
  return `${String(getISOWeekYear(date))}-W${String(getISOWeek(date)).padStart(2, '0')}`
}

/** "2026-W44" → its Monday and Sunday; undefined when it isn't a week. */
function weekRange(value: string | undefined): { from: Date; to: Date } | undefined {
  const m = /^(\d{4})-W(\d{2})$/.exec(value ?? '')
  if (!m) return undefined
  const year = Number(m[1])
  const week = Number(m[2])
  // January 4th is always in week 1.
  const monday = startOfISOWeek(setISOWeek(new Date(year, 0, 4), week))
  if (getISOWeekYear(monday) !== year || getISOWeek(monday) !== week) return undefined
  return { from: monday, to: endOfISOWeek(monday) }
}

function WeekPicker({
  value,
  defaultValue,
  onValueChange,
  placeholder,
  disabled,
  id,
  className,
  calendarProps,
  onBlur,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  /** "YYYY-Www", or "" for none. */
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  /** Passed to Calendar: disabled days, startMonth / endMonth… */
  calendarProps?: Omit<
    React.ComponentProps<typeof Calendar>,
    'mode' | 'selected' | 'onSelect' | 'onDayClick'
  >
  onBlur?: () => void
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const i18n = useCoreloomI18n()
  const t = i18n.messages.inputs.week
  const locale = i18n.dateLocale as Locale | undefined
  const [inner, setInner] = React.useState(defaultValue ?? '')
  const currentValue = value ?? inner
  const range = weekRange(currentValue)
  const [open, setOpen] = React.useState(false)

  const label = range
    ? t.label(
        getISOWeek(range.from),
        `${format(range.from, 'd MMM', { locale })} – ${format(range.to, 'd MMM yyyy', { locale })}`,
      )
    : (placeholder ?? t.placeholder)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onBlur?.()
      }}
    >
      <PopoverTrigger asChild>
        {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- the trigger stands in for the field's control; aria-invalid drives its error styling. */}
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          data-slot="week-picker-trigger"
          data-placeholder={range ? undefined : ''}
          className={cn(
            'flex h-[42px] w-full cursor-pointer items-center gap-2.5 rounded-md border border-input bg-inset px-[13px] text-left font-sans text-[14px] whitespace-nowrap text-foreground transition-[border-color,box-shadow] duration-base ease-out outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 aria-expanded:border-primary aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive-subtle data-[placeholder]:text-muted-foreground [&_svg]:shrink-0',
            className,
          )}
        >
          <CalendarRangeIcon aria-hidden className="size-4 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={range}
          defaultMonth={range?.from}
          showWeekNumber
          ISOWeek
          autoFocus
          onDayClick={(day) => {
            const next = toWeekValue(day)
            if (value === undefined) setInner(next)
            onValueChange?.(next)
            setOpen(false)
          }}
          {...calendarProps}
        />
      </PopoverContent>
    </Popover>
  )
}

export { toWeekValue, WeekPicker, weekRange }
