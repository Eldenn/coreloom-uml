'use client'

// Coreloom UI — MonthPicker. A month of a year, for reports, billing periods and card expiry
// dates. The value is "YYYY-MM" ("2026-10"). The popover shows a year with its twelve months; arrows
// move between months (up and down by a row of three), Page Up / Page Down change the year.
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** "2026-10" → { year: 2026, month: 10 }; undefined when it isn't a month. */
function parseMonth(value: string | undefined) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value ?? '')
  return m ? { year: Number(m[1]), month: Number(m[2]) } : undefined
}

/** { year: 2026, month: 3 } → "2026-03". */
function toMonthValue(year: number, month: number) {
  return `${String(year)}-${String(month).padStart(2, '0')}`
}

function MonthPicker({
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  placeholder,
  disabled,
  id,
  className,
  onBlur,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  /** "YYYY-MM", or "" for none. */
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Earliest and latest months that can be picked ("2024-01"). */
  min?: string
  max?: string
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  onBlur?: () => void
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const i18n = useCoreloomI18n()
  const t = i18n.messages.inputs.month
  const [inner, setInner] = React.useState(defaultValue ?? '')
  const current = parseMonth(value ?? inner)
  const [open, setOpen] = React.useState(false)
  const today = new Date()
  const [year, setYear] = React.useState(current?.year ?? today.getFullYear())
  // The month that holds the keyboard focus in the grid (1–12).
  const [active, setActive] = React.useState(current?.month ?? today.getMonth() + 1)
  const gridRef = React.useRef<HTMLDivElement>(null)
  const lo = parseMonth(min)
  const hi = parseMonth(max)

  const monthName = (month: number, style: 'short' | 'long') =>
    new Date(2000, month - 1, 1).toLocaleString(i18n.locale, { month: style })
  const label = (y: number, month: number) =>
    new Date(y, month - 1, 1).toLocaleString(i18n.locale, { month: 'long', year: 'numeric' })
  const outOfRange = (y: number, month: number) => {
    const n = y * 12 + month
    const tooEarly = lo ? n < lo.year * 12 + lo.month : false
    const tooLate = hi ? n > hi.year * 12 + hi.month : false
    return tooEarly || tooLate
  }

  // Opening focuses the picked (or current) month, once the grid is on screen. An effect rather
  // than onOpenAutoFocus: reopened during the closing animation, the popover doesn't fire it again.
  React.useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [open])

  const focusMonth = (y: number, month: number) => {
    const focus = () =>
      gridRef.current?.querySelector<HTMLElement>(`[data-month="${String(month)}"]`)?.focus()
    setActive(month)
    // Same year: the button is already there. Another year: focus it once it has rendered.
    if (y === year) focus()
    else {
      setYear(y)
      requestAnimationFrame(focus)
    }
  }

  const pick = (month: number) => {
    const next = toMonthValue(year, month)
    if (value === undefined) setInner(next)
    onValueChange?.(next)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setYear(current?.year ?? today.getFullYear())
          setActive(current?.month ?? today.getMonth() + 1)
        } else onBlur?.()
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
          data-slot="month-picker-trigger"
          data-placeholder={current ? undefined : ''}
          className={cn(
            'flex h-[42px] w-full cursor-pointer items-center gap-2.5 rounded-md border border-input bg-inset px-[13px] text-left font-sans text-[14px] whitespace-nowrap text-foreground transition-[border-color,box-shadow] duration-base ease-out outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 aria-expanded:border-primary aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive-subtle data-[placeholder]:text-muted-foreground [&_svg]:shrink-0',
            className,
          )}
        >
          <CalendarIcon aria-hidden className="size-4 text-muted-foreground" />
          <span className="truncate first-letter:uppercase">
            {current ? label(current.year, current.month) : (placeholder ?? t.placeholder)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-3"
        onOpenAutoFocus={(e) => {
          // The effect below focuses the picked month instead.
          e.preventDefault()
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.previousYear}
            disabled={lo ? year <= lo.year : false}
            onClick={() => {
              setYear(year - 1)
            }}
          >
            <ChevronLeftIcon />
          </Button>
          <span aria-live="polite" className="font-display text-[15px] font-semibold">
            {year}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.nextYear}
            disabled={hi ? year >= hi.year : false}
            onClick={() => {
              setYear(year + 1)
            }}
          >
            <ChevronRightIcon />
          </Button>
        </div>
        {/* Arrow keys move the focus between the month buttons inside (a roving tab stop). */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the keys act on the buttons inside. */}
        <div
          ref={gridRef}
          role="group"
          aria-label={String(year)}
          className="grid grid-cols-3 gap-1"
          onKeyDown={(e) => {
            const moves: Partial<Record<string, number>> = {
              ArrowLeft: -1,
              ArrowRight: 1,
              ArrowUp: -3,
              ArrowDown: 3,
              PageUp: -12,
              PageDown: 12,
            }
            let delta = moves[e.key]
            if (e.key === 'Home') delta = 1 - active
            if (e.key === 'End') delta = 12 - active
            if (delta === undefined) return
            e.preventDefault()
            const n = year * 12 + (active - 1) + delta
            focusMonth(Math.floor(n / 12), (n % 12) + 1)
          }}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
            const picked = current?.year === year && current.month === month
            const isNow = today.getFullYear() === year && today.getMonth() + 1 === month
            return (
              <button
                key={month}
                type="button"
                data-month={month}
                tabIndex={month === active ? 0 : -1}
                disabled={outOfRange(year, month)}
                aria-pressed={picked}
                aria-label={label(year, month)}
                aria-current={isNow ? 'date' : undefined}
                onClick={() => {
                  pick(month)
                }}
                onFocus={() => {
                  setActive(month)
                }}
                className={cn(
                  'h-10 cursor-pointer rounded-md font-sans text-[13px] text-foreground capitalize outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-faint-foreground disabled:line-through disabled:hover:bg-transparent',
                  isNow && 'font-semibold text-primary-text ring-1 ring-border-strong ring-inset',
                  picked &&
                    'bg-primary text-primary-foreground ring-0 hover:bg-primary-hover focus-visible:ring-[3px]',
                )}
              >
                {monthName(month, 'short')}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { MonthPicker, parseMonth, toMonthValue }
