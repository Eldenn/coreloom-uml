import { format, isValid, type Locale, parse } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import * as React from 'react'

import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** The order of day, month and year in the locale's short date ("P"): e.g. ["d", "m", "y"] in French. */
function dateOrder(locale?: Locale) {
  const sample = format(new Date(2026, 11, 31), 'P', { locale })
  const at = (part: string) => sample.indexOf(part)
  return (['d', 'm', 'y'] as const)
    .map((k) => ({ k, i: at(k === 'd' ? '31' : k === 'm' ? '12' : '2026') }))
    .sort((a, b) => a.i - b.i)
    .map((x) => x.k)
}

/** Reads a typed date: the locale's numeric order with any separator ("14/10/2026", "14.10.26",
 *  "14 10 2026"), ISO ("2026-10-14"), or the long forms ("Oct 14, 2026", "14 oct. 2026"). */
function parseTypedDate(text: string, locale?: Locale): Date | undefined {
  const s = text.trim()
  if (!s) return undefined
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  const parts = iso ? null : s.split(/[^\d]+/).filter(Boolean)
  let y: number, m: number, d: number
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (parts?.length === 3 && /^[\d\s./-]+$/.test(s)) {
    const order = dateOrder(locale)
    const get = (k: 'd' | 'm' | 'y') => Number(parts[order.indexOf(k)])
    ;[y, m, d] = [get('y'), get('m'), get('d')]
    if (y < 100) y += 2000
  } else {
    for (const pattern of ['PP', 'PPP', 'P']) {
      const date = parse(s, pattern, new Date(), { locale })
      if (isValid(date)) return date
    }
    return undefined
  }
  const date = new Date(y, m - 1, d)
  // Rejects 31/02 and the like, which Date would roll over to March.
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    ? date
    : undefined
}

