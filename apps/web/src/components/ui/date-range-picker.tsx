'use client'

// Coreloom UI — DateRangePicker. A trigger that opens a two-month Calendar in range mode, with
// shortcuts ("Last 7 days", "This month") down the side. The value is { from, to } (react-day-picker's
// DateRange); either end may be undefined while the user picks.
import {
  endOfMonth,
  format,
  type Locale,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from 'date-fns'
import { CalendarRangeIcon } from 'lucide-react'
import * as React from 'react'
import type { DateRange } from 'react-day-picker'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface DateRangePreset {
  label: string
  range: () => DateRange
}

/** The built-in shortcuts, relative to today. */
function useDefaultPresets(): DateRangePreset[] {
  const t = useCoreloomI18n().messages.dateRange
  return React.useMemo(() => {
    const today = () => startOfDay(new Date())
    return [
      { label: t.today, range: () => ({ from: today(), to: today() }) },
      { label: t.yesterday, range: () => ({ from: subDays(today(), 1), to: subDays(today(), 1) }) },
      { label: t.last7, range: () => ({ from: subDays(today(), 6), to: today() }) },
      { label: t.last30, range: () => ({ from: subDays(today(), 29), to: today() }) },
      { label: t.thisMonth, range: () => ({ from: startOfMonth(today()), to: today() }) },
      {
        label: t.lastMonth,
        range: () => ({
          from: startOfMonth(subMonths(today(), 1)),
          to: endOfMonth(subMonths(today(), 1)),
        }),
      },
    ]
  }, [t])
}

function sameDay(a?: Date, b?: Date) {
  return !!a && !!b && a.toDateString() === b.toDateString()
}

function DateRangePicker({
  value,
  defaultValue,
  onValueChange,
  placeholder,
  formatString = 'PP',
  locale,
  presets,
  numberOfMonths = 2,
  disabled,
  className,
  id,
  calendarProps,
  onBlur,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedby,
}: {
  value?: DateRange
  defaultValue?: DateRange
  onValueChange?: (range: DateRange | undefined) => void
  placeholder?: string
  /** date-fns format for each end of the label ("PP" = "Oct 14, 2026"). */
  formatString?: string
  /** date-fns locale; defaults to the i18n provider's `dateLocale`. */
  locale?: Locale
  /** Shortcuts down the side. `false` hides them; an array replaces the built-in ones. */
  presets?: DateRangePreset[] | false
  numberOfMonths?: number
  disabled?: boolean
  className?: string
  id?: string
  /** Passed to Calendar: disabled days, startMonth / endMonth, min / max nights… */
  calendarProps?: Omit<
    React.ComponentProps<typeof Calendar>,
    'mode' | 'selected' | 'onSelect' | 'required'
  >
  /** Called when the popover closes (a form's "touched"). */
  onBlur?: () => void
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-label'?: string
  'aria-describedby'?: string
}) {
  const i18n = useCoreloomI18n()
  const t = i18n.messages.dateRange
  placeholder ??= t.placeholder
  locale ??= i18n.dateLocale as Locale | undefined
  const builtIn = useDefaultPresets()
  const shortcuts = presets === false ? [] : (presets ?? builtIn)

  const [open, setOpen] = React.useState(false)
  const [inner, setInner] = React.useState<DateRange | undefined>(defaultValue)
  const current = value ?? inner

  const set = (next: DateRange | undefined) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }

  const label = current?.from
    ? current.to && !sameDay(current.from, current.to)
      ? `${format(current.from, formatString, { locale })} – ${format(current.to, formatString, { locale })}`
      : format(current.from, formatString, { locale })
    : placeholder

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onBlur?.()
      }}
    >
      <PopoverTrigger asChild>
        {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- the trigger stands in for the field's control; aria-invalid drives its error styling and is a global attribute in ARIA 1.1. */}
        <button
          type="button"
          id={id}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedby}
          disabled={disabled}
          data-slot="date-range-picker-trigger"
          data-placeholder={current?.from ? undefined : ''}
          className={cn(
            'flex h-[42px] w-full cursor-pointer items-center gap-2.5 rounded-md border border-input bg-inset px-[13px] text-left font-sans text-[14px] whitespace-nowrap text-foreground transition-[border-color,box-shadow] duration-base ease-out outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 aria-expanded:border-primary aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive-subtle aria-invalid:focus-visible:ring-destructive/70 data-[placeholder]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0',
            className,
          )}
        >
          <CalendarRangeIcon className="size-4 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto flex-col p-0 sm:flex-row">
        {shortcuts.length > 0 && (
          <div
            role="group"
            aria-label={t.presets}
            className="flex gap-1 overflow-x-auto border-b border-border-subtle p-2 sm:w-40 sm:flex-col sm:border-r sm:border-b-0"
          >
            {shortcuts.map((preset) => {
              const r = preset.range()
              const active = sameDay(r.from, current?.from) && sameDay(r.to, current?.to)
              return (
                <Button
                  key={preset.label}
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={active}
                  className={cn(
                    'shrink-0 justify-start font-medium',
                    active && 'bg-primary-subtle text-primary-text hover:bg-primary-subtle',
                  )}
                  onClick={() => {
                    set(r)
                    setOpen(false)
                    onBlur?.()
                  }}
                >
                  {preset.label}
                </Button>
              )
            })}
          </div>
        )}
        <Calendar
          mode="range"
          selected={current}
          onSelect={set}
          defaultMonth={
            current?.from ?? (numberOfMonths > 1 ? subMonths(new Date(), 1) : undefined)
          }
          numberOfMonths={numberOfMonths}
          autoFocus
          locale={locale}
          {...calendarProps}
        />
      </PopoverContent>
    </Popover>
  )
}

export { type DateRange, DateRangePicker, type DateRangePreset }
