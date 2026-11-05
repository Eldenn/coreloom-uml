'use client'

// Coreloom UI — NumberRangeInput and TimeRangePicker. Two fields for the two ends of a range: a
// price filter (€20 – €80), an age bracket, opening hours (09:00 – 18:00), a shift. Each end is
// named ("Minimum", "Start"), either may be left empty, and an upside-down range is flagged under
// the fields instead of being swapped behind people's backs.
import * as React from 'react'

import { type NumberFormatOptions, NumberInput } from '@/components/ui/number-input'
import { TimePicker } from '@/components/ui/time-picker'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface NumberRange {
  min: number | null
  max: number | null
}

interface TimeRange {
  /** "HH:mm". */
  start?: string
  end?: string
}

/** Hint shown under a range whose ends are the wrong way round. */
function RangeHint({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} data-slot="range-hint" className="m-0 text-[11px] text-destructive">
      {children}
    </p>
  )
}

function NumberRangeInput({
  value,
  defaultValue = { min: null, max: null },
  onValueChange,
  min,
  max,
  step,
  formatOptions,
  minLabel,
  maxLabel,
  disabled,
  id,
  className,
  onBlur,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  value?: NumberRange
  defaultValue?: NumberRange
  onValueChange?: (range: NumberRange) => void
  /** Bounds for both ends. */
  min?: number
  max?: number
  step?: number
  formatOptions?: NumberFormatOptions
  /** Names of the two fields; default to the i18n "Minimum" and "Maximum". */
  minLabel?: string
  maxLabel?: string
  disabled?: boolean
  /** Goes on the first field, so a FieldLabel names the range from there. */
  id?: string
  className?: string
  onBlur?: () => void
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const t = useCoreloomI18n().messages.inputs.range
  const [inner, setInner] = React.useState(defaultValue)
  const current = value ?? inner
  const hintId = React.useId()
  const reversed = current.min !== null && current.max !== null && current.min > current.max
  const set = (next: NumberRange) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }
  const describedBy =
    [reversed ? hintId : undefined, ariaDescribedBy].filter(Boolean).join(' ') || undefined
  const common = {
    min,
    max,
    step,
    formatOptions,
    disabled,
    onBlur,
    stepper: 'none' as const,
    'aria-describedby': describedBy,
    'aria-invalid': reversed || ariaInvalid,
  }
  return (
    <div data-slot="number-range-input" className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center gap-2">
        <NumberInput
          {...common}
          id={id}
          value={current.min}
          aria-label={minLabel ?? t.min}
          placeholder={minLabel ?? t.min}
          onValueChange={(n) => {
            set({ ...current, min: n })
          }}
          className="min-w-0 flex-1 [&_input]:text-left"
        />
        <span aria-hidden className="text-muted-foreground">
          –
        </span>
        <NumberInput
          {...common}
          value={current.max}
          aria-label={maxLabel ?? t.max}
          placeholder={maxLabel ?? t.max}
          onValueChange={(n) => {
            set({ ...current, max: n })
          }}
          className="min-w-0 flex-1 [&_input]:text-left"
        />
      </div>
      {reversed && <RangeHint id={hintId}>{t.reversed}</RangeHint>}
    </div>
  )
}

function TimeRangePicker({
  value,
  defaultValue = {},
  onValueChange,
  step,
  min,
  max,
  overnight = false,
  startLabel,
  endLabel,
  disabled,
  id,
  className,
  onBlur,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  value?: TimeRange
  defaultValue?: TimeRange
  onValueChange?: (range: TimeRange) => void
  /** Minutes between the listed times (default 30). */
  step?: number
  /** First and last listed times ("08:00", "20:00"). */
  min?: string
  max?: string
  /** An end before the start means the next day (a night shift), not a mistake. */
  overnight?: boolean
  /** Names of the two fields; default to the i18n "Start" and "End". */
  startLabel?: string
  endLabel?: string
  disabled?: boolean
  /** Goes on the start field, so a FieldLabel names the range from there. */
  id?: string
  className?: string
  onBlur?: () => void
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const t = useCoreloomI18n().messages.inputs.range
  const [inner, setInner] = React.useState(defaultValue)
  const current = value ?? inner
  const hintId = React.useId()
  const nextDayId = React.useId()
  const backwards =
    current.start !== undefined && current.end !== undefined && current.end <= current.start
  const reversed = backwards && !overnight
  const set = (next: TimeRange) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }
  const describedBy =
    [reversed ? hintId : undefined, backwards && overnight ? nextDayId : undefined, ariaDescribedBy]
      .filter(Boolean)
      .join(' ') || undefined
  return (
    <div data-slot="time-range-picker" className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center gap-2">
        <TimePicker
          id={id}
          value={current.start}
          onValueChange={(start) => {
            set({ ...current, start })
          }}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onBlur={onBlur}
          aria-label={startLabel ?? t.start}
          aria-describedby={describedBy}
          aria-invalid={reversed || ariaInvalid}
          className="min-w-0 flex-1"
        />
        <span aria-hidden className="text-muted-foreground">
          –
        </span>
        <TimePicker
          value={current.end}
          onValueChange={(end) => {
            set({ ...current, end })
          }}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onBlur={onBlur}
          aria-label={endLabel ?? t.end}
          aria-describedby={describedBy}
          aria-invalid={reversed || ariaInvalid}
          className="min-w-0 flex-1"
        />
      </div>
      {reversed && <RangeHint id={hintId}>{t.endBeforeStart}</RangeHint>}
      {backwards && overnight && (
        <p id={nextDayId} className="m-0 text-[11px] text-muted-foreground">
          {t.nextDay}
        </p>
      )}
    </div>
  )
}

export { type NumberRange, NumberRangeInput, type TimeRange, TimeRangePicker }