function DatePicker({
  value,
  defaultValue,
  onValueChange,
  placeholder,
  formatString = 'PPP',
  locale,
  disabled,
  className,
  id,
  calendarProps,
  typing = false,
  onBlur,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: {
  value?: Date
  defaultValue?: Date
  onValueChange?: (date: Date | undefined) => void
  placeholder?: string
  /** date-fns format string for the trigger label ("PPP" = "Oct 28th, 2026"). */
  formatString?: string
  /** date-fns locale, used for the label and the calendar (e.g. `fr` from "date-fns/locale"). */
  locale?: Locale
  disabled?: boolean
  className?: string
  id?: string
  /** Passed to Calendar: disabled days, locale, startMonth / endMonth, captionLayout… */
  calendarProps?: Omit<React.ComponentProps<typeof Calendar>, 'mode' | 'selected' | 'onSelect'>
  /** Also accept a typed date (text input + calendar button). The label uses the short form ("P"). */
  typing?: boolean
  onBlur?: () => void
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-label'?: string
  'aria-describedby'?: string
}) {
  const i18n = useCoreloomI18n()
  placeholder ??= i18n.messages.datePicker.placeholder
  locale ??= i18n.dateLocale as Locale | undefined
  const [open, setOpen] = React.useState(false)
  const [inner, setInner] = React.useState<Date | undefined>(defaultValue)
  const current = value ?? inner

  const pick = (next: Date | undefined) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
    setOpen(false)
  }

  if (typing) {
    return (
      <TypedDatePicker
        current={current}
        commit={(next) => {
          if (value === undefined) setInner(next)
          onValueChange?.(next)
        }}
        open={open}
        setOpen={setOpen}
        locale={locale}
        id={id}
        disabled={disabled}
        className={className}
        calendarProps={calendarProps}
        onBlur={onBlur}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
      />
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- the trigger stands in for the field's control; aria-invalid drives its error styling and is a global attribute in ARIA 1.1. */}
        <button
          type="button"
          id={id}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          onBlur={onBlur}
          disabled={disabled}
          data-slot="date-picker-trigger"
          data-placeholder={current ? undefined : ''}
          className={cn(
            'flex h-[42px] w-full cursor-pointer items-center gap-2.5 rounded-md border border-input bg-inset px-[13px] text-left font-sans text-[14px] whitespace-nowrap text-foreground transition-[border-color,box-shadow] duration-base ease-out outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 aria-expanded:border-primary aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive-subtle aria-invalid:focus-visible:ring-destructive/70 data-[placeholder]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0',
            className,
          )}
        >
          <CalendarIcon className="size-4 text-muted-foreground" />
          <span className="truncate">
            {current ? format(current, formatString, { locale }) : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={current}
          onSelect={pick}
          defaultMonth={current}
          autoFocus
          locale={locale}
          {...calendarProps}
        />
      </PopoverContent>
    </Popover>
  )
}

function TypedDatePicker({
  current,
  commit,
  open,
  setOpen,
  locale,
  id,
  disabled,
  className,
  calendarProps,
  onBlur,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: {
  current: Date | undefined
  commit: (date: Date | undefined) => void
  open: boolean
  setOpen: (open: boolean) => void
  locale?: Locale
  id?: string
  disabled?: boolean
  className?: string
  calendarProps?: Omit<React.ComponentProps<typeof Calendar>, 'mode' | 'selected' | 'onSelect'>
  onBlur?: () => void
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-label'?: string
  'aria-describedby'?: string
}) {
  const t = useCoreloomI18n().messages.datePicker
  const show = (d?: Date) => (d ? format(d, 'P', { locale }) : '')
  const [text, setText] = React.useState(() => show(current))
  const [unreadable, setUnreadable] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const hintId = React.useId()
  // Values this field sent itself; only changes from outside rewrite the text.
  const sent = React.useRef<Date | undefined | null>(null)
  const send = (date: Date | undefined) => {
    sent.current = date
    commit(date)
  }
  const hint = dateOrder(locale)
    .map((k) =>
      k === 'd' ? t.formatTokens.day : k === 'm' ? t.formatTokens.month : t.formatTokens.year,
    )
    .join(
      format(new Date(2026, 11, 31), 'P', { locale })
        .replace(/\d/g, '')
        .charAt(0) || '/',
    )

  // Follow outside changes (picked in the calendar, a form reset).
  React.useEffect(() => {
    if (sent.current !== null && sent.current?.getTime() === current?.getTime()) return
    setText(show(current))
    setUnreadable(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dates compare by time, not identity; show() is recreated each render.
  }, [current?.getTime(), locale])

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        data-slot="date-picker-input"
        data-disabled={disabled ? true : undefined}
        className="flex h-[42px] w-full items-center rounded-md border border-input bg-inset font-sans text-[14px] transition-[border-color,box-shadow] duration-base ease-out focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-[3px] has-[[aria-invalid=true]]:ring-destructive-subtle data-[disabled]:opacity-55"
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          placeholder={hint}
          disabled={disabled}
          aria-invalid={unreadable || ariaInvalid}
          aria-label={ariaLabel}
          aria-describedby={
            [unreadable ? hintId : undefined, ariaDescribedBy].filter(Boolean).join(' ') ||
            undefined
          }
          className="h-full min-w-0 flex-1 bg-transparent px-[13px] text-foreground tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          onChange={(e) => {
            setText(e.target.value)
            const date = parseTypedDate(e.target.value, locale)
            if (date) {
              setUnreadable(false)
              send(date)
            } else if (!e.target.value.trim()) send(undefined)
          }}
          onBlur={() => {
            const date = parseTypedDate(text, locale)
            if (date) setText(show(date))
            setUnreadable(!!text.trim() && !date)
            if (!date && text.trim()) send(undefined)
            onBlur?.()
          }}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={t.openCalendar}
              data-slot="date-picker-trigger"
              className="mr-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed"
            >
              <CalendarIcon className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={current}
              onSelect={(next) => {
                send(next)
                setText(show(next))
                setUnreadable(false)
                setOpen(false)
                requestAnimationFrame(() => inputRef.current?.focus())
              }}
              defaultMonth={current}
              autoFocus
              locale={locale}
              {...calendarProps}
            />
          </PopoverContent>
        </Popover>
      </div>
      {unreadable && (
        <p id={hintId} data-slot="date-picker-hint" className="m-0 text-[11px] text-destructive">
          {t.invalid(hint)}
        </p>
      )}
    </div>
  )
}

export { DatePicker, parseTypedDate }
