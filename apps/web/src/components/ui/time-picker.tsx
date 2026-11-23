import type { Locale } from 'date-fns'
import { ClockIcon } from 'lucide-react'
import * as React from 'react'

import { DatePicker } from '@/components/ui/date-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const pad = (n: number) => String(n).padStart(2, '0')

/** "HH:mm" → minutes since midnight; NaN when it isn't that shape. */
function toMinutes(time: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(time)
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

const fromMinutes = (n: number) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`

/**
 * Reads a typed time and returns "HH:mm", or undefined when it can't. Accepts "14:30", "14.30",
 * "14h30", "14h", "14", "1430", "930", and 12-hour forms ("2:30 pm", "2pm", "12 a.m.").
 */
function parseTime(text: string): string | undefined {
  const s = text.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!s) return undefined
  const period = /\s*([ap])\.?\s*(?:m\.?)?$/.exec(s)
  const core = period ? s.slice(0, period.index).trim() : s
  let h: number
  let m = 0
  const parts = /^(\d{1,2})(?:\s*[:h.]\s*(\d{2})?)?$/.exec(core)
  if (parts) {
    h = Number(parts[1])
    if (parts[2]) m = Number(parts[2])
  } else if (/^\d{3,4}$/.test(core)) {
    h = Number(core.slice(0, -2))
    m = Number(core.slice(-2))
  } else return undefined
  if (period) {
    if (h < 1 || h > 12) return undefined
    if (period[1] === 'p' && h !== 12) h += 12
    if (period[1] === 'a' && h === 12) h = 0
  }
  if (h > 23 || m > 59) return undefined
  return `${pad(h)}:${pad(m)}`
}

/** "14:30" in the locale's clock: "2:30 PM" in English, "14:30" in French. */
function formatTime(time: string | undefined, locale: string) {
  const n = time === undefined ? NaN : toMinutes(time)
  if (Number.isNaN(n)) return ''
  // 24-hour clocks pad the hour ("09:30"); 12-hour ones don't ("9:30 AM").
  const twelve = /h1[12]/.test(
    new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle ?? '',
  )
  return new Intl.DateTimeFormat(locale, {
    hour: twelve ? 'numeric' : '2-digit',
    minute: '2-digit',
  }).format(new Date(2026, 0, 1, Math.floor(n / 60), n % 60))
}

/** The times offered in the list, every `step` minutes from `min` to `max`. */
function timeOptions(step = 30, min = '00:00', max = '23:59') {
  const from = toMinutes(min)
  const to = toMinutes(max)
  const every = Math.max(1, Math.round(step))
  const out: string[] = []
  for (let n = Number.isNaN(from) ? 0 : from; n <= (Number.isNaN(to) ? 1439 : to); n += every)
    out.push(fromMinutes(n))
  return out
}

/** The shape the locale writes times in, for the placeholder and the error ("hh:mm AM/PM"). */
function timeHint(locale: string, tokens: { hour: string; minute: string }) {
  const f = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' })
  const twelve = /h1[12]/.test(f.resolvedOptions().hourCycle ?? '')
  if (!twelve) return `${tokens.hour}:${tokens.minute}`
  const period = (h: number) =>
    f.formatToParts(new Date(2026, 0, 1, h)).find((p) => p.type === 'dayPeriod')?.value ?? ''
  return `${tokens.hour}:${tokens.minute} ${period(9)}/${period(21)}`
}

function TimePicker({
  value,
  defaultValue,
  onValueChange,
  step = 30,
  min,
  max,
  locale,
  placeholder,
  disabled,
  className,
  id,
  name,
  onBlur,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: {
  /** "HH:mm", 24-hour ("14:30"); undefined when empty. */
  value?: string
  defaultValue?: string
  onValueChange?: (time: string | undefined) => void
  /** Minutes between the times in the list (default 30). Typed times can be any minute. */
  step?: number
  /** First and last times in the list ("08:00", "18:00"). */
  min?: string
  max?: string
  /** Time format; defaults to the i18n locale. */
  locale?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  name?: string
  onBlur?: () => void
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-label'?: string
  'aria-describedby'?: string
}) {
  const i18n = useCoreloomI18n()
  const t = i18n.messages.inputs.time
  locale ??= i18n.locale
  const [inner, setInner] = React.useState<string | undefined>(defaultValue)
  const current = value ?? inner
  const [text, setText] = React.useState(() => formatTime(current, locale))
  const [unreadable, setUnreadable] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const hintId = React.useId()
  const hint = timeHint(locale, t.formatTokens)
  // The value this field sent itself; only changes from outside rewrite the text.
  const sent = React.useRef<string | undefined | null>(null)

  const send = (time: string | undefined) => {
    sent.current = time
    if (value === undefined) setInner(time)
    onValueChange?.(time)
  }

  // Follow outside changes (picked in the list, a form reset, a new locale).
  React.useEffect(() => {
    if (sent.current !== null && sent.current === current) return
    setText(formatTime(current, locale))
    setUnreadable(false)
  }, [current, locale])

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        data-slot="time-picker"
        data-disabled={disabled ? true : undefined}
        className="flex h-[42px] w-full items-center rounded-md border border-input bg-inset font-sans text-[14px] transition-[border-color,box-shadow] duration-base ease-out focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-[3px] has-[[aria-invalid=true]]:ring-destructive-subtle data-[disabled]:opacity-55"
      >
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          autoComplete="off"
          value={text}
          placeholder={placeholder ?? hint}
          disabled={disabled}
          aria-invalid={unreadable || ariaInvalid}
          aria-label={ariaLabel}
          aria-describedby={
            [unreadable ? hintId : undefined, ariaDescribedBy].filter(Boolean).join(' ') ||
            undefined
          }
          data-value={current}
          className="h-full min-w-0 flex-1 bg-transparent px-[13px] text-foreground tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          onChange={(e) => {
            setText(e.target.value)
            const time = parseTime(e.target.value)
            if (time) {
              setUnreadable(false)
              send(time)
            } else if (!e.target.value.trim()) send(undefined)
          }}
          onBlur={() => {
            const time = parseTime(text)
            if (time) setText(formatTime(time, locale))
            setUnreadable(!!text.trim() && !time)
            if (!time && text.trim()) send(undefined)
            onBlur?.()
          }}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={t.openList}
              data-slot="time-picker-trigger"
              className="mr-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed"
            >
              <ClockIcon className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-40 p-1">
            <TimeList
              label={t.times}
              options={timeOptions(step, min, max)}
              selected={current}
              locale={locale}
              onPick={(time) => {
                send(time)
                setText(formatTime(time, locale))
                setUnreadable(false)
                setOpen(false)
                requestAnimationFrame(() => inputRef.current?.focus())
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      {unreadable && (
        <p id={hintId} data-slot="time-picker-hint" className="m-0 text-[11px] text-destructive">
          {t.invalid(hint)}
        </p>
      )}
    </div>
  )
}

/** A listbox of times: arrows, Home / End and typing move; Enter or a click picks. */
function TimeList({
  label,
  options,
  selected,
  locale,
  onPick,
}: {
  label: string
  options: string[]
  selected?: string
  locale: string
  onPick: (time: string) => void
}) {
  // Start on the picked time, or the first one after it when it isn't in the list.
  const initial = React.useMemo(() => {
    if (!selected) return 0
    const at = options.indexOf(selected)
    if (at >= 0) return at
    const after = options.findIndex((o) => toMinutes(o) > toMinutes(selected))
    return after >= 0 ? after : options.length - 1
  }, [options, selected])
  const [active, setActive] = React.useState(initial)
  const listId = React.useId()
  const listRef = React.useRef<HTMLDivElement>(null)
  const optionId = (i: number) => `${listId}-${String(i)}`

  // The first scroll centres the picked time; moves after that scroll as little as possible.
  const scrolled = React.useRef(false)
  React.useEffect(() => {
    document
      .getElementById(optionId(active))
      ?.scrollIntoView({ block: scrolled.current ? 'nearest' : 'center' })
    scrolled.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId only depends on listId.
  }, [active])

  return (
    <div
      ref={listRef}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={options.length ? optionId(active) : undefined}
      data-slot="time-picker-list"
      className="max-h-60 overflow-y-auto rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      onKeyDown={(e) => {
        const last = options.length - 1
        const moves: Record<string, number> = {
          ArrowDown: Math.min(last, active + 1),
          ArrowUp: Math.max(0, active - 1),
          Home: 0,
          End: last,
          PageDown: Math.min(last, active + 5),
          PageUp: Math.max(0, active - 5),
        }
        if (e.key in moves) {
          e.preventDefault()
          setActive(moves[e.key] ?? active)
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          const time = options[active]
          if (time) onPick(time)
        } else if (/^\d$/.test(e.key)) {
          // Typing an hour's digit jumps to the next time in that hour.
          const at = options.findIndex(
            (o, i) => i > active && formatTime(o, locale).startsWith(e.key),
          )
          const wrap = options.findIndex((o) => formatTime(o, locale).startsWith(e.key))
          const next = at >= 0 ? at : wrap
          if (next >= 0) setActive(next)
        }
      }}
    >
      {options.map((time, i) => (
        // Options are picked through the listbox's own keyboard handling (aria-activedescendant).
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- keys are handled on the listbox.
        <div
          key={time}
          id={optionId(i)}
          role="option"
          tabIndex={-1}
          aria-selected={time === selected}
          data-active={i === active ? true : undefined}
          className="flex h-8 cursor-pointer items-center rounded-sm px-2.5 font-sans text-[13px] text-foreground tabular-nums hover:bg-accent aria-selected:font-semibold aria-selected:text-primary-text data-[active]:bg-accent"
          onPointerMove={() => {
            if (active !== i) setActive(i)
          }}
          onClick={() => {
            onPick(time)
          }}
        >
          {formatTime(time, locale)}
        </div>
      ))}
    </div>
  )
}

/** Joins a day and an "HH:mm" time into one Date (local time). */
function withTime(day: Date, time: string) {
  const n = toMinutes(time)
  const out = new Date(day)
  out.setHours(Math.floor(n / 60), n % 60, 0, 0)
  return out
}

/**
 * A date and a time of day as one Date: a DatePicker and a TimePicker side by side. Picking a day
 * keeps the time (or uses `defaultTime`); changing the time keeps the day.
 */
function DateTimePicker({
  value,
  defaultValue,
  onValueChange,
  defaultTime = '09:00',
  step,
  minTime,
  maxTime,
  dateLocale,
  locale,
  disabled,
  className,
  id,
  calendarProps,
  onBlur,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: {
  value?: Date
  defaultValue?: Date
  onValueChange?: (date: Date | undefined) => void
  /** The time used when a day is picked before any time ("09:00"). */
  defaultTime?: string
  /** Minutes between the times in the list (default 30). */
  step?: number
  minTime?: string
  maxTime?: string
  /** date-fns locale for the day (defaults to the i18n one). */
  dateLocale?: Locale
  /** Time format; defaults to the i18n locale. */
  locale?: string
  disabled?: boolean
  className?: string
  /** Goes on the day part, so a FieldLabel names it. */
  id?: string
  calendarProps?: React.ComponentProps<typeof DatePicker>['calendarProps']
  onBlur?: () => void
  'aria-invalid'?: boolean | 'true' | 'false'
  /** Names the whole group; the two parts are named "Date" and "Time" within it. */
  'aria-label'?: string
  'aria-describedby'?: string
}) {
  const t = useCoreloomI18n().messages.inputs.dateTime
  const [inner, setInner] = React.useState<Date | undefined>(defaultValue)
  const current = value ?? inner
  // A time chosen before the day: kept until a day is picked.
  const [pendingTime, setPendingTime] = React.useState<string | undefined>()
  const time = current ? `${pad(current.getHours())}:${pad(current.getMinutes())}` : pendingTime
  const commit = (next: Date | undefined) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      data-slot="date-time-picker"
      className={cn('flex w-full flex-wrap gap-2', className)}
    >
      <DatePicker
        id={id}
        value={current}
        onValueChange={(day) => {
          commit(day ? withTime(day, time ?? defaultTime) : undefined)
        }}
        formatString="PP"
        locale={dateLocale}
        disabled={disabled}
        calendarProps={calendarProps}
        onBlur={onBlur}
        aria-invalid={ariaInvalid}
        aria-label={id ? undefined : t.date}
        className="min-w-40 flex-1"
      />
      <TimePicker
        value={time}
        onValueChange={(next) => {
          if (!next) return
          if (current) commit(withTime(current, next))
          else setPendingTime(next)
        }}
        step={step}
        min={minTime}
        max={maxTime}
        locale={locale}
        disabled={disabled}
        onBlur={onBlur}
        aria-invalid={ariaInvalid}
        aria-label={t.time}
        className="w-40 flex-none"
      />
    </div>
  )
}

export { DateTimePicker, formatTime, parseTime, timeOptions, TimePicker }
