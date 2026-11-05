'use client'

// Coreloom UI — DurationInput. A length of time typed the way people say it: "1h30", "1:30",
// "90", "1.5 h", "45 min", "2 h 15". The value is a number of minutes; on blur the field shows it
// back in the locale ("1 h 30 min"). Arrow keys add or remove `step` minutes (default 15).
import { ClockIcon } from 'lucide-react'
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * Reads a typed duration as minutes: "1:30", "1h30", "1 h 30 min", "1.5h", "1,5 h", "90" (a bare
 * number is minutes), "2 hours 5 minutes", "1 Std. 20 Min.". Undefined when it can't be read.
 */
function parseDuration(text: string): number | undefined {
  const s = text.trim().toLowerCase()
  if (!s) return undefined
  const clock = /^(\d+):([0-5]?\d)$/.exec(s)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  if (/^\d+([.,]\d+)?$/.test(s)) return Math.round(Number(s.replace(',', '.')))
  // Pairs of a number and a unit word: hours start with h or "std", minutes with m.
  const parts = s.matchAll(/(\d+(?:[.,]\d+)?)\s*([a-zäöü]+\.?)?/g)
  let minutes = 0
  let seenHours = false
  let read = ''
  for (const [whole, n, unit = ''] of parts) {
    read += whole
    const amount = Number(n.replace(',', '.'))
    const u = unit.replace('.', '')
    if (/^(h|hr|hrs|hour|hours|heure|heures|hora|horas|std|stunde|stunden)$/.test(u)) {
      minutes += amount * 60
      seenHours = true
    } else if (/^(m|mn|min|mins|minute|minutes|minuto|minutos|minuten)$/.test(u)) {
      minutes += amount
    } else if (u === '' && seenHours) {
      // "1h30": the number after the hours is minutes.
      minutes += amount
    } else return undefined
  }
  // Anything left over ("1h and a bit") makes the text unreadable.
  if (read.replace(/\s/g, '') !== s.replace(/\s/g, '')) return undefined
  return Math.round(minutes)
}

/** Minutes as the locale writes a duration: "1 h 30 min", "45 min", "2 h". */
function formatMinutes(minutes: number, units: { hour: string; minute: string }) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} ${units.minute}`
  if (m === 0) return `${h} ${units.hour}`
  return `${h} ${units.hour} ${m} ${units.minute}`
}

function DurationInput({
  value,
  defaultValue = null,
  onValueChange,
  min = 0,
  max,
  step = 15,
  placeholder,
  disabled,
  id,
  name,
  className,
  onBlur,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  /** Minutes, or null when empty. */
  value?: number | null
  defaultValue?: number | null
  onValueChange?: (minutes: number | null) => void
  min?: number
  max?: number
  /** Minutes added or removed by the arrow keys (default 15). */
  step?: number
  placeholder?: string
  disabled?: boolean
  id?: string
  name?: string
  className?: string
  onBlur?: () => void
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const t = useCoreloomI18n().messages.inputs.duration
  const [inner, setInner] = React.useState<number | null>(defaultValue)
  const current = value !== undefined ? value : inner
  const show = (n: number | null) => (n === null ? '' : formatMinutes(n, t.units))
  const [text, setText] = React.useState(() => show(current))
  const [focused, setFocused] = React.useState(false)
  const [unreadable, setUnreadable] = React.useState(false)
  const hintId = React.useId()

  // A value set from outside shows up while the field isn’t being typed in (an unreadable text stays).
  const shown = focused || unreadable ? text : show(current)

  const commit = (n: number | null) => {
    const clamped = n === null ? null : Math.min(max ?? Infinity, Math.max(min, n))
    if (value === undefined) setInner(clamped)
    onValueChange?.(clamped)
    return clamped
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        data-slot="duration-input"
        data-disabled={disabled ? true : undefined}
        className="flex h-[42px] w-full items-center rounded-md border border-input bg-inset font-sans text-[14px] transition-[border-color,box-shadow] duration-base ease-out focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-[3px] has-[[aria-invalid=true]]:ring-destructive-subtle data-[disabled]:cursor-not-allowed data-[disabled]:opacity-55"
      >
        <ClockIcon aria-hidden className="ml-[13px] size-4 shrink-0 text-muted-foreground" />
        <input
          id={id}
          name={name}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={shown}
          placeholder={placeholder ?? t.placeholder}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-invalid={unreadable || ariaInvalid}
          aria-describedby={
            [unreadable ? hintId : undefined, ariaDescribedBy].filter(Boolean).join(' ') ||
            undefined
          }
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          onFocus={() => {
            setText(show(current))
            setFocused(true)
          }}
          onChange={(e) => {
            setText(e.target.value)
            setUnreadable(false)
            const n = parseDuration(e.target.value)
            if (n !== undefined) commit(n)
            else if (e.target.value.trim() === '') commit(null)
          }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
            e.preventDefault()
            const base = parseDuration(text) ?? current ?? 0
            const next = commit(base + (e.key === 'ArrowUp' ? step : -step))
            setText(show(next))
            setUnreadable(false)
          }}
          onBlur={() => {
            setFocused(false)
            const n = parseDuration(text)
            setUnreadable(text.trim() !== '' && n === undefined)
            if (n !== undefined) commit(n)
            onBlur?.()
          }}
        />
      </div>
      {unreadable && (
        <p id={hintId} data-slot="duration-input-hint" className="m-0 text-[11px] text-destructive">
          {t.invalid}
        </p>
      )}
    </div>
  )
}

export { DurationInput, formatMinutes, parseDuration }
